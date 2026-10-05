import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import { MAX_UPLOAD_BYTES } from "../../../../imports/lib/imageUploads";
import Documents from "../../../../imports/lib/models/Documents";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Settings from "../../../../imports/lib/models/Settings";
import createChatImageUpload from "../../../../imports/methods/createChatImageUpload";
import createDocumentImageUpload from "../../../../imports/methods/createDocumentImageUpload";
import insertDocumentImage from "../../../../imports/methods/insertDocumentImage";
import listDocumentSheets from "../../../../imports/methods/listDocumentSheets";
import getS3UploadParams, {
  isImageObjectUrl,
} from "../../../../imports/server/getS3UploadParams";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

const BUCKET = { bucketName: "jr-test-images", bucketRegion: "us-east-1" };
const BUCKET_URL = `https://s3.${BUCKET.bucketRegion}.amazonaws.com/${BUCKET.bucketName}/`;

describe("document images", function () {
  this.timeout(30000);

  let member: string;
  let outsider: string;
  let huntId: string;
  let puzzleId: string;
  let documentId: string;
  // A stand-in for both the Apps Script endpoint and any address someone
  // types in, recording every request it's sent.
  let server: Server;
  let requests: { method: string; url: string }[];
  let base: string;

  beforeEach(async function () {
    await resetDatabase("document images");
    member = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    outsider = await Accounts.createUserAsync({
      email: "outsider@example.com",
      password: "password",
    });
    huntId = await createTestHunt(member);
    await MeteorUsers.updateAsync(member, { $set: { hunts: [huntId] } });
    await asUser(member, async () => {
      puzzleId = await Puzzles.insertAsync({
        hunt: huntId,
        title: "Pictured",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      });
      documentId = await Documents.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        provider: "google",
        value: { type: "spreadsheet", id: "sheet" },
      });
    });

    requests = [];
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      requests.push({ method: req.method ?? "", url: req.url ?? "" });
      req.resume();
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, sheets: [{ id: 0, name: "One" }] }));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await Settings.insertAsync({
      name: "google.script",
      createdBy: member,
      value: {
        sharedSecret: "secret",
        scriptId: "script",
        contentHash: "hash",
        endpointUrl: `${base}/script`,
      },
    });
  });

  afterEach(async function () {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const insertLink = (userId: string, url: string) =>
    asUser(userId, () =>
      insertDocumentImage.callPromise({
        documentId,
        sheetId: 0,
        image: { source: "link", url },
      }),
    );

  it("lists sheets and inserts images for members of the document's hunt only", async function () {
    assert.deepEqual(
      await asUser(member, () =>
        listDocumentSheets.callPromise({ documentId }),
      ),
      [{ id: 0, name: "One" }],
    );
    await insertLink(member, "https://images.example.com/a.png");

    requests = [];
    await assert.isRejected(
      asUser(outsider, () => listDocumentSheets.callPromise({ documentId })),
      /not a member/,
    );
    await assert.isRejected(
      insertLink(outsider, "https://images.example.com/a.png"),
      /not a member/,
    );
    assert.isEmpty(requests);
  });

  it("never requests an address someone typed in, leaving it to the script", async function () {
    await insertLink(member, `${base}/internal/admin`);
    assert.deepEqual(requests, [{ method: "POST", url: "/script" }]);

    // Not even one made to look like it's in the image bucket
    await Settings.insertAsync({
      name: "s3.image_bucket",
      value: BUCKET,
      createdBy: member,
    });
    requests = [];
    await insertLink(member, `${base}/${BUCKET.bucketName}/x.png`);
    assert.deepEqual(requests, [{ method: "POST", url: "/script" }]);
  });

  it("tells the image bucket's addresses from everything else", function () {
    assert.isTrue(isImageObjectUrl(BUCKET, `${BUCKET_URL}hunt/doc/img.png`));
    for (const url of [
      `${BUCKET_URL}../other-bucket/x.png`,
      `${BUCKET_URL}%2e%2e/other-bucket/x.png`,
      `https://user@s3.us-east-1.amazonaws.com/${BUCKET.bucketName}/x.png`,
      `http://s3.us-east-1.amazonaws.com/${BUCKET.bucketName}/x.png`,
      `https://s3.us-east-1.amazonaws.com/${BUCKET.bucketName}-evil/x.png`,
      "https://images.example.com/x.png",
      "not a url",
    ]) {
      assert.isFalse(isImageObjectUrl(BUCKET, url), url);
    }
  });

  describe("upload policies", function () {
    // Credentials for signing; nothing is sent to AWS.
    const credentials = {
      AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
      AWS_SECRET_ACCESS_KEY: "secret",
    };
    let saved: Record<string, string | undefined>;

    beforeEach(async function () {
      saved = {};
      Object.entries(credentials).forEach(([name, value]) => {
        saved[name] = process.env[name];
        process.env[name] = value;
      });
      await Settings.insertAsync({
        name: "s3.image_bucket",
        value: BUCKET,
        createdBy: member,
      });
    });

    afterEach(function () {
      Object.entries(saved).forEach(([name, value]) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      });
    });

    const policyOf = (fields: Record<string, string>) =>
      JSON.parse(Buffer.from(fields.Policy!, "base64").toString("utf8")) as {
        expiration: string;
        conditions: unknown[];
      };

    it("allows up to 10 MB, for five minutes", async function () {
      const before = Date.now();
      const upload = (await getS3UploadParams("hunt/puzzle/id", "image/png"))!;
      const policy = policyOf(upload.fields);
      assert.deepInclude(policy.conditions, [
        "content-length-range",
        1,
        MAX_UPLOAD_BYTES,
      ]);
      assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
      const expires = new Date(policy.expiration).getTime();
      assert.isAtMost(expires, Date.now() + 5 * 60 * 1000);
      assert.isAtLeast(expires, before + 5 * 60 * 1000 - 1000);
    });

    it("keeps only plain characters of a filename in the key", async function () {
      // An S3 policy reads this as the uploaded file's own name
      const placeholder = ["$", "{filename}"].join("");
      const upload = (await asUser(member, () =>
        createDocumentImageUpload.callPromise({
          documentId,
          filename: `${placeholder} a#b?c%d/../e.png`,
          mimeType: "image/png",
        }),
      ))!;
      const key = upload.fields.key!;
      assert.match(key, new RegExp(`^${huntId}/${documentId}/[^/]+$`));
      assert.isTrue(key.endsWith("-__filename__a_b_c_d_.._e.png"), key);
      assert.equal(upload.publicUrl, `${BUCKET_URL}${key}`);

      const chat = (await asUser(member, () =>
        createChatImageUpload.callPromise({ puzzleId, mimeType: "image/png" }),
      ))!;
      assert.match(
        chat.fields.key!,
        new RegExp(`^${huntId}/${puzzleId}/[A-Za-z0-9]{17}$`),
      );
    });
  });
});
