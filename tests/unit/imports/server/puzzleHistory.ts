import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import ChatMessages from "../../../../imports/lib/models/ChatMessages";
import Guesses from "../../../../imports/lib/models/Guesses";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Tags from "../../../../imports/lib/models/Tags";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import {
  ACTIVITY_HISTORY_SUMMARIES,
  PUZZLE_HISTORY_SUMMARIES,
} from "../../../../imports/lib/puzzleHistory";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";
import waitForAssertion from "../../../lib/waitForAssertion";
import withWriteFence from "../../../lib/withWriteFence";

const SUMMARY = "PuzzleHistorySummary.publications.forUser";
const DETAIL = "Puzzles.publications.historyForUser";
const ACTIVITY = "ActivitySummary.publications.forUser";

describe("puzzle history publications", function () {
  this.timeout(30000);

  let selfId: string;
  let otherId: string;
  let adminId: string;
  let huntId: string;
  let otherHuntId: string;
  let puzzleId: string;
  let otherHuntPuzzleId: string;
  let tagId: string;

  const asUser = <T>(userId: string, fn: () => Promise<T>) =>
    DDP._CurrentMethodInvocation.withValue({ userId }, fn);

  let subs: StubSubscription[] = [];
  this.afterEach(function () {
    subs.forEach((sub) => sub.stop());
    subs = [];
  });
  const stub = (userId: string | null) => {
    const sub = new StubSubscription(userId);
    subs.push(sub);
    return sub;
  };

  this.beforeAll(async function () {
    await resetDatabase("puzzle history");
    selfId = await Accounts.createUserAsync({
      email: "self@example.com",
      password: "password",
    });
    otherId = await Accounts.createUserAsync({
      email: "other@example.com",
      password: "password",
    });
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await addUserToRole(adminId, GLOBAL_SCOPE, "admin");

    const newHunt = (name: string) =>
      asUser(selfId, () =>
        Hunts.insertAsync({
          name,
          mailingLists: [],
          openSignups: false,
          hasGuessQueue: true,
          defaultRoles: [],
          allowUnlockablePuzzles: false,
          isArchived: false,
          customLinkEmbed: false,
        }),
      );
    huntId = await newHunt("History hunt");
    otherHuntId = await newHunt("Hunt I left");
    await MeteorUsers.updateAsync(selfId, {
      $set: { displayName: "Self", hunts: [huntId] },
    });
    await MeteorUsers.updateAsync(otherId, {
      $set: { displayName: "Other", hunts: [huntId] },
    });
    await MeteorUsers.updateAsync(adminId, {
      $set: { displayName: "Admin", hunts: [] },
    });

    await asUser(selfId, async () => {
      tagId = await Tags.insertAsync({ hunt: huntId, name: "group:history" });
      puzzleId = await Puzzles.insertAsync({
        hunt: huntId,
        title: "Remembered",
        tags: [tagId],
        answers: ["RECALL"],
        expectedAnswerCount: 1,
      });
      otherHuntPuzzleId = await Puzzles.insertAsync({
        hunt: otherHuntId,
        title: "Forgotten",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
      });
      for (const puzzle of [puzzleId, otherHuntPuzzleId]) {
        await ChatMessages.insertAsync({
          hunt: puzzle === puzzleId ? huntId : otherHuntId,
          puzzle,
          content: { type: "message", children: [{ text: "hi" }] },
          sender: selfId,
          timestamp: new Date(Date.UTC(2026, 0, 5, 10, 30)),
        });
      }
      await Guesses.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        guess: "RECALL",
        state: "correct",
      });
    });
    // Someone else mentioning the user also counts as touching the puzzle
    await asUser(otherId, () =>
      ChatMessages.insertAsync({
        hunt: huntId,
        puzzle: puzzleId,
        content: {
          type: "message",
          children: [{ type: "mention", userId: selfId }, { text: " look" }],
        },
        sender: otherId,
        timestamp: new Date(Date.UTC(2026, 0, 5, 11, 0)),
      }),
    );
  });

  describe("puzzleHistorySummaryForUser", function () {
    it("summarises the user's own puzzles in the hunts they belong to", async function () {
      const sub = stub(selfId);
      await publishHandler(SUMMARY).call(sub, { userId: selfId });
      const summaries = sub.published(PUZZLE_HISTORY_SUMMARIES);
      assert.sameMembers(
        [...summaries.keys()],
        [puzzleId],
        "The puzzle in the hunt the user left isn't included",
      );
      const summary = summaries.get(puzzleId)!;
      assert.equal(summary.name, "Remembered");
      assert.equal(summary.huntName, "History hunt");
      assert.equal(summary.chatCounter, 2);
      assert.equal(summary.guessCounter, 1);
      assert.equal(summary.correctGuessCounter, 1);
      assert.equal(summary.interactionCount, 3);
      assert.equal(summary.solvedness, "solved");
      assert.deepEqual(summary.answers, ["RECALL"]);
      assert.deepEqual(summary.tags, ["group:history"]);
      assert.deepEqual(
        summary.firstInteraction,
        new Date(Date.UTC(2026, 0, 5, 10, 30)),
      );

      // New activity shows up live, and so does its removal
      let extraMessageId = "";
      await withWriteFence(async () => {
        extraMessageId = await asUser(selfId, () =>
          ChatMessages.insertAsync({
            hunt: huntId,
            puzzle: puzzleId,
            content: { type: "message", children: [{ text: "again" }] },
            sender: selfId,
            timestamp: new Date(),
          }),
        );
      });
      await waitForAssertion(() => {
        assert.equal(summaries.get(puzzleId)!.chatCounter, 3);
      });
      await withWriteFence(async () => {
        await asUser(selfId, () => ChatMessages.destroyAsync(extraMessageId));
      });
      await waitForAssertion(() => {
        assert.equal(summaries.get(puzzleId)!.chatCounter, 2);
      });
    });

    it("is only available to the user and to admins", async function () {
      const other = stub(otherId);
      assert.deepEqual(
        await publishHandler(SUMMARY).call(other, { userId: selfId }),
        [],
      );
      assert.isFalse(other.data.has(PUZZLE_HISTORY_SUMMARIES));

      const anonymous = stub(null);
      assert.deepEqual(
        await publishHandler(SUMMARY).call(anonymous, { userId: selfId }),
        [],
      );

      const admin = stub(adminId);
      await publishHandler(SUMMARY).call(admin, { userId: selfId });
      assert.sameMembers(
        [...admin.published(PUZZLE_HISTORY_SUMMARIES).keys()],
        [puzzleId],
      );
    });
  });

  describe("puzzleHistoryForUser", function () {
    it("publishes the user's activity on one puzzle", async function () {
      const cursors = await publishHandler(DETAIL).call(stub(selfId), {
        userId: selfId,
        puzzleId,
      });
      const docs = await Promise.all(
        cursors.map((cursor: { fetchAsync(): Promise<unknown[]> }) =>
          cursor.fetchAsync(),
        ),
      );
      // puzzle, tags, bookmarks, calls, chat, document activity, guesses
      assert.lengthOf(docs, 7);
      assert.lengthOf(docs[0], 1);
      assert.lengthOf(docs[1], 1);
      assert.lengthOf(docs[4], 2, "Messages sent by or mentioning the user");
      assert.lengthOf(docs[6], 1);
    });

    it("stays within the user's hunts and the user's own history", async function () {
      assert.deepEqual(
        await publishHandler(DETAIL).call(stub(selfId), {
          userId: selfId,
          puzzleId: otherHuntPuzzleId,
        }),
        [],
      );
      assert.deepEqual(
        await publishHandler(DETAIL).call(stub(otherId), {
          userId: selfId,
          puzzleId,
        }),
        [],
      );
      assert.lengthOf(
        await publishHandler(DETAIL).call(stub(adminId), {
          userId: selfId,
          puzzleId,
        }),
        7,
      );
    });
  });

  describe("activitySummaryForUser", function () {
    it("buckets the user's activity by day and hour", async function () {
      const sub = stub(selfId);
      await publishHandler(ACTIVITY).call(sub, { userId: selfId });
      assert.sameDeepMembers(
        [...sub.published(ACTIVITY_HISTORY_SUMMARIES).values()],
        [
          {
            _id: `${huntId}-1-10-Chat`,
            huntId,
            dayOfWeek: 1,
            hour: 10,
            type: "Chat",
            count: 1,
          },
        ],
        "The hunt the user left is excluded, and mentions aren't the user's activity",
      );

      const filtered = stub(selfId);
      await publishHandler(ACTIVITY).call(filtered, {
        userId: selfId,
        huntIds: [otherHuntId],
      });
      assert.isFalse(filtered.data.has(ACTIVITY_HISTORY_SUMMARIES));

      const other = stub(otherId);
      assert.deepEqual(
        await publishHandler(ACTIVITY).call(other, { userId: selfId }),
        [],
      );
    });

    it("publishes each bucket once however many documents it holds", async function () {
      const sameBucket = (minute: number) =>
        asUser(selfId, () =>
          ChatMessages.insertAsync({
            hunt: huntId,
            puzzle: puzzleId,
            content: { type: "message", children: [{ text: "more" }] },
            sender: selfId,
            timestamp: new Date(Date.UTC(2026, 0, 5, 10, minute)),
          }),
        );
      const extra = [await sameBucket(45)];
      try {
        const sub = stub(selfId);
        const calls = { added: 0, changed: 0 };
        const added = sub.added.bind(sub);
        const changed = sub.changed.bind(sub);
        sub.added = (collection, id, fields) => {
          calls.added += 1;
          added(collection, id, fields);
        };
        sub.changed = (collection, id, fields) => {
          calls.changed += 1;
          changed(collection, id, fields);
        };
        await publishHandler(ACTIVITY).call(sub, { userId: selfId });
        const bucket = sub
          .published(ACTIVITY_HISTORY_SUMMARIES)
          .get(`${huntId}-1-10-Chat`);
        assert.equal(bucket?.count, 2);
        assert.deepEqual(
          calls,
          { added: 1, changed: 0 },
          "The initial results arrive as one message per bucket",
        );

        // Live changes still come through as they happen
        await withWriteFence(async () => {
          extra.push(await sameBucket(50));
        });
        await waitForAssertion(() => {
          assert.equal(
            sub.published(ACTIVITY_HISTORY_SUMMARIES).get(`${huntId}-1-10-Chat`)
              ?.count,
            3,
          );
        });
        assert.deepEqual(calls, { added: 1, changed: 1 });
      } finally {
        await ChatMessages.removeAsync({ _id: { $in: extra } });
      }
    });
  });
});
