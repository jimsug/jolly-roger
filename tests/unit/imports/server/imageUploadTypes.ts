import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import Documents from "../../../../imports/lib/models/Documents";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import createChatImageUpload from "../../../../imports/methods/createChatImageUpload";
import createDocumentImageUpload from "../../../../imports/methods/createDocumentImageUpload";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
import resetDatabase from "../../../lib/resetDatabase";

describe("image upload types", function () {
  this.timeout(30000);

  let userId: string;
  let puzzleId: string;
  let documentId: string;

  beforeEach(async function () {
    await resetDatabase("image upload types");
    userId = await Accounts.createUserAsync({
      email: "uploader@example.com",
      password: "password",
    });
    const huntId = await createTestHunt(userId);
    await MeteorUsers.updateAsync(userId, { $set: { hunts: [huntId] } });
    await asUser(userId, async () => {
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
  });

  // Each asks for an upload of the given type; with no image bucket set up,
  // an accepted type gets no upload rather than an error.
  const uploads = {
    createChatImageUpload: (mimeType: string) =>
      asUser(userId, () =>
        createChatImageUpload.callPromise({ puzzleId, mimeType }),
      ),
    createDocumentImageUpload: (mimeType: string) =>
      asUser(userId, () =>
        createDocumentImageUpload.callPromise({
          documentId,
          filename: "image",
          mimeType,
        }),
      ),
  };

  Object.entries(uploads).forEach(([name, upload]) => {
    describe(name, function () {
      it("accepts a PNG, JPEG or GIF", async function () {
        for (const mimeType of ["image/png", "image/jpeg", "image/gif"]) {
          assert.isUndefined(await upload(mimeType), mimeType);
        }
      });

      it("refuses an SVG or any other type", async function () {
        for (const mimeType of ["image/svg+xml", "image/webp", "text/html"]) {
          await assert.isRejected(
            upload(mimeType),
            /Only PNG, JPEG and GIF images/,
            mimeType,
          );
        }
      });
    });
  });
});
