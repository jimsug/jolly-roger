import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import APIKeys from "../../imports/lib/models/APIKeys";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import apiKeysForSelf from "../../imports/lib/publications/apiKeysForSelf";
import addHuntUser from "../../imports/methods/addHuntUser";
import createAPIKey from "../../imports/methods/createAPIKey";
import createHunt from "../../imports/methods/createHunt";
import createPuzzle from "../../imports/methods/createPuzzle";
import destroyPuzzle from "../../imports/methods/destroyPuzzle";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import resetDatabase from "../lib/resetDatabase";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const huntFields: EditableHuntType = {
    name: "Test Hunt",
    mailingLists: [],
    openSignups: false,
    hasGuessQueue: true,
    defaultRoles: [],
    allowUnlockablePuzzles: false,
    isArchived: false,
    customLinkEmbed: false,
  };

  const FIRST_URL = "https://example.com/puzzles/first";
  const SECOND_URL = "https://example.com/puzzles/second";
  const DELETED_URL = "https://example.com/puzzles/deleted";
  const UNKNOWN_URL = "https://example.com/puzzles/unknown";

  // Calls the REST API the way the browser extension does
  const callApi = (
    key: string | undefined,
    path: string,
    { method = "GET", body }: { method?: string; body?: string } = {},
  ) => {
    const headers: Record<string, string> = {};
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(Meteor.absoluteUrl(`api/${path}`), { method, headers, body });
  };

  const findByUrl = (key: string | undefined, huntId: string, url: string) =>
    callApi(key, `hunts/${huntId}/puzzles?${new URLSearchParams({ url })}`);

  const bulkCheck = (key: string | undefined, huntId: string, body: unknown) =>
    callApi(key, `hunts/${huntId}/puzzles/bulk-check`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  const puzzlePage = (huntId: string, puzzleId: string) =>
    Meteor.absoluteUrl(`hunts/${huntId}/puzzles/${puzzleId}`);

  describe("puzzle lookup API", function () {
    let huntId: string;
    let otherHuntId: string;
    let firstPuzzleId: string;
    let secondPuzzleId: string;
    let key: string;

    before(async function () {
      this.timeout(10000);
      await resetDatabase("puzzle lookup API");
      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);

      huntId = await createHunt.callPromise({ ...huntFields, initialTags: [] });
      await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
      // Creating a hunt doesn't join it, so this one's off limits
      otherHuntId = await createHunt.callPromise({
        ...huntFields,
        name: "Someone Else's Hunt",
        initialTags: [],
      });

      const newPuzzle = (title: string, url: string, hunt = huntId) =>
        createPuzzle.callPromise({
          huntId: hunt,
          title,
          url,
          tags: [],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
        });
      firstPuzzleId = await newPuzzle("First", FIRST_URL);
      secondPuzzleId = await newPuzzle("Second", SECOND_URL);
      const deletedPuzzleId = await newPuzzle("Deleted", DELETED_URL);
      await destroyPuzzle.callPromise({
        puzzleId: deletedPuzzleId,
        copySheetsToReplacement: false,
      });

      const keyId = await createAPIKey.callPromise({});
      const sub = await typedSubscribe.async(apiKeysForSelf);
      key = (await APIKeys.findOneAsync(keyId))!.key;
      sub.stop();
    });

    describe("GET /api/hunts/:huntId/puzzles", function () {
      it("finds the hunt's puzzles with a URL", async function () {
        const response = await findByUrl(key, huntId, FIRST_URL);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          puzzles: [
            {
              _id: firstPuzzleId,
              jollyRogerUrl: puzzlePage(huntId, firstPuzzleId),
            },
          ],
        });
      });

      it("finds nothing for unknown or deleted puzzles' URLs", async function () {
        for (const url of [UNKNOWN_URL, DELETED_URL, `${FIRST_URL}/`]) {
          const response = await findByUrl(key, huntId, url);
          assert.equal(response.status, 200, url);
          assert.deepEqual(await response.json(), { puzzles: [] }, url);
        }
      });

      it("needs an API key", async function () {
        assert.equal(
          (await findByUrl(undefined, huntId, FIRST_URL)).status,
          401,
        );
        assert.equal(
          (await findByUrl("x".repeat(32), huntId, FIRST_URL)).status,
          403,
        );
      });

      it("only answers for members of a hunt that exists", async function () {
        assert.equal(
          (await findByUrl(key, otherHuntId, FIRST_URL)).status,
          403,
        );
        assert.equal(
          (await findByUrl(key, "nonexistenthunt0", FIRST_URL)).status,
          404,
        );
      });

      it("rejects a missing or repeated url", async function () {
        assert.equal(
          (await callApi(key, `hunts/${huntId}/puzzles`)).status,
          400,
        );
        assert.equal(
          (await callApi(key, `hunts/${huntId}/puzzles?url=`)).status,
          400,
        );
        const repeated = new URLSearchParams([
          ["url", FIRST_URL],
          ["url", SECOND_URL],
        ]);
        assert.equal(
          (await callApi(key, `hunts/${huntId}/puzzles?${repeated}`)).status,
          400,
        );
      });
    });

    describe("POST /api/hunts/:huntId/puzzles/bulk-check", function () {
      it("maps each URL with a puzzle to its page", async function () {
        const response = await bulkCheck(key, huntId, {
          urls: [FIRST_URL, SECOND_URL, DELETED_URL, UNKNOWN_URL],
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          existing: {
            [FIRST_URL]: puzzlePage(huntId, firstPuzzleId),
            [SECOND_URL]: puzzlePage(huntId, secondPuzzleId),
          },
        });

        const empty = await bulkCheck(key, huntId, { urls: [] });
        assert.equal(empty.status, 200);
        assert.deepEqual(await empty.json(), { existing: {} });
      });

      it("needs an API key", async function () {
        assert.equal(
          (await bulkCheck(undefined, huntId, { urls: [FIRST_URL] })).status,
          401,
        );
      });

      it("only answers for members of a hunt that exists", async function () {
        assert.equal(
          (await bulkCheck(key, otherHuntId, { urls: [FIRST_URL] })).status,
          403,
        );
        assert.equal(
          (await bulkCheck(key, "nonexistenthunt0", { urls: [FIRST_URL] }))
            .status,
          404,
        );
      });

      it("rejects malformed bodies", async function () {
        for (const body of [
          {},
          { urls: FIRST_URL },
          { urls: [FIRST_URL, 42] },
          { urls: [FIRST_URL], hunt: huntId },
          [FIRST_URL],
        ]) {
          assert.equal(
            (await bulkCheck(key, huntId, body)).status,
            400,
            JSON.stringify(body),
          );
        }
        const notJson = await callApi(
          key,
          `hunts/${huntId}/puzzles/bulk-check`,
          { method: "POST", body: "{" },
        );
        assert.equal(notJson.status, 400);
      });
    });
  });
}
