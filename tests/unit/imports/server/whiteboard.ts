import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import sinon from "sinon";
import FixtureHunt from "../../../../imports/FixtureHunt";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import mergeUsersJob from "../../../../imports/lib/jobs/mergeUsers";
import purgeHuntJob from "../../../../imports/lib/jobs/purgeHunt";
import ChatMessages, {
  contentFromMessage,
} from "../../../../imports/lib/models/ChatMessages";
import ChatNotifications from "../../../../imports/lib/models/ChatNotifications";
import Documents from "../../../../imports/lib/models/Documents";
import FeatureFlags from "../../../../imports/lib/models/FeatureFlags";
import Hunts from "../../../../imports/lib/models/Hunts";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import PuzzleNotifications from "../../../../imports/lib/models/PuzzleNotifications";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Servers from "../../../../imports/lib/models/Servers";
import Tags from "../../../../imports/lib/models/Tags";
import WhiteboardEdges from "../../../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../../../imports/lib/models/WhiteboardNodes";
import type { WhiteboardEditPolicy } from "../../../../imports/lib/models/Whiteboards";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import whiteboardPresence from "../../../../imports/lib/publications/whiteboardPresence";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  cardSlot,
  POINT_SIZE,
} from "../../../../imports/lib/whiteboard/layout";
import {
  MAX_BATCH,
  MAX_FRAME_DEPTH,
  MAX_NODES_PER_BOARD,
  MAX_WHITEBOARD_EDITORS,
} from "../../../../imports/lib/whiteboard/limits";
import addPuzzleTag from "../../../../imports/methods/addPuzzleTag";
import createWhiteboard from "../../../../imports/methods/createWhiteboard";
import deleteWhiteboardComment from "../../../../imports/methods/deleteWhiteboardComment";
import removePuzzleTag from "../../../../imports/methods/removePuzzleTag";
import renameTag from "../../../../imports/methods/renameTag";
import type { CommentAnchorInput } from "../../../../imports/methods/sendChatMessage";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import setWhiteboardCommentResolved from "../../../../imports/methods/setWhiteboardCommentResolved";
import setWhiteboardEditPolicy from "../../../../imports/methods/setWhiteboardEditPolicy";
import setWhiteboardLive from "../../../../imports/methods/setWhiteboardLive";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import upsertWhiteboardEdges from "../../../../imports/methods/upsertWhiteboardEdges";
import upsertWhiteboardNodes from "../../../../imports/methods/upsertWhiteboardNodes";
import addPuzzle from "../../../../imports/server/addPuzzle";
import GlobalHooks from "../../../../imports/server/GlobalHooks";
import { cleanupDeadServer } from "../../../../imports/server/garbage-collection";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import WhiteboardPresence from "../../../../imports/server/models/WhiteboardPresence";
import {
  deferSyncPuzzlesOnBoard,
  ensureWhiteboard,
  syncPuzzlesOnBoard,
} from "../../../../imports/server/whiteboard";
import {
  deleteEdges,
  deleteNodes,
  upsertEdges,
  upsertNodes,
} from "../../../../imports/server/whiteboardEdits";
import {
  removePresence,
  setLive,
} from "../../../../imports/server/whiteboardLive";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";
import runJob from "../../../lib/runJob";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";
import waitForAssertion from "../../../lib/waitForAssertion";

const huntId = FixtureHunt._id;

async function makeUser(email: string, roles?: string[]) {
  const userId = await Accounts.createUserAsync({
    email,
    password: "password",
  });
  if (roles) {
    await MeteorUsers.updateAsync(userId, {
      $set: { hunts: [huntId], roles: { [huntId]: roles } },
    });
  }
  return userId;
}

function fakeConnection() {
  const closers: (() => void)[] = [];
  return {
    connection: {
      id: Random.id(),
      onClose(cb: () => void) {
        closers.push(cb);
      },
    } as unknown as Meteor.Connection,
    close: () => closers.forEach((cb) => cb()),
  };
}

