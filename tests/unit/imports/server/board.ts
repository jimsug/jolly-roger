import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import Documents from "../../../../imports/lib/models/Documents";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Settings from "../../../../imports/lib/models/Settings";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import boardToken from "../../../../imports/methods/boardToken";
import ensureBoard from "../../../../imports/methods/ensureBoard";
import {
  BOARD_TOKEN_LIFETIME_MS,
  type BoardClaims,
} from "../../../../imports/server/board";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

const SECRET = "a shared secret at least thirty-two characters long";

// The service's side of the token, as hunt-board's server/token.ts has it:
// the signature is checked before the claims are looked at.
function verifyToken(token: string, secret: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Malformed token");
  }
  const [payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error("Bad token signature");
  }
  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as BoardClaims;
  if (claims.v !== 1) throw new Error("Unsupported token version");
  if (claims.exp <= now) throw new Error("Token expired");
  if (claims.exp > now + 5 * 60 * 1000) {
    throw new Error("Token expiry too far ahead");
  }
  return claims;
}

interface Request {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

describe("boards", function () {
  this.timeout(30000);

  let operator: string;
  let member: string;
  let outsider: string;
  let admin: string;
  let serviceUser: string;
  let huntId: string;
  let puzzleId: string;
  // Stands in for the board service, answering POST /boards with a board
  // named after the scope and recording every request
  let server: Server;
  let requests: Request[];
  let base: string;

  before(async function () {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => {
        raw += chunk.toString("utf8");
      });
      req.on("end", () => {
        requests.push({
          method: req.method ?? "",
          url: req.url ?? "",
          authorization: req.headers.authorization,
          body: raw ? JSON.parse(raw) : undefined,
        });
        if (req.headers.authorization !== `Bearer ${SECRET}`) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        if (req.method === "POST" && req.url === "/boards") {
          const { scope } = JSON.parse(raw) as {
            scope: { hunt: string; puzzle?: string };
          };
          const id = scope.puzzle ? `p${scope.puzzle}` : `h${scope.hunt}`;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ id, url: `${base}/boards/${id}` }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async function () {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });

  beforeEach(async function () {
    await resetDatabase("boards");
    requests = [];
    const user = (email: string) =>
      Accounts.createUserAsync({ email, password: "password" });
    operator = await user("operator@example.com");
    member = await user("member@example.com");
    outsider = await user("outsider@example.com");
    admin = await user("admin@example.com");
    serviceUser = await user("board@example.com");
    await MeteorUsers.updateAsync(admin, {
      $set: { roles: { [GLOBAL_SCOPE]: ["admin"] } },
    });
    await MeteorUsers.updateAsync(member, { $set: { displayName: "Member" } });
    huntId = await createTestHunt(admin);
    await MeteorUsers.updateAsync(
      { _id: { $in: [operator, member] } },
      { $set: { hunts: [huntId] } },
      { multi: true },
    );
    await addUserToRole(operator, huntId, "operator");
    puzzleId = await asUser(operator, () =>
      Puzzles.insertAsync({
        hunt: huntId,
        title: "A puzzle",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      }),
    );
    await asUser(admin, () =>
      Settings.insertAsync({
        name: "board.service",
        value: { url: base, secret: SECRET, serviceUserId: serviceUser },
      }),
    );
  });

  const ensure = (userId: string, puzzle?: string) =>
    asUser(userId, () =>
      ensureBoard.callPromise({
        huntId,
        ...(puzzle ? { puzzleId: puzzle } : {}),
      }),
    );
  const token = (userId: string, puzzle?: string) =>
    asUser(userId, () =>
      boardToken.callPromise({
        huntId,
        ...(puzzle ? { puzzleId: puzzle } : {}),
      }),
    );

  describe("ensureBoard", function () {
    it("creates the hunt's board once and hands back the same document after that", async function () {
      const first = await ensure(operator);
      const doc = await Documents.findOneAsync(first);
      assert.equal(doc?.provider, "board");
      assert.equal(doc?.hunt, huntId);
      assert.isUndefined(doc?.puzzle);
      assert.deepEqual(doc?.value, {
        id: `h${huntId}`,
        url: `${base}/boards/h${huntId}`,
      });

      const again = await ensure(admin);
      assert.equal(again, first);
      assert.lengthOf(requests, 1);
      assert.deepEqual(requests[0], {
        method: "POST",
        url: "/boards",
        authorization: `Bearer ${SECRET}`,
        body: { scope: { hunt: huntId } },
      });
    });

    it("gives a puzzle its own board", async function () {
      const huntBoard = await ensure(operator);
      const puzzleBoard = await ensure(operator, puzzleId);
      assert.notEqual(puzzleBoard, huntBoard);
      const doc = await Documents.findOneAsync(puzzleBoard);
      assert.equal(doc?.puzzle, puzzleId);
      assert.deepEqual(requests[1]?.body, {
        scope: { hunt: huntId, puzzle: puzzleId },
      });
      // A puzzle board doesn't stand in for the hunt's
      assert.equal(await ensure(operator), huntBoard);
      assert.lengthOf(requests, 2);
    });

    it("is for operators and admins, not members or outsiders", async function () {
      await assert.isRejected(ensure(member), /operator/);
      await assert.isRejected(ensure(outsider), /operator/);
      assert.lengthOf(requests, 0);
      assert.isUndefined(
        await Documents.findOneAsync({ hunt: huntId, provider: "board" }),
      );
    });

    it("refuses an archived hunt, a puzzle from another hunt, and an unknown hunt", async function () {
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(ensure(operator), /archived/);
      await Hunts.updateAsync(huntId, { $set: { isArchived: false } });
      await assert.isRejected(ensure(operator, "elsewhere"), /puzzle/);
      await assert.isRejected(
        asUser(admin, () => ensureBoard.callPromise({ huntId: "nowhere" })),
        /hunt/,
      );
      assert.lengthOf(requests, 0);
    });

    it("needs the service to be set up and the feature on", async function () {
      await asUser(admin, () =>
        FeatureFlags.insertAsync({ name: "disable.board", type: "on" }),
      );
      await assert.isRejected(ensure(operator), /set up/);
      await FeatureFlags.removeAsync({ name: "disable.board" });
      await Settings.removeAsync({ name: "board.service" });
      await assert.isRejected(ensure(operator), /set up/);
      assert.lengthOf(requests, 0);
    });

    it("passes on a refusal or an unusable answer from the service without storing anything", async function () {
      await Settings.updateAsync(
        { name: "board.service" },
        { $set: { "value.secret": "a different secret, so the stub refuses" } },
      );
      await assert.isRejected(ensure(operator), Meteor.Error);
      await Settings.updateAsync(
        { name: "board.service" },
        { $set: { "value.url": `${base}/nowhere` } },
      );
      await assert.isRejected(ensure(operator), Meteor.Error);
      assert.isUndefined(
        await Documents.findOneAsync({ hunt: huntId, provider: "board" }),
      );
    });
  });

  describe("boardToken", function () {
    it("signs the member's claims the way the service checks them", async function () {
      const before = Date.now();
      const claims = verifyToken(await token(member), SECRET);
      assert.deepEqual(claims, {
        v: 1,
        scope: { hunt: huntId },
        user: member,
        name: "Member",
        mayEdit: true,
        operator: false,
        assignedOperator: false,
        exp: claims.exp,
      });
      assert.isAtLeast(claims.exp, before + BOARD_TOKEN_LIFETIME_MS);
      assert.isAtMost(claims.exp, Date.now() + BOARD_TOKEN_LIFETIME_MS);
    });

    it("marks operators, names a puzzle's scope, and falls back to the email for a name", async function () {
      const claims = verifyToken(await token(operator, puzzleId), SECRET);
      assert.isTrue(claims.operator);
      assert.isTrue(claims.assignedOperator);
      assert.deepEqual(claims.scope, { hunt: huntId, puzzle: puzzleId });
      assert.equal(claims.name, "operator@example.com");
    });

    it("counts an operator by default role as an operator but not an assigned one", async function () {
      await Hunts.updateAsync(huntId, { $set: { defaultRoles: ["operator"] } });
      const claims = verifyToken(await token(member), SECRET);
      assert.isTrue(claims.operator);
      assert.isFalse(claims.assignedOperator);
    });

    it("counts an admin member as both", async function () {
      await MeteorUsers.updateAsync(admin, { $set: { hunts: [huntId] } });
      const claims = verifyToken(await token(admin), SECRET);
      assert.isTrue(claims.operator);
      assert.isTrue(claims.assignedOperator);
    });

    it("has the token expire, and refuse another secret", async function () {
      const minted = await token(member);
      assert.throws(
        () => verifyToken(minted, SECRET, Date.now() + BOARD_TOKEN_LIFETIME_MS),
        /expired/,
      );
      assert.throws(() => verifyToken(minted, "not the secret"), /signature/);
      const [payload, signature] = minted.split(".");
      const tampered = Buffer.from(
        JSON.stringify({
          ...(JSON.parse(
            Buffer.from(payload!, "base64url").toString("utf8"),
          ) as BoardClaims),
          operator: true,
        }),
      ).toString("base64url");
      assert.throws(
        () => verifyToken(`${tampered}.${signature}`, SECRET),
        /signature/,
      );
    });

    it("takes editing away once the hunt is archived", async function () {
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      const claims = verifyToken(await token(operator), SECRET);
      assert.isFalse(claims.mayEdit);
      assert.isTrue(claims.operator);
    });

    it("is for members only, admins included", async function () {
      await assert.isRejected(token(outsider), /member/);
      await assert.isRejected(token(admin), /member/);
      await assert.isRejected(token(member, "elsewhere"), /puzzle/);
    });

    it("needs the service to be set up and the feature on", async function () {
      await asUser(admin, () =>
        FeatureFlags.insertAsync({ name: "disable.board", type: "on" }),
      );
      await assert.isRejected(token(member), /set up/);
      await FeatureFlags.removeAsync({ name: "disable.board" });
      await Settings.removeAsync({ name: "board.service" });
      await assert.isRejected(token(member), /set up/);
    });
  });
});