describe("whiteboard", function () {
  this.timeout(30000);

  // A live update with just a cursor
  const state = {
    cursor: { x: 1, y: 2 },
    drag: null,
    stroke: null,
  };

  let operator: string;
  let member: string;
  let outsider: string;

  beforeEach(async function () {
    await resetDatabase("whiteboard");
    operator = await makeUser("operator@example.com", ["operator"]);
    member = await makeUser("member@example.com", []);
    outsider = await makeUser("outsider@example.com");
    await makeFixtureHunt(operator);
  });

  describe("ensureWhiteboard", function () {
    it("seeds a frame per round, a card per puzzle and feeder arrows", async function () {
      const boardId = await ensureWhiteboard(operator, huntId);
      const board = await Whiteboards.findOneAsync(boardId);
      assert.ok(board);

      const backing = await Puzzles.findOneAsync(board.puzzle);
      assert.equal(backing?.kind, "whiteboard");
      assert.equal(backing?.expectedAnswerCount, 0);

      const cards = await WhiteboardNodes.find({
        board: boardId,
        type: "puzzle",
      }).fetchAsync();
      assert.equal(cards.length, FixtureHunt.puzzles.length);
      const frames = await WhiteboardNodes.find({
        board: boardId,
        type: "frame",
      }).fetchAsync();
      const frameIds = new Set(frames.map((f) => f._id));
      cards.forEach((card) => assert.isTrue(frameIds.has(card.parent!)));
      frames.forEach((frame) => {
        if (frame.parent) assert.isTrue(frameIds.has(frame.parent));
      });
      // A round's frame keeps its name, should its tag go
      const anger = FixtureHunt.tags.find((t) => t.name === "group:anger")!;
      assert.equal(frames.find((f) => f.tag === anger._id)?.label, "anger");

      const cardIds = new Set(cards.map((c) => c._id));
      const edges = await WhiteboardEdges.find({ board: boardId }).fetchAsync();
      assert.isAbove(edges.length, 0);
      edges.forEach((edge) => {
        assert.isTrue(edge.auto);
        assert.isTrue(cardIds.has(edge.source));
        assert.isTrue(cardIds.has(edge.target));
      });
    });

    it("returns the existing board on a second call", async function () {
      const first = await ensureWhiteboard(operator, huntId);
      const second = await ensureWhiteboard(operator, huntId);
      assert.equal(second, first);
      assert.equal(await Whiteboards.find({ hunt: huntId }).countAsync(), 1);
      assert.equal(
        await Puzzles.find({ hunt: huntId, kind: "whiteboard" }).countAsync(),
        1,
      );
      assert.equal(
        await WhiteboardNodes.find({
          board: first,
          type: "puzzle",
        }).countAsync(),
        FixtureHunt.puzzles.length,
      );
    });

    it("is for operators only", async function () {
      await assert.isRejected(ensureWhiteboard(member, huntId), /may not/);
      await assert.isRejected(ensureWhiteboard(outsider, huntId), /may not/);
      await assert.isRejected(
        asUser(member, () => createWhiteboard.callPromise({ huntId })),
        /may not/,
      );
      assert.equal(await Whiteboards.find({}).countAsync(), 0);

      const boardId = await asUser(operator, () =>
        createWhiteboard.callPromise({ huntId }),
      );
      assert.equal((await Whiteboards.findOneAsync(boardId))?.hunt, huntId);
    });

    it("doesn't create a document or announce the backing puzzle", async function () {
      const created = sinon.spy(GlobalHooks, "runPuzzleCreatedHooks");
      try {
        const boardId = await ensureWhiteboard(operator, huntId);
        // The creation hooks are deferred, and deferred callbacks run in
        // order, so by the time this one runs any the board deferred have.
        await new Promise<void>((resolve) => {
          Meteor.defer(resolve);
        });
        assert.isTrue(created.notCalled);

        const board = (await Whiteboards.findOneAsync(boardId))!;
        assert.equal(
          await Documents.find({ puzzle: board.puzzle }).countAsync(),
          0,
        );
        assert.equal(
          await PuzzleNotifications.find({
            puzzle: board.puzzle,
          }).countAsync(),
          0,
        );
        assert.equal(
          await ChatMessages.find({ puzzle: board.puzzle }).countAsync(),
          0,
        );
      } finally {
        created.restore();
      }
    });

    it("refuses while the whiteboard is switched off", async function () {
      await FeatureFlags.insertAsync({
        name: "disable.whiteboard",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(ensureWhiteboard(operator, huntId), /disabled/);
      assert.equal(await Puzzles.find({ kind: "whiteboard" }).countAsync(), 0);
    });

    it("refuses an archived hunt", async function () {
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(ensureWhiteboard(operator, huntId), /archived/);
      assert.equal(await Whiteboards.find({}).countAsync(), 0);
      assert.equal(await Puzzles.find({ kind: "whiteboard" }).countAsync(), 0);
    });
  });

  describe("placement", function () {
    let boardId: string;
    const groupTag = FixtureHunt.tags.find((t) => t.name === "group:anger")!;
    const otherGroupTag = FixtureHunt.tags.find((t) => t.name === "group:joy")!;

    const frameFor = async (tagId: string) =>
      (await WhiteboardNodes.findOneAsync({ board: boardId, tag: tagId }))!;
    const cardFor = async (puzzleId: string) =>
      (await WhiteboardNodes.findOneAsync({
        board: boardId,
        puzzle: puzzleId,
      }))!;
    const newPuzzle = (title: string, tags: string[], locked?: boolean) =>
      Puzzles.insertAsync({
        hunt: huntId,
        title,
        tags,
        answers: [],
        expectedAnswerCount: 1,
        ...(locked ? { locked } : {}),
        createdBy: operator,
      });

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
    });

    it("places puzzles created through addPuzzle, locked or not", async function () {
      await Hunts.updateAsync(huntId, {
        $set: { allowUnlockablePuzzles: true },
      });
      const opened = await asUser(operator, () =>
        addPuzzle({
          huntId,
          title: "Added",
          tags: ["group:anger"],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
        }),
      );
      // Locked puzzles skip the creation hooks until they're unlocked
      const locked = await asUser(operator, () =>
        addPuzzle({
          huntId,
          title: "Not yet",
          tags: ["group:anger"],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
          locked: true,
        }),
      );
      const frame = await frameFor(groupTag._id);
      await waitForAssertion(async () => {
        assert.equal((await cardFor(opened))?.parent, frame._id);
        assert.equal((await cardFor(locked))?.parent, frame._id);
      }, 5000);
    });

    it("gives each new puzzle its own slot, even all at once", async function () {
      const ids = await Promise.all(
        ["One", "Two", "Three", "Four"].map((title) =>
          newPuzzle(title, [groupTag._id]),
        ),
      );
      await Promise.all(ids.map((id) => syncPuzzlesOnBoard(huntId, [id])));
      const frame = await frameFor(groupTag._id);
      const siblings = await WhiteboardNodes.find({
        board: boardId,
        parent: frame._id,
      }).fetchAsync();
      const slots = new Set(
        siblings.map((n) => `${n.position.x},${n.position.y}`),
      );
      assert.equal(slots.size, siblings.length);
      for (const id of ids) {
        assert.equal((await cardFor(id)).parent, frame._id);
      }
      // The frame grew to fit them
      siblings.forEach((n) => {
        assert.isAtMost(n.position.x + (n.width ?? CARD_WIDTH), frame.width!);
        assert.isAtMost(
          n.position.y + (n.height ?? CARD_HEIGHT),
          frame.height!,
        );
      });
    });

    it("makes a frame for a new round, and an Ungrouped frame", async function () {
      const roundId = await Tags.insertAsync({
        hunt: huntId,
        name: "group:brand-new",
        createdBy: operator,
      });
      const inRound = await newPuzzle("In the round", [roundId]);
      const loose = await newPuzzle("Loose", []);
      await syncPuzzlesOnBoard(huntId, [inRound, loose]);

      const roundFrame = await frameFor(roundId);
      assert.equal(roundFrame.label, "brand-new");
      assert.equal(roundFrame.frameKind, "group");
      assert.notOk(roundFrame.parent);
      assert.equal((await cardFor(inRound)).parent, roundFrame._id);

      const ungrouped = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        frameKind: "ungrouped",
      }))!;
      assert.equal(ungrouped.label, "Ungrouped");
      assert.equal((await cardFor(loose)).parent, ungrouped._id);
    });

    it("moves untouched cards when their group changes, but not moved ones", async function () {
      const [first, second] = await Puzzles.find({
        hunt: huntId,
        tags: groupTag._id,
        kind: { $ne: "whiteboard" },
      }).fetchAsync();
      await upsertNodes(member, boardId, [
        { _id: (await cardFor(second!._id))._id, position: { x: 5, y: 5 } },
      ]);

      for (const puzzle of [first!, second!]) {
        await Puzzles.updateAsync(puzzle._id, {
          $set: { tags: [otherGroupTag._id] },
        });
      }
      await syncPuzzlesOnBoard(huntId, [first!._id, second!._id]);

      const otherFrame = await frameFor(otherGroupTag._id);
      assert.equal((await cardFor(first!._id)).parent, otherFrame._id);
      const moved = await cardFor(second!._id);
      assert.notEqual(moved.parent, otherFrame._id);
      assert.deepEqual(moved.position, { x: 5, y: 5 });
      assert.isTrue(moved.manual);
    });

    it("follows tags added and removed through the tag methods", async function () {
      const puzzleId = await newPuzzle("Retagged", []);
      await syncPuzzlesOnBoard(huntId, [puzzleId]);
      const ungrouped = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        frameKind: "ungrouped",
      }))!;
      assert.equal((await cardFor(puzzleId)).parent, ungrouped._id);

      await asUser(member, () =>
        addPuzzleTag.callPromise({ puzzleId, tagName: "group:joy" }),
      );
      const joy = await frameFor(otherGroupTag._id);
      await waitForAssertion(async () => {
        assert.equal((await cardFor(puzzleId)).parent, joy._id);
      }, 5000);

      await asUser(member, () =>
        removePuzzleTag.callPromise({ puzzleId, tagId: otherGroupTag._id }),
      );
      await waitForAssertion(async () => {
        assert.equal((await cardFor(puzzleId)).parent, ungrouped._id);
      }, 5000);
    });

    it("follows tags changed through the puzzle edit form", async function () {
      const puzzleId = await newPuzzle("Edited", [groupTag._id]);
      await syncPuzzlesOnBoard(huntId, [puzzleId]);
      await asUser(operator, () =>
        updatePuzzle.callPromise({
          puzzleId,
          title: "Edited",
          tags: ["group:joy"],
          expectedAnswerCount: 1,
        }),
      );
      const joy = await frameFor(otherGroupTag._id);
      await waitForAssertion(async () => {
        assert.equal((await cardFor(puzzleId)).parent, joy._id);
      }, 5000);
    });

    it("follows a tag renamed into a round", async function () {
      const tagId = await Tags.insertAsync({
        hunt: huntId,
        name: "someday-a-round",
        createdBy: operator,
      });
      const puzzleId = await newPuzzle("Renamed", [tagId]);
      await syncPuzzlesOnBoard(huntId, [puzzleId]);

      await asUser(member, () =>
        renameTag.callPromise({
          tagId,
          name: "group:renamed",
          keepOldNameAsAlias: false,
        }),
      );
      await waitForAssertion(async () => {
        const frame = await frameFor(tagId);
        assert.ok(frame);
        assert.equal((await cardFor(puzzleId)).parent, frame._id);
      }, 5000);
    });

    it("doesn't touch the tag or the board for a rename that changes nothing", async function () {
      const tag = (await Tags.findOneAsync(groupTag._id))!;
      const lookups = sinon.spy(Whiteboards, "findOneAsync");
      try {
        for (const keepOldNameAsAlias of [false, true, false]) {
          await asUser(member, () =>
            renameTag.callPromise({
              tagId: tag._id,
              name: ` ${tag.name} `,
              keepOldNameAsAlias,
            }),
          );
        }
        // Deferred callbacks run in order, so a sync any of those deferred
        // would have started by now
        await new Promise<void>((resolve) => {
          Meteor.defer(resolve);
        });
        assert.isFalse(lookups.calledWithMatch({ hunt: huntId }));
      } finally {
        lookups.restore();
      }
      const after = await Tags.findOneAsync(tag._id);
      assert.deepEqual(after?.updatedAt, tag.updatedAt);
      assert.deepEqual(after?.aliases, tag.aliases);
    });

    it("folds a burst of deferred syncs for a hunt into one", async function () {
      const ids = await Promise.all(
        ["One", "Two", "Three", "Four", "Five"].map((title) =>
          newPuzzle(title, [groupTag._id]),
        ),
      );
      const frame = await frameFor(groupTag._id);
      const lookups = sinon.spy(Whiteboards, "findOneAsync");
      try {
        ids.forEach((id) => deferSyncPuzzlesOnBoard(huntId, [id]));
        await waitForAssertion(async () => {
          for (const id of ids) {
            assert.equal((await cardFor(id))?.parent, frame._id);
          }
        }, 5000);
        assert.lengthOf(
          lookups.getCalls().filter((c) => c.calledWithMatch({ hunt: huntId })),
          1,
        );
      } finally {
        lookups.restore();
      }
    });

    it("drops feeder arrows when the tag goes, and keeps hidden ones hidden", async function () {
      const edge = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!;
      const feeder = (await Puzzles.findOneAsync(edge.feeder))!;

      await WhiteboardEdges.updateAsync(edge._id, { $set: { hidden: true } });
      await syncPuzzlesOnBoard(huntId, [feeder._id]);
      assert.isTrue((await WhiteboardEdges.findOneAsync(edge._id))?.hidden);

      await Puzzles.updateAsync(feeder._id, { $set: { tags: [] } });
      await syncPuzzlesOnBoard(huntId, [feeder._id]);
      assert.equal(
        await WhiteboardEdges.find({
          board: boardId,
          feeder: feeder._id,
        }).countAsync(),
        0,
      );
    });

    it("draws an arrow when a feeder joins a round with a meta", async function () {
      const meta = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!.meta!;
      const metaPuzzle = (await Puzzles.findOneAsync(meta))!;
      const metaFor = (
        await Tags.find({ _id: { $in: metaPuzzle.tags } }).fetchAsync()
      ).find((t) => t.name.startsWith("meta-for:"))!;
      const round = (await Tags.findOneAsync({
        hunt: huntId,
        name: `group:${metaFor.name.slice("meta-for:".length)}`,
      }))!;

      const feeder = await newPuzzle("Late feeder", [round._id]);
      await syncPuzzlesOnBoard(huntId, [feeder]);
      const edge = await WhiteboardEdges.findOneAsync({
        board: boardId,
        feeder,
        meta,
      });
      assert.ok(edge);
      assert.equal(edge.source, (await cardFor(feeder))._id);
      assert.equal(edge.target, (await cardFor(meta))._id);
    });

    it("grows each frame once when frames have ended up inside each other", async function () {
      // Only two moves racing each other can leave frames like this.
      const frame = await frameFor(groupTag._id);
      const other = await frameFor(otherGroupTag._id);
      await WhiteboardNodes.updateAsync(frame._id, {
        $set: { parent: other._id, width: 1, height: 1 },
      });
      await WhiteboardNodes.updateAsync(other._id, {
        $set: { parent: frame._id },
      });
      const puzzleId = await newPuzzle("In a loop", [groupTag._id]);
      await syncPuzzlesOnBoard(huntId, [puzzleId]);
      assert.equal((await cardFor(puzzleId)).parent, frame._id);
    });

    it("leaves a card someone moves while it's being placed", async function () {
      const puzzleId = await newPuzzle("Dragged", [groupTag._id]);
      await syncPuzzlesOnBoard(huntId, [puzzleId]);
      const card = await cardFor(puzzleId);
      await Puzzles.updateAsync(puzzleId, {
        $set: { tags: [otherGroupTag._id] },
      });

      // The drag lands after placement has read the card, before it moves it.
      const update = sinon.stub(WhiteboardNodes, "updateAsync").callThrough();
      update
        .withArgs(sinon.match({ _id: card._id }))
        .callsFake(async (...args) => {
          await update.wrappedMethod.call(WhiteboardNodes, card._id, {
            $set: { position: { x: 5, y: 5 }, manual: true },
          });
          return update.wrappedMethod.apply(WhiteboardNodes, args);
        });
      try {
        await syncPuzzlesOnBoard(huntId, [puzzleId]);
      } finally {
        update.restore();
      }
      const saved = await cardFor(puzzleId);
      assert.equal(saved.parent, card.parent);
      assert.deepEqual(saved.position, { x: 5, y: 5 });
    });

    it("doesn't bring back a hidden card", async function () {
      const puzzle = (await Puzzles.findOneAsync({
        hunt: huntId,
        tags: groupTag._id,
      }))!;
      const card = await cardFor(puzzle._id);
      await deleteNodes(member, boardId, [card._id]);
      await syncPuzzlesOnBoard(huntId, [puzzle._id]);
      assert.isTrue((await WhiteboardNodes.findOneAsync(card._id))?.hidden);
    });

    it("keeps a new feeder out of a seeded round's meta row", async function () {
      const frame = await frameFor(groupTag._id);
      const metaRow = cardSlot(0).y;
      const inMetaRow = await WhiteboardNodes.find({
        board: boardId,
        parent: frame._id,
        "position.y": metaRow,
      }).fetchAsync();
      // The round's meta, with room beside it
      assert.isNotEmpty(inMetaRow);
      assert.isBelow(inMetaRow.length, 4);

      const feeder = await newPuzzle("Late feeder", [groupTag._id]);
      await syncPuzzlesOnBoard(huntId, [feeder]);
      const card = await cardFor(feeder);
      assert.equal(card.parent, frame._id);
      assert.isAbove(card.position.y, metaRow);
    });

    it("puts a round's metas on a row of their own, and later feeders below", async function () {
      const round = await Tags.insertAsync({
        hunt: huntId,
        name: "group:late-round",
        createdBy: operator,
      });
      const metaFor = await Tags.insertAsync({
        hunt: huntId,
        name: "meta-for:late-round",
        createdBy: operator,
      });
      const meta = await newPuzzle("Late meta", [round, metaFor]);
      await syncPuzzlesOnBoard(huntId, [meta]);
      assert.deepEqual((await cardFor(meta)).position, cardSlot(0));

      const feeder = await newPuzzle("Late round feeder", [round]);
      await syncPuzzlesOnBoard(huntId, [feeder]);
      assert.deepEqual((await cardFor(feeder)).position, cardSlot(4));

      // Another meta joins the first
      const second = await newPuzzle("Second meta", [round, metaFor]);
      await syncPuzzlesOnBoard(huntId, [second]);
      assert.deepEqual((await cardFor(second)).position, cardSlot(1));
      const frame = await frameFor(round);
      assert.equal((await cardFor(second)).parent, frame._id);
    });
  });

  describe("edits", function () {
    let boardId: string;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
    });

    it("records who made and edited a sticky, but not who moved it", async function () {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        { _id, type: "sticky", position: { x: 0, y: 0 }, text: "hello" },
      ]);
      await upsertNodes(operator, boardId, [{ _id, text: "hello there" }]);
      await upsertNodes(member, boardId, [{ _id, position: { x: 50, y: 50 } }]);

      const sticky = (await WhiteboardNodes.findOneAsync(_id))!;
      assert.deepEqual(
        sticky.contributors.map((c) => c.user),
        [member, operator],
      );
      assert.equal(sticky.text, "hello there");
      assert.equal(sticky.createdBy, member);
    });

    it("ignores contributors sent by the client", async function () {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        {
          _id,
          type: "sticky",
          position: { x: 0, y: 0 },
          contributors: [{ user: outsider, at: new Date() }],
        } as never,
      ]);
      const sticky = (await WhiteboardNodes.findOneAsync(_id))!;
      assert.deepEqual(
        sticky.contributors.map((c) => c.user),
        [member],
      );
      await assert.isRejected(
        asUser(member, () =>
          upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id,
                contributors: [{ user: outsider, at: new Date() }],
              } as never,
            ],
          }),
        ),
        /Unknown key/,
      );
    });

    it("caps the contributor log at 50", async function () {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        { _id, type: "sticky", position: { x: 0, y: 0 }, text: "0" },
      ]);
      for (let i = 1; i <= 55; i++) {
        await upsertNodes(member, boardId, [{ _id, text: `${i}` }]);
      }
      const sticky = (await WhiteboardNodes.findOneAsync(_id))!;
      assert.lengthOf(sticky.contributors, 50);
      // The creator is never dropped.
      assert.equal(sticky.contributors[0]!.user, member);
    });

    it("applies nothing from a batch that refers to a missing node", async function () {
      const kept = Random.id();
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { _id: kept, type: "sticky", position: { x: 0, y: 0 } },
          { _id: Random.id(), text: "edit to a node that's gone" },
        ]),
        /type and a position/,
      );
      assert.notOk(await WhiteboardNodes.findOneAsync(kept));
    });

    it("rejects people outside the hunt", async function () {
      await assert.isRejected(
        upsertNodes(outsider, boardId, [
          { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
        ]),
        /member/,
      );
      await assert.isRejected(deleteNodes(outsider, boardId, []), /member/);
      await assert.isRejected(upsertEdges(outsider, boardId, []), /member/);
      await assert.isRejected(deleteEdges(outsider, boardId, []), /member/);
    });

    it("rejects edits in an archived hunt", async function () {
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
        ]),
        /archived/,
      );
      await assert.isRejected(deleteNodes(operator, boardId, []), /archived/);
    });

    it("rejects nodes from another board", async function () {
      const _id = await WhiteboardNodes.insertAsync({
        hunt: huntId,
        board: Random.id(),
        type: "sticky",
        position: { x: 0, y: 0 },
        createdBy: member,
      });
      await assert.isRejected(
        upsertNodes(member, boardId, [{ _id, text: "hijack" }]),
        /another board/,
      );
      await deleteNodes(member, boardId, [_id]);
      assert.ok(await WhiteboardNodes.findOneAsync(_id));
    });

    it("only puts this hunt's puzzles on the board", async function () {
      const elsewhere = await Puzzles.insertAsync({
        hunt: Random.id(),
        title: "Another hunt's",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
        createdBy: operator,
      });
      const board = (await Whiteboards.findOneAsync(boardId))!;
      for (const puzzle of [elsewhere, board.puzzle]) {
        await assert.isRejected(
          upsertNodes(member, boardId, [
            {
              _id: Random.id(),
              type: "puzzle",
              puzzle,
              position: { x: 0, y: 0 },
            },
          ]),
          /Unknown puzzle/,
        );
      }
    });

    it("rejects out-of-range and oversized input", async function () {
      const sticky = { _id: Random.id(), type: "sticky" as const };
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { ...sticky, position: { x: 1e9, y: 0 } },
        ]),
        /out of range/,
      );
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { ...sticky, position: { x: Number.NaN, y: 0 } },
        ]),
        /out of range/,
      );
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { ...sticky, position: { x: 0, y: 0 }, width: 1e9 },
        ]),
        /Size out of range/,
      );
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { ...sticky, position: { x: 0, y: 0 }, text: "x".repeat(2001) },
        ]),
        /too long/,
      );
      await assert.isRejected(
        upsertNodes(member, boardId, [
          {
            _id: Random.id(),
            type: "ink",
            position: { x: 0, y: 0 },
            strokeWidth: "thin",
            points: Array.from({ length: 501 }, (_, i) => [i, 0, 0.5]),
          },
        ]),
        /too many/,
      );
      await assert.isRejected(
        upsertNodes(member, boardId, [{ ...sticky, _id: "not an id!" }]),
        /Invalid node id/,
      );
      // Through the method, check() refuses a point with the wrong arity
      await assert.isRejected(
        asUser(member, () =>
          upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: Random.id(),
                type: "ink",
                position: { x: 0, y: 0 },
                strokeWidth: "thin",
                points: [[1, 2]] as never,
              },
            ],
          }),
        ),
        /Match error/,
      );
      assert.equal(
        await WhiteboardNodes.find({
          board: boardId,
          type: { $in: ["sticky", "ink"] },
        }).countAsync(),
        0,
      );
    });

    it("caps the batch size and the size of a board", async function () {
      await assert.isRejected(
        upsertNodes(
          member,
          boardId,
          Array.from({ length: MAX_BATCH + 1 }, () => ({
            _id: Random.id(),
            type: "sticky" as const,
            position: { x: 0, y: 0 },
          })),
        ),
        /Too many nodes/,
      );

      const existing = await WhiteboardNodes.find({
        board: boardId,
      }).countAsync();
      await WhiteboardNodes.insertManyAsync(
        Array.from({ length: MAX_NODES_PER_BOARD - existing }, (_, i) => ({
          hunt: huntId,
          board: boardId,
          type: "text" as const,
          position: { x: i, y: 0 },
          createdBy: member,
        })),
      );
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
        ]),
        /board is full/,
      );
    });

    it("hides puzzle cards and seeded frames, and removes the rest", async function () {
      const card = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
        parent: { $exists: true },
      }))!;
      const seededFrame = (await WhiteboardNodes.findOneAsync(card.parent))!;
      const sticky = Random.id();
      await upsertNodes(member, boardId, [
        { _id: sticky, type: "sticky", position: { x: 0, y: 0 } },
      ]);

      await deleteNodes(member, boardId, [card._id, sticky]);
      assert.isTrue((await WhiteboardNodes.findOneAsync(card._id))?.hidden);
      assert.notOk(await WhiteboardNodes.findOneAsync(sticky));

      await deleteNodes(member, boardId, [seededFrame._id]);
      assert.isTrue(
        (await WhiteboardNodes.findOneAsync(seededFrame._id))?.hidden,
      );
      // Its cards moved out of it, keeping their place on the board
      assert.equal(
        await WhiteboardNodes.find({
          board: boardId,
          parent: seededFrame._id,
        }).countAsync(),
        0,
      );
      const freed = (await WhiteboardNodes.findOneAsync(card._id))!;
      assert.equal(freed.parent, seededFrame.parent);
      assert.deepEqual(freed.position, {
        x: card.position.x + seededFrame.position.x,
        y: card.position.y + seededFrame.position.y,
      });

      // Feeder arrows are hidden; drawn lines go
      const auto = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!;
      const a = Random.id();
      const b = Random.id();
      await upsertNodes(member, boardId, [
        { _id: a, type: "sticky", position: { x: 0, y: 0 } },
        { _id: b, type: "sticky", position: { x: 300, y: 0 } },
      ]);
      const drawn = Random.id();
      await upsertEdges(member, boardId, [
        { _id: drawn, source: a, target: b },
      ]);
      await deleteEdges(member, boardId, [auto._id, drawn]);
      assert.isTrue((await WhiteboardEdges.findOneAsync(auto._id))?.hidden);
      assert.notOk(await WhiteboardEdges.findOneAsync(drawn));
    });

    it("keeps a deleted frame's contents where they were", async function () {
      const frame = Random.id();
      const sticky = Random.id();
      await upsertNodes(member, boardId, [
        {
          _id: frame,
          type: "frame",
          position: { x: 100, y: 100 },
          width: 500,
          height: 500,
        },
      ]);
      await upsertNodes(member, boardId, [
        {
          _id: sticky,
          type: "sticky",
          position: { x: 10, y: 20 },
          parent: frame,
        },
      ]);
      await deleteNodes(member, boardId, [frame]);

      assert.notOk(await WhiteboardNodes.findOneAsync(frame));
      const moved = (await WhiteboardNodes.findOneAsync(sticky))!;
      assert.notOk(moved.parent);
      assert.deepEqual(moved.position, { x: 110, y: 120 });
    });

    it("moves a nested frame's contents into the frame around it", async function () {
      const outer = Random.id();
      const inner = Random.id();
      const sticky = Random.id();
      await upsertNodes(member, boardId, [
        { _id: outer, type: "frame", position: { x: 100, y: 100 } },
      ]);
      await upsertNodes(member, boardId, [
        {
          _id: inner,
          type: "frame",
          position: { x: 30, y: 40 },
          parent: outer,
        },
      ]);
      await upsertNodes(member, boardId, [
        {
          _id: sticky,
          type: "sticky",
          position: { x: 5, y: 6 },
          parent: inner,
        },
      ]);
      await deleteNodes(member, boardId, [inner]);
      const moved = (await WhiteboardNodes.findOneAsync(sticky))!;
      assert.equal(moved.parent, outer);
      assert.deepEqual(moved.position, { x: 35, y: 46 });
    });

    it("won't put a frame inside itself", async function () {
      const outer = Random.id();
      const inner = Random.id();
      await upsertNodes(member, boardId, [
        { _id: outer, type: "frame", position: { x: 0, y: 0 } },
      ]);
      await upsertNodes(member, boardId, [
        { _id: inner, type: "frame", position: { x: 0, y: 0 }, parent: outer },
      ]);
      await assert.isRejected(
        upsertNodes(member, boardId, [{ _id: outer, parent: inner }]),
        /itself/,
      );
    });

    it("won't nest anything more than MAX_FRAME_DEPTH frames deep", async function () {
      const chain = Array.from({ length: MAX_FRAME_DEPTH }, () => Random.id());
      await upsertNodes(
        member,
        boardId,
        chain.map((_id, i) => ({
          _id,
          type: "frame" as const,
          position: { x: 0, y: 0 },
          parent: chain[i - 1],
        })),
      );
      const deepest = chain.at(-1)!;
      const inner = Random.id();
      await upsertNodes(member, boardId, [
        {
          _id: inner,
          type: "frame",
          position: { x: 0, y: 0 },
          parent: deepest,
        },
      ]);
      await assert.isRejected(
        upsertNodes(member, boardId, [
          {
            _id: Random.id(),
            type: "sticky",
            position: { x: 0, y: 0 },
            parent: inner,
          },
        ]),
        /nested/,
      );

      // Wrapping the chain in one more frame would push its far end too deep
      const wrapper = Random.id();
      await upsertNodes(member, boardId, [
        { _id: wrapper, type: "frame", position: { x: 0, y: 0 } },
      ]);
      await assert.isRejected(
        upsertNodes(member, boardId, [{ _id: chain[0]!, parent: wrapper }]),
        /nested/,
      );
      assert.notOk((await WhiteboardNodes.findOneAsync(chain[0]))?.parent);
    });

    it("takes back a frame move that closes a loop with a concurrent one", async function () {
      const a = Random.id();
      const b = Random.id();
      await upsertNodes(member, boardId, [
        { _id: a, type: "frame", position: { x: 0, y: 0 } },
        { _id: b, type: "frame", position: { x: 500, y: 0 } },
      ]);
      // Another tab's move of b into a lands after this call has checked a's
      // new parent, but before its own write.
      const update = sinon.stub(WhiteboardNodes, "updateAsync").callThrough();
      update.onFirstCall().callsFake(async (...args) => {
        await update.wrappedMethod.call(WhiteboardNodes, b, {
          $set: { parent: a },
        });
        return update.wrappedMethod.apply(WhiteboardNodes, args);
      });
      try {
        await assert.isRejected(
          upsertNodes(member, boardId, [
            { _id: a, parent: b, position: { x: 10, y: 10 } },
          ]),
          /itself/,
        );
      } finally {
        update.restore();
      }
      const saved = (await WhiteboardNodes.findOneAsync(a))!;
      assert.notOk(saved.parent);
      assert.deepEqual(saved.position, { x: 0, y: 0 });
    });

    it("deletes a whole ink stroke when one segment goes", async function () {
      const stroke = Random.id();
      const segment = (x: number) => ({
        _id: Random.id(),
        type: "ink" as const,
        position: { x, y: 0 },
        strokeWidth: "thin" as const,
        stroke,
        points: [
          [0, 0, 0.5],
          [1, 1, 0.5],
        ] as [number, number, number][],
      });
      const a = segment(0);
      const b = segment(10);
      await upsertNodes(member, boardId, [a, b]);
      assert.deepEqual(
        (await WhiteboardNodes.findOneAsync(a._id))?.contributors.map(
          (c) => c.user,
        ),
        [member],
      );
      await deleteNodes(member, boardId, [a._id]);
      assert.equal(
        await WhiteboardNodes.find({ board: boardId, stroke }).countAsync(),
        0,
      );
    });

    it("only joins nodes on the same board with arrows", async function () {
      const a = Random.id();
      await upsertNodes(member, boardId, [
        { _id: a, type: "sticky", position: { x: 0, y: 0 } },
      ]);
      await assert.isRejected(
        upsertEdges(member, boardId, [
          { _id: Random.id(), source: a, target: Random.id() },
        ]),
        /this board/,
      );
    });

    it("keeps feeder arrows on their tags", async function () {
      const auto = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!;
      const sticky = Random.id();
      await upsertNodes(member, boardId, [
        { _id: sticky, type: "sticky", position: { x: 0, y: 0 } },
      ]);
      await assert.isRejected(
        upsertEdges(member, boardId, [{ _id: auto._id, target: sticky }]),
        /follow their tags/,
      );
      // Restyling one is fine, and isn't attributed to anyone
      await upsertEdges(member, boardId, [{ _id: auto._id, dashed: true }]);
      const saved = (await WhiteboardEdges.findOneAsync(auto._id))!;
      assert.isTrue(saved.dashed);
      assert.lengthOf(saved.contributors, 0);
    });

    it("puts back a hidden feeder arrow, and hides or unhides nothing else", async function () {
      const auto = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!;
      await deleteEdges(member, boardId, [auto._id]);
      assert.isTrue((await WhiteboardEdges.findOneAsync(auto._id))?.hidden);

      // Hiding goes through deleteEdges, not here
      await assert.isRejected(
        asUser(member, () =>
          upsertWhiteboardEdges.callPromise({
            boardId,
            edges: [{ _id: auto._id, hidden: true }],
          }),
        ),
        /Only a feeder arrow can be put back/,
      );

      const [a, b] = [Random.id(), Random.id()];
      await upsertNodes(member, boardId, [
        { _id: a, type: "sticky", position: { x: 0, y: 0 } },
        { _id: b, type: "sticky", position: { x: 300, y: 0 } },
      ]);
      const line = Random.id();
      await upsertEdges(member, boardId, [{ _id: line, source: a, target: b }]);
      await assert.isRejected(
        upsertEdges(member, boardId, [{ _id: line, hidden: false }]),
        /Only a feeder arrow can be put back/,
      );
      await assert.isRejected(
        upsertEdges(member, boardId, [
          { _id: Random.id(), source: a, target: b, hidden: false },
        ]),
        /Only a feeder arrow can be put back/,
      );
      // A refused batch writes nothing
      await assert.isRejected(
        upsertEdges(member, boardId, [
          { _id: auto._id, hidden: false },
          { _id: line, hidden: false },
        ]),
        /Only a feeder arrow can be put back/,
      );
      assert.isTrue((await WhiteboardEdges.findOneAsync(auto._id))?.hidden);

      await asUser(member, () =>
        upsertWhiteboardEdges.callPromise({
          boardId,
          edges: [{ _id: auto._id, hidden: false }],
        }),
      );
      const restored = (await WhiteboardEdges.findOneAsync(auto._id))!;
      assert.isUndefined(restored.hidden);
      assert.lengthOf(restored.contributors, 0);
    });
  });

  describe("lines", function () {
    let boardId: string;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
    });

    const sticky = async (x: number) => {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        { _id, type: "sticky", position: { x, y: 0 } },
      ]);
      return _id;
    };
    const point = async (x: number, size?: number) => {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        {
          _id,
          type: "point",
          position: { x, y: 0 },
          width: size,
          height: size,
        },
      ]);
      return _id;
    };
    const exists = async (id: string) =>
      !!(await WhiteboardNodes.findOneAsync(id));

    it("keeps a free end small whatever size is asked for", async function () {
      const p = await point(0, 500);
      const node = (await WhiteboardNodes.findOneAsync(p))!;
      assert.equal(node.width, POINT_SIZE);
      assert.equal(node.height, POINT_SIZE);
    });

    it("removes a free line's ends when the line is deleted", async function () {
      const a = await point(0);
      const b = await point(100);
      const line = Random.id();
      await upsertEdges(member, boardId, [{ _id: line, source: a, target: b }]);
      await deleteEdges(member, boardId, [line]);
      assert.isFalse(await exists(a));
      assert.isFalse(await exists(b));
    });

    it("removes a free end that's no longer used after re-attaching", async function () {
      const a = await sticky(0);
      const b = await sticky(300);
      const p = await point(100);
      const line = Random.id();
      await upsertEdges(member, boardId, [{ _id: line, source: a, target: p }]);
      await upsertEdges(member, boardId, [{ _id: line, target: b }]);
      assert.isFalse(await exists(p));
      assert.equal((await WhiteboardEdges.findOneAsync(line))?.target, b);
    });

    it("removes a dangling line with the thing it was attached to", async function () {
      const a = await sticky(0);
      const p = await point(100);
      const line = Random.id();
      await upsertEdges(member, boardId, [{ _id: line, source: a, target: p }]);
      await deleteNodes(member, boardId, [a]);
      assert.notOk(await WhiteboardEdges.findOneAsync(line));
      assert.isFalse(await exists(p));
    });

    it("won't join a line's end to its other end", async function () {
      const a = await sticky(0);
      const b = await sticky(300);
      const line = Random.id();
      await upsertEdges(member, boardId, [{ _id: line, source: a, target: b }]);
      await assert.isRejected(
        upsertEdges(member, boardId, [{ _id: line, target: a }]),
        /two different ends/,
      );
    });

    it("records who drew and restyled a line, but not who moved its ends", async function () {
      const a = await sticky(0);
      const b = await sticky(300);
      const c = await sticky(600);
      const line = Random.id();
      await upsertEdges(member, boardId, [
        { _id: line, source: a, target: b, pathStyle: "straight" },
      ]);
      await upsertEdges(operator, boardId, [
        { _id: line, arrowHead: "both", dashed: true },
      ]);
      const mover = await makeUser("mover@example.com", []);
      await upsertEdges(mover, boardId, [{ _id: line, target: c }]);
      const saved = (await WhiteboardEdges.findOneAsync(line))!;
      assert.deepEqual(
        saved.contributors.map((x) => x.user),
        [member, operator],
      );
      assert.equal(saved.pathStyle, "straight");
      assert.equal(saved.arrowHead, "both");
      assert.isTrue(saved.dashed);
    });
  });

  describe("live", function () {
    let boardId: string;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
    });

    it("keeps one document per connection and cleans up on close", async function () {
      const { connection, close } = fakeConnection();
      await setLive(member, connection, boardId, state);
      await setLive(member, connection, boardId, {
        ...state,
        cursor: { x: 3, y: 4 },
      });
      const docs = await WhiteboardPresence.find({
        connection: connection.id,
      }).fetchAsync();
      assert.lengthOf(docs, 1);
      assert.deepEqual(docs[0]!.cursor, { x: 3, y: 4 });
      assert.equal(docs[0]!.user, member);
      assert.equal(docs[0]!.hunt, huntId);

      close();
      // onClose removal isn't awaited by Meteor, so give it a moment.
      await waitForAssertion(async () => {
        assert.equal(
          await WhiteboardPresence.find({
            connection: connection.id,
          }).countAsync(),
          0,
        );
      }, 5000);
    });

    it("takes back an update that lands after its cleanup", async function () {
      const closing = fakeConnection();
      const leaving = fakeConnection();
      // One connection closes, and the other stops watching the board, while
      // an update of theirs is on its way to the database.
      const upsert = sinon
        .stub(WhiteboardPresence, "upsertAsync")
        .callThrough();
      upsert.onFirstCall().callsFake((...args) => {
        closing.close();
        return upsert.wrappedMethod.apply(WhiteboardPresence, args);
      });
      upsert.onSecondCall().callsFake(async (...args) => {
        await removePresence(boardId, leaving.connection.id);
        return upsert.wrappedMethod.apply(WhiteboardPresence, args);
      });
      try {
        await setLive(member, closing.connection, boardId, state);
        await setLive(member, leaving.connection, boardId, state);
      } finally {
        upsert.restore();
      }
      await waitForAssertion(async () => {
        assert.equal(await WhiteboardPresence.find({}).countAsync(), 0);
      }, 5000);

      // Later updates from a connection that's still open go through.
      await setLive(member, leaving.connection, boardId, state);
      assert.equal(await WhiteboardPresence.find({}).countAsync(), 1);
    });

    it("cleans up after a server that has gone away", async function () {
      const deadServer = await Servers.insertAsync({
        hostname: "gone.example.com",
        pid: 1,
        updatedAt: new Date(0),
      });
      await WhiteboardPresence.insertAsync({
        board: boardId,
        hunt: huntId,
        user: member,
        server: deadServer,
        connection: Random.id(),
        cursor: { x: 0, y: 0 },
      });
      await cleanupDeadServer(deadServer);
      assert.equal(
        await WhiteboardPresence.find({ server: deadServer }).countAsync(),
        0,
      );
    });

    it("publishes everyone else's presence, and forgets yours when you leave", async function () {
      const mine = new StubSubscription(member);
      Object.assign(mine, { connection: fakeConnection().connection });
      const theirs = fakeConnection();
      await setLive(member, mine.connection, boardId, state);
      await setLive(operator, theirs.connection, boardId, state);

      const cursor = await publishHandler(whiteboardPresence.name).call(mine, {
        boardId,
      });
      const published = await cursor.fetchAsync();
      assert.deepEqual(
        published.map((doc: { user: string }) => doc.user),
        [operator],
      );
      assert.notProperty(published[0], "server");
      assert.notProperty(published[0], "connection");

      mine.stop();
      await waitForAssertion(async () => {
        assert.equal(
          await WhiteboardPresence.find({
            connection: mine.connection.id,
          }).countAsync(),
          0,
        );
      }, 5000);
      await removePresence(boardId, theirs.connection.id);
      assert.equal(await WhiteboardPresence.find({}).countAsync(), 0);

      assert.deepEqual(
        await publishHandler(whiteboardPresence.name).call(
          new StubSubscription(outsider),
          { boardId },
        ),
        [],
      );
    });

    it("only writes the caller's own connection, through the method", async function () {
      const { connection } = fakeConnection();
      await assert.isRejected(
        asUser(member, () =>
          setWhiteboardLive.callPromise({ boardId, ...state }),
        ),
        /need a connection/,
      );
      await asUser(
        member,
        () => setWhiteboardLive.callPromise({ boardId, ...state }),
        connection,
      );
      const docs = await WhiteboardPresence.find({}).fetchAsync();
      assert.lengthOf(docs, 1);
      assert.equal(docs[0]!.connection, connection.id);
      assert.equal(docs[0]!.user, member);
    });

    it("does nothing while live updates are switched off", async function () {
      await FeatureFlags.insertAsync({
        name: "disable.whiteboard_live",
        type: "on",
        createdBy: operator,
      });
      await setLive(member, fakeConnection().connection, boardId, state);
      assert.equal(await WhiteboardPresence.find({}).countAsync(), 0);
      assert.deepEqual(
        await publishHandler(whiteboardPresence.name).call(
          new StubSubscription(member),
          { boardId },
        ),
        [],
      );
    });

    it("rejects people outside the hunt", async function () {
      await assert.isRejected(
        setLive(outsider, fakeConnection().connection, boardId, state),
        /member/,
      );
    });

    it("rejects out-of-range positions and foreign nodes", async function () {
      const { connection } = fakeConnection();
      await assert.isRejected(
        setLive(member, connection, boardId, {
          ...state,
          cursor: { x: Number.POSITIVE_INFINITY, y: 0 },
        }),
        /Invalid live update/,
      );
      await assert.isRejected(
        setLive(member, connection, boardId, {
          ...state,
          drag: [{ node: Random.id(), x: 0, y: 0 }],
        }),
        /on this board/,
      );
      await assert.isRejected(
        setLive(member, connection, boardId, {
          ...state,
          stroke: {
            color: "black",
            strokeWidth: "thin",
            points: Array.from(
              { length: 501 },
              (_, i) => [i, 0, 0.5] as [number, number, number],
            ),
          },
        }),
        /Invalid live update/,
      );
    });

    it("keeps the frame a drag is measured in", async function () {
      const { connection } = fakeConnection();
      const card = (
        await WhiteboardNodes.find({
          board: boardId,
          type: "puzzle",
        }).fetchAsync()
      ).find((n) => n.parent)!;
      await setLive(member, connection, boardId, {
        ...state,
        drag: [{ node: card._id, x: 5, y: 6, parent: card.parent }],
      });
      const doc = await WhiteboardPresence.findOneAsync({
        connection: connection.id,
      });
      assert.deepEqual(doc?.drag, [
        { node: card._id, x: 5, y: 6, parent: card.parent },
      ]);
      await assert.isRejected(
        setLive(member, connection, boardId, {
          ...state,
          drag: [{ node: card._id, x: 5, y: 6, parent: "not an id!" }],
        }),
      );
    });
  });

  describe("comments", function () {
    let boardId: string;
    let backingId: string;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
      backingId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
    });

    // Sends a chat message and returns it. Texts must be unique within a test.
    const send = async (
      userId: string,
      text: string,
      {
        puzzleId = backingId,
        mention,
        ...rest
      }: {
        puzzleId?: string;
        mention?: string;
        parentId?: string;
        comment?: CommentAnchorInput;
      } = {},
    ) => {
      const content = contentFromMessage(text);
      if (mention) {
        content.children.unshift({ type: "mention", userId: mention });
      }
      await asUser(userId, () =>
        sendChatMessage.callPromise({
          puzzleId,
          content: JSON.stringify(content),
          ...rest,
        }),
      );
      return (await ChatMessages.findOneAsync({
        puzzle: puzzleId,
        "content.children.text": text,
      }))!;
    };
    const reply = (userId: string, parentId: string, text: string) =>
      send(userId, text, { parentId });
    const reload = async (id: string) =>
      (await ChatMessages.findOneAllowingDeletedAsync(id))!;
    const setResolved = (
      userId: string,
      messageId: string,
      resolved: boolean,
    ) =>
      asUser(userId, () =>
        setWhiteboardCommentResolved.callPromise({ messageId, resolved }),
      );
    const deleteComment = (userId: string, messageId: string) =>
      asUser(userId, () => deleteWhiteboardComment.callPromise({ messageId }));
    const sticky = async (
      position: { x: number; y: number },
      parent?: string,
    ) => {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        { _id, type: "sticky", position, parent },
      ]);
      return _id;
    };

    it("pins a comment to a node or loose on the board", async function () {
      const node = await sticky({ x: 100, y: 100 });
      const pinned = await send(member, "on the sticky", {
        comment: { node, x: 5, y: 6 },
      });
      assert.deepEqual(pinned.comment, { node, x: 5, y: 6 });
      assert.notOk(pinned.thread);

      const loose = await send(member, "on the board", {
        comment: { x: -50, y: 70 },
      });
      assert.deepEqual(loose.comment, { x: -50, y: 70 });
    });

    it("doesn't treat a comment as a /pin command", async function () {
      const message = await send(member, "/unpin", {
        comment: { x: 0, y: 0 },
      });
      assert.ok(message.comment);
      assert.notOk(message.pinTs);
      const pinned = await send(member, "/pin look here", {
        comment: { x: 1, y: 1 },
      });
      assert.notOk(pinned.pinTs);
    });

    it("rejects comments from outside the hunt, in an archived hunt or with the whiteboard off", async function () {
      const comment = { x: 0, y: 0 };
      await assert.isRejected(
        send(outsider, "outsider", { comment }),
        /member/,
      );

      await FeatureFlags.insertAsync({
        name: "disable.whiteboard",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(send(member, "flag", { comment }), /disabled/);
      await FeatureFlags.removeAsync({ name: "disable.whiteboard" });

      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(
        send(member, "archived", { comment }),
        /archived/,
      );
      assert.equal(
        await ChatMessages.find({ puzzle: backingId }).countAsync(),
        0,
      );
    });

    it("only pins comments to the whiteboard's own puzzle", async function () {
      const ordinary = (await Puzzles.findOneAsync({
        hunt: huntId,
        kind: { $ne: "whiteboard" },
      }))!;
      await assert.isRejected(
        send(member, "not a board", {
          puzzleId: ordinary._id,
          comment: { x: 0, y: 0 },
        }),
        /Unknown whiteboard/,
      );
    });

    it("only pins to visible nodes on this board that can take a comment", async function () {
      const elsewhere = await WhiteboardNodes.insertAsync({
        hunt: huntId,
        board: Random.id(),
        type: "sticky",
        position: { x: 0, y: 0 },
        createdBy: member,
      });
      const card = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
      }))!;
      await deleteNodes(member, boardId, [card._id]);
      const ink = Random.id();
      await upsertNodes(member, boardId, [
        {
          _id: ink,
          type: "ink",
          position: { x: 0, y: 0 },
          strokeWidth: "thin",
          points: [
            [0, 0, 0.5],
            [1, 1, 0.5],
          ],
        },
      ]);

      for (const node of [elsewhere, card._id, ink, Random.id()]) {
        await assert.isRejected(
          send(member, `on ${node}`, { comment: { node, x: 0, y: 0 } }),
          /pinned there/,
        );
      }
      await assert.isRejected(
        send(member, "far away", { comment: { x: 2e6, y: 0 } }),
        /out of range/,
      );
    });

    it("won't start a thread on a reply", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      await assert.isRejected(
        send(member, "both", {
          parentId: root._id,
          comment: { x: 10, y: 10 },
        }),
        /reply/,
      );
    });

    it("won't take a reply to a deleted comment", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      await deleteComment(member, root._id);
      await assert.isRejected(
        reply(member, root._id, "too late"),
        /not on puzzle/,
      );
    });

    it("stamps every reply in a thread with its root", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      const first = await reply(operator, root._id, "first");
      const nested = await reply(member, first._id, "nested");
      const reaction = await reply(operator, nested._id, "👍");
      assert.equal(first.thread, root._id);
      assert.equal(nested.thread, root._id);
      assert.equal(reaction.thread, root._id);

      const plain = await send(member, "plain chat");
      const plainReply = await reply(operator, plain._id, "plain reply");
      assert.notOk(plainReply.thread);
    });

    it("reopens a resolved thread on a reply but not a reaction", async function () {
      const node = await sticky({ x: 0, y: 0 });
      const root = await send(member, "root", {
        comment: { node, x: 1, y: 2 },
      });

      await setResolved(operator, root._id, true);
      let saved = await reload(root._id);
      assert.ok(saved.comment?.resolvedAt);
      assert.equal(saved.comment?.resolvedBy, operator);
      assert.equal(saved.comment?.node, node);
      assert.equal(saved.comment?.x, 1);
      assert.equal(saved.comment?.y, 2);

      // Resolving again keeps the first resolution
      const firstResolvedAt = saved.comment?.resolvedAt;
      await setResolved(member, root._id, true);
      saved = await reload(root._id);
      assert.equal(saved.comment?.resolvedBy, operator);
      assert.deepEqual(saved.comment?.resolvedAt, firstResolvedAt);

      await reply(member, root._id, "🎉");
      assert.ok((await reload(root._id)).comment?.resolvedAt);

      await reply(member, root._id, "actually, not done");
      saved = await reload(root._id);
      assert.notOk(saved.comment?.resolvedAt);
      assert.notOk(saved.comment?.resolvedBy);

      await setResolved(member, root._id, true);
      await setResolved(member, root._id, false);
      assert.notOk((await reload(root._id)).comment?.resolvedAt);
    });

    it("won't take a reply in a thread on a board that can't be written", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      const first = await reply(operator, root._id, "first reply");
      const plain = await send(member, "plain chat");
      await setResolved(member, root._id, true);

      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(reply(member, root._id, "reopen"), /archived/);
      await assert.isRejected(reply(member, first._id, "deeper"), /archived/);
      await assert.isRejected(reply(member, root._id, "👍"), /archived/);
      // Chat outside the threads carries on as usual
      await reply(member, plain._id, "plain reply");
      await Hunts.updateAsync(huntId, { $set: { isArchived: false } });

      await FeatureFlags.insertAsync({
        name: "disable.whiteboard",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(reply(member, root._id, "flag"), /disabled/);

      assert.ok((await reload(root._id)).comment?.resolvedAt);
      assert.equal(
        await ChatMessages.find({ thread: root._id }).countAsync(),
        1,
      );
    });

    it("only resolves root comments, for anyone in the hunt", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      const replyMessage = await reply(operator, root._id, "a reply");
      const plain = await send(member, "plain chat");

      await assert.isRejected(setResolved(outsider, root._id, true), /member/);
      await assert.isRejected(
        setResolved(member, replyMessage._id, true),
        /Unknown comment/,
      );
      await assert.isRejected(
        setResolved(member, plain._id, true),
        /Unknown comment/,
      );
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(setResolved(member, root._id, true), /archived/);
      assert.notOk((await reload(root._id)).comment?.resolvedAt);
    });

    it("lets the author delete a comment until someone else replies", async function () {
      const other = await makeUser("other@example.com", []);
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      // Reactions and the author's own replies don't count.
      await reply(other, root._id, "👀");
      const own = await reply(member, root._id, "and another thing");

      await assert.isRejected(deleteComment(other, root._id), /author/);
      await assert.isRejected(deleteComment(outsider, root._id), /member/);
      await deleteComment(member, root._id);
      assert.isTrue((await reload(root._id)).deleted);
      assert.isTrue((await reload(own._id)).deleted);
      assert.equal(
        await ChatMessages.find({ thread: root._id }).countAsync(),
        0,
      );

      const second = await send(member, "second", { comment: { x: 0, y: 0 } });
      await reply(other, second._id, "a real reply");
      await assert.isRejected(deleteComment(member, second._id), /operator/);
    });

    it("lets an operator delete any comment along with its thread", async function () {
      const other = await makeUser("other@example.com", []);
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      const first = await reply(other, root._id, "first");
      const nested = await reply(member, first._id, "nested");
      assert.isAbove(
        await ChatNotifications.find({ thread: root._id }).countAsync(),
        0,
      );

      await deleteComment(operator, root._id);
      for (const id of [root._id, first._id, nested._id]) {
        assert.isTrue((await reload(id)).deleted);
      }
      assert.equal(
        await ChatNotifications.find({ thread: root._id }).countAsync(),
        0,
      );
    });

    it("leaves comments where they were when their node is deleted", async function () {
      const frame = Random.id();
      await upsertNodes(member, boardId, [
        {
          _id: frame,
          type: "frame",
          position: { x: 100, y: 200 },
          width: 500,
          height: 500,
        },
      ]);
      const nested = await sticky({ x: 10, y: 20 }, frame);
      const topLevel = await sticky({ x: 300, y: 400 });
      const onNested = await send(member, "on nested", {
        comment: { node: nested, x: 5, y: 6 },
      });
      const onTopLevel = await send(member, "on top level", {
        comment: { node: topLevel, x: 7, y: 8 },
      });

      await deleteNodes(member, boardId, [nested, topLevel]);
      assert.deepEqual((await reload(onNested._id)).comment, {
        x: 115,
        y: 226,
      });
      assert.deepEqual((await reload(onTopLevel._id)).comment, {
        x: 307,
        y: 408,
      });
    });

    it("keeps a comment on its node when only the frame around it goes", async function () {
      const frame = Random.id();
      await upsertNodes(member, boardId, [
        { _id: frame, type: "frame", position: { x: 100, y: 200 } },
      ]);
      const nested = await sticky({ x: 10, y: 20 }, frame);
      const onFrame = await send(member, "on frame", {
        comment: { node: frame, x: 1, y: 1 },
      });
      const onNested = await send(member, "on nested", {
        comment: { node: nested, x: 5, y: 6 },
      });

      await deleteNodes(member, boardId, [frame]);
      assert.deepEqual((await reload(onFrame._id)).comment, { x: 101, y: 201 });
      assert.deepEqual((await reload(onNested._id)).comment, {
        node: nested,
        x: 5,
        y: 6,
      });
    });

    it("leaves comments where they were when a puzzle card is hidden", async function () {
      const card = (
        await WhiteboardNodes.find({
          board: boardId,
          type: "puzzle",
        }).fetchAsync()
      ).find((n) => n.parent)!;
      let at = { ...card.position };
      for (let parent = card.parent; parent; ) {
        const frame = (await WhiteboardNodes.findOneAsync(parent))!;
        at = { x: at.x + frame.position.x, y: at.y + frame.position.y };
        parent = frame.parent;
      }
      const message = await send(member, "on the card", {
        comment: { node: card._id, x: 3, y: 4 },
      });
      await deleteNodes(member, boardId, [card._id]);
      assert.isTrue((await WhiteboardNodes.findOneAsync(card._id))?.hidden);
      assert.deepEqual((await reload(message._id)).comment, {
        x: at.x + 3,
        y: at.y + 4,
      });
    });

    it("keeps a comment on the edge of a node that has shrunk when it goes", async function () {
      const node = await sticky({ x: 100, y: 100 });
      await upsertNodes(member, boardId, [
        { _id: node, type: "sticky", width: 200, height: 100 },
      ]);
      const message = await send(member, "near the corner", {
        comment: { node, x: 180, y: 90 },
      });
      await upsertNodes(member, boardId, [
        { _id: node, type: "sticky", width: 100, height: 50 },
      ]);
      await deleteNodes(member, boardId, [node]);
      assert.deepEqual((await reload(message._id)).comment, {
        x: 200,
        y: 150,
      });
    });

    it("notifies the comment's author and everyone who has replied", async function () {
      const replier = await makeUser("replier@example.com", []);
      const leaver = await makeUser("leaver@example.com", []);
      const reactor = await makeUser("reactor@example.com", []);
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      await reply(replier, root._id, "first");
      await reply(leaver, root._id, "second");
      await reply(reactor, root._id, "😀");
      await MeteorUsers.updateAsync(leaver, { $set: { hunts: [] } });

      const last = await reply(operator, root._id, "last");
      const notifications = await ChatNotifications.find({
        message: last._id,
      }).fetchAsync();
      assert.sameMembers(
        notifications.map((n) => n.user),
        [member, replier],
      );
      notifications.forEach((n) => {
        assert.equal(n.thread, root._id);
        assert.isFalse(n.mentioned);
        assert.isUndefined(n.dingwords);
      });
    });

    it("doesn't notify anyone about a reaction", async function () {
      const other = await makeUser("other@example.com", []);
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      await reply(operator, root._id, "first");
      const reaction = await reply(other, root._id, "👍");
      assert.equal(
        await ChatNotifications.find({ message: reaction._id }).countAsync(),
        0,
      );
    });

    it("sends one notification for a mention in a reply", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      const mention = await send(operator, " have a look", {
        parentId: root._id,
        mention: member,
      });
      const notifications = await ChatNotifications.find({
        message: mention._id,
      }).fetchAsync();
      assert.lengthOf(notifications, 1);
      assert.equal(notifications[0]!.user, member);
      assert.equal(notifications[0]!.thread, root._id);
      assert.isTrue(notifications[0]!.mentioned);
    });

    it("links a mention in a new comment to its thread", async function () {
      const root = await send(operator, " can you check this", {
        comment: { x: 0, y: 0 },
        mention: member,
      });
      const notification = await ChatNotifications.findOneAsync({
        message: root._id,
      });
      assert.equal(notification?.user, member);
      assert.equal(notification?.thread, root._id);
    });

    it("leaves ordinary chat on the board out of any thread", async function () {
      const message = await send(member, "just chatting");
      assert.notOk(message.comment);
      assert.notOk(message.thread);
      const mention = await send(operator, " hello", { mention: member });
      const notification = await ChatNotifications.findOneAsync({
        message: mention._id,
      });
      assert.equal(notification?.user, member);
      assert.isUndefined(notification?.thread);
    });
  });

  describe("purging and merging", function () {
    let boardId: string;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
    });

    it("purges the board with the hunt", async function () {
      const a = Random.id();
      const b = Random.id();
      await upsertNodes(member, boardId, [
        { _id: a, type: "sticky", position: { x: 0, y: 0 } },
        { _id: b, type: "sticky", position: { x: 300, y: 0 } },
      ]);
      await upsertEdges(member, boardId, [
        { _id: Random.id(), source: a, target: b },
      ]);
      await setLive(member, fakeConnection().connection, boardId, state);
      // Keep the purge away from Google Drive
      await FeatureFlags.insertAsync({
        name: "disable.google",
        type: "on",
        createdBy: operator,
      });

      await runJob(purgeHuntJob, { huntId }, { userId: operator });

      assert.equal(await Whiteboards.find({ hunt: huntId }).countAsync(), 0);
      assert.equal(
        await WhiteboardNodes.find({ hunt: huntId }).countAsync(),
        0,
      );
      assert.equal(
        await WhiteboardEdges.find({ hunt: huntId }).countAsync(),
        0,
      );
      assert.equal(
        await WhiteboardPresence.find({ hunt: huntId }).countAsync(),
        0,
      );
      assert.equal(
        await Puzzles.findAllowingDeleted({ hunt: huntId }).countAsync(),
        0,
      );
    });

    it("carries attribution over to the merged account and drops live state", async function () {
      const source = await makeUser("source@example.com", []);
      const target = await makeUser("target@example.com", []);
      const a = Random.id();
      const b = Random.id();
      await upsertNodes(source, boardId, [
        { _id: a, type: "sticky", position: { x: 0, y: 0 } },
        { _id: b, type: "sticky", position: { x: 300, y: 0 } },
      ]);
      await upsertNodes(target, boardId, [{ _id: a, text: "edited" }]);
      const line = Random.id();
      await upsertEdges(source, boardId, [{ _id: line, source: a, target: b }]);
      const backingId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
      await asUser(member, () =>
        sendChatMessage.callPromise({
          puzzleId: backingId,
          content: JSON.stringify(contentFromMessage("look")),
          comment: { node: a, x: 1, y: 1 },
        }),
      );
      const root = (await ChatMessages.findOneAsync({ puzzle: backingId }))!;
      await asUser(source, () =>
        setWhiteboardCommentResolved.callPromise({
          messageId: root._id,
          resolved: true,
        }),
      );
      await setLive(source, fakeConnection().connection, boardId, state);

      await runJob(
        mergeUsersJob,
        { sourceUser: source, targetUser: target },
        { userId: target },
      );

      const sticky = (await WhiteboardNodes.findOneAsync(a))!;
      assert.equal(sticky.createdBy, target);
      assert.deepEqual(
        sticky.contributors.map((c) => c.user),
        [target, target],
      );
      const edge = (await WhiteboardEdges.findOneAsync(line))!;
      assert.equal(edge.createdBy, target);
      assert.deepEqual(
        edge.contributors.map((c) => c.user),
        [target],
      );
      assert.equal(
        (await ChatMessages.findOneAsync(root._id))?.comment?.resolvedBy,
        target,
      );
      assert.equal(await WhiteboardPresence.find({}).countAsync(), 0);
    });

    it("moves the merged account onto the editor list", async function () {
      const source = await makeUser("source@example.com", []);
      const target = await makeUser("target@example.com", []);
      await asUser(operator, () =>
        setWhiteboardEditPolicy.callPromise({
          boardId,
          editPolicy: "operatorsAndEditors",
          editors: [member, source],
        }),
      );

      await runJob(
        mergeUsersJob,
        { sourceUser: source, targetUser: target },
        { userId: target },
      );

      assert.sameMembers(
        (await Whiteboards.findOneAsync(boardId))?.editors ?? [],
        [member, target],
      );
    });
  });

  describe("edit policy", function () {
    let boardId: string;
    let backingId: string;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
      backingId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
    });

    const setPolicy = (
      userId: string,
      editPolicy: WhiteboardEditPolicy,
      editors: string[] = [],
    ) =>
      asUser(userId, () =>
        setWhiteboardEditPolicy.callPromise({ boardId, editPolicy, editors }),
      );
    const sticky = () => ({
      _id: Random.id(),
      type: "sticky" as const,
      position: { x: 0, y: 0 },
    });
    const editors = async () =>
      (await Whiteboards.findOneAsync(boardId))?.editors;
    const presenceOf = (connection: Meteor.Connection) =>
      WhiteboardPresence.findOneAsync({ connection: connection.id });
    const card = async () =>
      (await WhiteboardNodes.findOneAsync({ board: boardId, type: "puzzle" }))!;
    // A cursor, a drag and a stroke all at once
    const busy = async () => {
      const node = await card();
      return {
        cursor: { x: 1, y: 2 },
        drag: [{ node: node._id, x: 5, y: 6, parent: node.parent ?? null }],
        stroke: {
          color: "black" as const,
          strokeWidth: "thin" as const,
          points: [[0, 0, 0.5] as [number, number, number]],
        },
      };
    };

    it("refuses node edits, deletes and edge edits from non-editors", async function () {
      const a = sticky();
      const b = sticky();
      const line = Random.id();
      await upsertNodes(member, boardId, [a, b]);
      await upsertEdges(member, boardId, [
        { _id: line, source: a._id, target: b._id },
      ]);
      await setPolicy(operator, "operators");

      await assert.isRejected(
        upsertNodes(member, boardId, [sticky()]),
        /Only operators can edit/,
      );
      await assert.isRejected(
        deleteNodes(member, boardId, [a._id]),
        /Only operators can edit/,
      );
      await assert.isRejected(
        upsertEdges(member, boardId, [{ _id: line, label: "mine" }]),
        /Only operators can edit/,
      );
      await assert.isRejected(
        deleteEdges(member, boardId, [line]),
        /Only operators can edit/,
      );
      assert.ok(await WhiteboardNodes.findOneAsync(a._id));
      assert.notOk((await WhiteboardEdges.findOneAsync(line))?.label);

      await upsertNodes(operator, boardId, [sticky()]);
      await deleteEdges(operator, boardId, [line]);
    });

    it("lets listed people edit", async function () {
      const listed = await makeUser("listed@example.com", []);
      await setPolicy(operator, "operatorsAndEditors", [listed]);
      await upsertNodes(listed, boardId, [sticky()]);
      await upsertNodes(operator, boardId, [sticky()]);
      await assert.isRejected(
        upsertNodes(member, boardId, [sticky()]),
        /people they've chosen/,
      );
    });

    it("applies a policy change to the next edit", async function () {
      await upsertNodes(member, boardId, [sticky()]);
      await setPolicy(operator, "operators");
      await assert.isRejected(upsertNodes(member, boardId, [sticky()]));
      await setPolicy(operator, "members");
      await upsertNodes(member, boardId, [sticky()]);
    });

    it("lets anyone in the hunt comment, reply, react and resolve whatever the policy", async function () {
      await setPolicy(operator, "operators");
      const send = async (text: string, extra: object) => {
        await asUser(member, () =>
          sendChatMessage.callPromise({
            puzzleId: backingId,
            content: JSON.stringify(contentFromMessage(text)),
            ...extra,
          }),
        );
        return (await ChatMessages.findOneAsync({
          puzzle: backingId,
          "content.children.text": text,
        }))!;
      };
      const node = (await card())._id;
      const root = await send("on the card", { comment: { node, x: 1, y: 1 } });
      await send("a reply", { parentId: root._id });
      await send("👍", { parentId: root._id });
      assert.equal(
        await ChatMessages.find({ thread: root._id }).countAsync(),
        2,
      );
      await asUser(member, () =>
        setWhiteboardCommentResolved.callPromise({
          messageId: root._id,
          resolved: true,
        }),
      );
      assert.ok(
        (await ChatMessages.findOneAsync(root._id))?.comment?.resolvedAt,
      );
      await asUser(member, () =>
        setWhiteboardCommentResolved.callPromise({
          messageId: root._id,
          resolved: false,
        }),
      );
      assert.notOk(
        (await ChatMessages.findOneAsync(root._id))?.comment?.resolvedAt,
      );
    });

    it("keeps delete to authors and operators", async function () {
      await setPolicy(operator, "operators");
      const other = await makeUser("other@example.com", []);
      const comment = async (userId: string, text: string) => {
        await asUser(userId, () =>
          sendChatMessage.callPromise({
            puzzleId: backingId,
            content: JSON.stringify(contentFromMessage(text)),
            comment: { x: 0, y: 0 },
          }),
        );
        return (await ChatMessages.findOneAsync({
          puzzle: backingId,
          "content.children.text": text,
        }))!._id;
      };
      const remove = (userId: string, messageId: string) =>
        asUser(userId, () =>
          deleteWhiteboardComment.callPromise({ messageId }),
        );
      const mine = await comment(member, "mine");
      const theirs = await comment(other, "theirs");

      await assert.isRejected(remove(member, theirs), /author/);
      await remove(member, mine);
      await remove(operator, theirs);
      assert.equal(
        await ChatMessages.find({ puzzle: backingId }).countAsync(),
        0,
      );
    });

    it("drops live drags and strokes from non-editors but keeps the cursor", async function () {
      await setPolicy(operator, "operators");
      const live = await busy();
      const theirs = fakeConnection();
      const ours = fakeConnection();
      try {
        await setLive(member, theirs.connection, boardId, live);
        await setLive(operator, ours.connection, boardId, live);
        const doc = await presenceOf(theirs.connection);
        assert.deepEqual(doc?.cursor, live.cursor);
        assert.isNull(doc?.drag);
        assert.isNull(doc?.stroke);
        assert.deepEqual((await presenceOf(ours.connection))?.drag, live.drag);
        // Not even checked: a drag of something on another board is dropped
        // rather than refused.
        await setLive(member, theirs.connection, boardId, {
          ...live,
          drag: [{ node: Random.id(), x: 0, y: 0 }],
        });
      } finally {
        theirs.close();
        ours.close();
      }
    });

    it("drops live drags on an archived hunt", async function () {
      const live = await busy();
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      const { connection, close } = fakeConnection();
      try {
        await setLive(operator, connection, boardId, live);
        const doc = await presenceOf(connection);
        assert.deepEqual(doc?.cursor, live.cursor);
        assert.isNull(doc?.drag);
        assert.isNull(doc?.stroke);
      } finally {
        close();
      }
    });

    it("clears the live state of people who lose edit rights", async function () {
      const live = await busy();
      const theirs = fakeConnection();
      const ours = fakeConnection();
      try {
        await setLive(member, theirs.connection, boardId, live);
        await setLive(operator, ours.connection, boardId, live);
        assert.deepEqual(
          (await presenceOf(theirs.connection))?.drag,
          live.drag,
        );

        await setPolicy(operator, "operators");
        const doc = await presenceOf(theirs.connection);
        assert.deepEqual(doc?.cursor, live.cursor);
        assert.isNull(doc?.drag);
        assert.isNull(doc?.stroke);
        assert.deepEqual((await presenceOf(ours.connection))?.drag, live.drag);

        // and their next update keeps it that way
        await setLive(member, theirs.connection, boardId, live);
        assert.isNull((await presenceOf(theirs.connection))?.drag);
      } finally {
        theirs.close();
        ours.close();
      }
    });

    describe("setEditPolicy", function () {
      it("is for assigned operators and admins, not default-role operators", async function () {
        await assert.isRejected(
          setPolicy(member, "operators"),
          /assigned operators/,
        );
        await Hunts.updateAsync(huntId, {
          $set: { defaultRoles: ["operator"] },
        });
        await assert.isRejected(
          setPolicy(member, "operators"),
          /assigned operators/,
        );
        await assert.isRejected(setPolicy(outsider, "operators"), /member/);
        assert.isUndefined(
          (await Whiteboards.findOneAsync(boardId))?.editPolicy,
        );

        const admin = await makeUser("admin@example.com");
        await MeteorUsers.updateAsync(admin, {
          $set: { hunts: [huntId], roles: { [GLOBAL_SCOPE]: ["admin"] } },
        });
        await setPolicy(admin, "operators");
        assert.equal(
          (await Whiteboards.findOneAsync(boardId))?.editPolicy,
          "operators",
        );
        await setPolicy(operator, "members");
        assert.equal(
          (await Whiteboards.findOneAsync(boardId))?.editPolicy,
          "members",
        );
      });

      it("drops people who aren't in the hunt from the list at any tier", async function () {
        for (const policy of [
          "members",
          "operators",
          "operatorsAndEditors",
        ] as const) {
          await setPolicy(operator, policy, [member, outsider, Random.id()]);
          assert.deepEqual(await editors(), [member]);
        }
      });

      it("caps the list", async function () {
        const tooMany = Array.from({ length: MAX_WHITEBOARD_EDITORS + 1 }, () =>
          Random.id(),
        );
        await assert.isRejected(
          setPolicy(operator, "operatorsAndEditors", tooMany),
          /Too many/,
        );
        await assert.isRejected(
          setPolicy(operator, "operatorsAndEditors", ["not an id!"]),
          /Invalid user id/,
        );
        assert.isUndefined(await editors());
      });

      it("dedupes the list", async function () {
        await setPolicy(operator, "operatorsAndEditors", [
          member,
          member,
          operator,
          member,
        ]);
        assert.deepEqual(await editors(), [member, operator]);
      });

      it("refuses on an archived hunt or with the whiteboard off", async function () {
        await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
        await assert.isRejected(setPolicy(operator, "operators"), /archived/);
        await Hunts.updateAsync(huntId, { $set: { isArchived: false } });

        await FeatureFlags.insertAsync({
          name: "disable.whiteboard",
          type: "on",
          createdBy: operator,
        });
        await assert.isRejected(setPolicy(operator, "operators"), /disabled/);
        assert.isUndefined(
          (await Whiteboards.findOneAsync(boardId))?.editPolicy,
        );
      });
    });

    describe("live cache", function () {
      // Writes straight to the database, as another server would, so only
      // the observers can tell this one.
      const dropsDrags = async (
        userId: string,
        connection: Meteor.Connection,
        live: Awaited<ReturnType<typeof busy>>,
      ) => {
        await waitForAssertion(async () => {
          await setLive(userId, connection, boardId, live);
          assert.isNull((await presenceOf(connection))?.drag);
        }, 12000);
      };

      // Restricts the board to operators, and returns once this process's
      // board observer has dropped what it remembered. A test that caches
      // after this can't then be helped along by that observer arriving late.
      const restrictBoard = async () => {
        const live = await busy();
        const { connection, close } = fakeConnection();
        try {
          await setLive(member, connection, boardId, live);
          assert.deepEqual((await presenceOf(connection))?.drag, live.drag);
          await Whiteboards.updateAsync(boardId, {
            $set: { editPolicy: "operators" },
          });
          await dropsDrags(member, connection, live);
        } finally {
          close();
        }
      };

      it("forgets a board's cached access when its policy changes", async function () {
        await restrictBoard();
      });

      it("forgets a connection's cached access when its user is demoted", async function () {
        await restrictBoard();
        const live = await busy();
        const { connection, close } = fakeConnection();
        try {
          await setLive(operator, connection, boardId, live);
          assert.deepEqual((await presenceOf(connection))?.drag, live.drag);
          await MeteorUsers.updateAsync(operator, {
            $set: { [`roles.${huntId}`]: [] },
          });
          await dropsDrags(operator, connection, live);
        } finally {
          close();
        }
      });

      it("rereads a user's access once someone else has used the connection", async function () {
        await restrictBoard();
        const live = await busy();
        const { connection, close } = fakeConnection();
        try {
          await setLive(operator, connection, boardId, live);
          assert.deepEqual((await presenceOf(connection))?.drag, live.drag);
          // The connection now watches the member, so nothing here hears of
          // the operator's demotion.
          await setLive(member, connection, boardId, live);
          await MeteorUsers.updateAsync(operator, {
            $set: { [`roles.${huntId}`]: [] },
          });
          await setLive(operator, connection, boardId, live);
          assert.isNull((await presenceOf(connection))?.drag);
        } finally {
          close();
        }
      });

      it("forgets a hunt's boards when it is archived", async function () {
        const live = await busy();
        const { connection, close } = fakeConnection();
        try {
          await setLive(member, connection, boardId, live);
          assert.deepEqual((await presenceOf(connection))?.drag, live.drag);
          await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
          await dropsDrags(member, connection, live);
        } finally {
          close();
        }
      });
    });
  });
});
