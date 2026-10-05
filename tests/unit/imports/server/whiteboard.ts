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
import Settings from "../../../../imports/lib/models/Settings";
import Tags from "../../../../imports/lib/models/Tags";
import WhiteboardEdges from "../../../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../../../imports/lib/models/WhiteboardNodes";
import type { WhiteboardEditPolicy } from "../../../../imports/lib/models/Whiteboards";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import WhiteboardVersions from "../../../../imports/lib/models/WhiteboardVersions";
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
  MAX_IMAGES_PER_BOARD,
  MAX_LIVE_SELECTION,
  MAX_NODES_PER_BOARD,
  MAX_WHITEBOARD_EDITORS,
} from "../../../../imports/lib/whiteboard/limits";
import addPuzzleTag from "../../../../imports/methods/addPuzzleTag";
import createWhiteboard from "../../../../imports/methods/createWhiteboard";
import deleteWhiteboardComment from "../../../../imports/methods/deleteWhiteboardComment";
import destroyPuzzle from "../../../../imports/methods/destroyPuzzle";
import placeWhiteboardCardsByTags from "../../../../imports/methods/placeWhiteboardCardsByTags";
import removePuzzleTag from "../../../../imports/methods/removePuzzleTag";
import renameTag from "../../../../imports/methods/renameTag";
import resetWhiteboardLayout from "../../../../imports/methods/resetWhiteboardLayout";
import type { CommentAnchorInput } from "../../../../imports/methods/sendChatMessage";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import setWhiteboardCommentResolved from "../../../../imports/methods/setWhiteboardCommentResolved";
import setWhiteboardEditPolicy from "../../../../imports/methods/setWhiteboardEditPolicy";
import setWhiteboardLive from "../../../../imports/methods/setWhiteboardLive";
import undestroyPuzzle from "../../../../imports/methods/undestroyPuzzle";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import upsertWhiteboardEdges from "../../../../imports/methods/upsertWhiteboardEdges";
import upsertWhiteboardNodes from "../../../../imports/methods/upsertWhiteboardNodes";
import addPuzzle from "../../../../imports/server/addPuzzle";
import GlobalHooks from "../../../../imports/server/GlobalHooks";
import { cleanupDeadServer } from "../../../../imports/server/garbage-collection";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import Locks from "../../../../imports/server/models/Locks";
import WhiteboardPresence from "../../../../imports/server/models/WhiteboardPresence";
import WhiteboardVersionChunks from "../../../../imports/server/models/WhiteboardVersionChunks";
import {
  deferSyncPuzzlesOnBoard,
  ensureWhiteboard,
  syncAutoEdges,
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
import {
  decodeVersion,
  restoreVersion,
} from "../../../../imports/server/whiteboardVersions";
import asUser from "../../../lib/asUser";
import createTestHunt from "../../../lib/createTestHunt";
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

    it("brings a round's cards back when its frame is put back", async function () {
      const added = await newPuzzle("Comes back", [groupTag._id]);
      await syncPuzzlesOnBoard(huntId, [added]);
      const frame = await frameFor(groupTag._id);
      const cards = await WhiteboardNodes.find({
        board: boardId,
        parent: frame._id,
        type: "puzzle",
      }).fetchAsync();
      const metaTag = FixtureHunt.tags.find(
        (t) => t.name === "meta-for:anger",
      )!;
      // The meta is placed by its meta-for: tag rather than the frame's own
      const meta = (await Puzzles.findOneAsync({ tags: metaTag._id }))!;
      assert.include(
        cards.map((c) => c.puzzle),
        meta._id,
      );
      // Cards whose puzzles placement would put in this frame rather than
      // another of their rounds'
      const frameTags = new Set(
        FixtureHunt.tags
          .filter(
            (t) => t.name.startsWith("group:") || t.name === "administrivia",
          )
          .map((t) => t._id),
      );
      const puzzles = await Puzzles.find({
        _id: { $in: cards.map((c) => c.puzzle!) },
      }).fetchAsync();
      const onlyHere = new Set(
        puzzles
          .filter(
            (p) =>
              p._id === meta._id ||
              p.tags.filter((t) => frameTags.has(t)).join(",") === groupTag._id,
          )
          .map((p) => p._id),
      );
      const moved = cards.find(
        (c) => c.puzzle !== meta._id && c.puzzle !== added,
      );
      const rest = cards.filter((c) => c !== moved && onlyHere.has(c.puzzle!));
      assert.isAtLeast(rest.length, 2);

      await deleteNodes(member, boardId, [frame._id]);
      assert.equal((await cardFor(moved!.puzzle!)).parent, frame.parent);
      // Moved by hand while the frame was gone, so it stays where it was put
      await upsertNodes(member, boardId, [
        { _id: moved!._id, position: { x: -5000, y: -5000 } },
      ]);
      await upsertNodes(member, boardId, [
        {
          _id: frame._id,
          hidden: false,
          parent: null,
          position: { x: 9000, y: 9000 },
        },
      ]);
      await waitForAssertion(async () => {
        for (const card of rest) {
          assert.equal((await cardFor(card.puzzle!)).parent, frame._id);
        }
      }, 5000);
      assert.equal((await cardFor(moved!.puzzle!)).parent, frame.parent);
    });

    describe("bringing a round back only when its frame is put back", function () {
      // A card taken out of its round's frame without being marked as moved
      // by hand, which a sync of its round would put straight back.
      const strayCard = async (frameId: string) => {
        const card = (await WhiteboardNodes.findOneAsync({
          board: boardId,
          parent: frameId,
          type: "puzzle",
        }))!;
        await WhiteboardNodes.updateAsync(card._id, {
          $set: { position: { x: -7000, y: -7000 } },
          $unset: { parent: 1 },
        });
        return card._id;
      };
      // Room for a deferred sync to have run, had one been asked for.
      const settle = () =>
        new Promise((resolve) => {
          setTimeout(resolve, 500);
        });

      it("leaves the cards for an edit to a frame that's on the board", async function () {
        const frame = await frameFor(groupTag._id);
        const card = await strayCard(frame._id);
        await upsertNodes(member, boardId, [
          {
            _id: frame._id,
            position: { x: frame.position.x + 100, y: frame.position.y },
          },
        ]);
        await settle();
        const after = await WhiteboardNodes.findOneAsync(card);
        assert.isUndefined(after?.parent);
        assert.deepEqual(after?.position, { x: -7000, y: -7000 });
      });

      it("leaves the cards when putting the frame back is refused", async function () {
        const frame = await frameFor(groupTag._id);
        const card = (await WhiteboardNodes.findOneAsync({
          board: boardId,
          parent: frame._id,
          type: "puzzle",
        }))!;
        // Its cards stay where they were, outside it
        await deleteNodes(member, boardId, [frame._id]);
        await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
        await assert.isRejected(
          upsertNodes(member, boardId, [
            { _id: frame._id, hidden: false, parent: null },
          ]),
          /archived/,
        );
        await settle();
        assert.isTrue((await WhiteboardNodes.findOneAsync(frame._id))?.hidden);
        assert.equal(
          (await WhiteboardNodes.findOneAsync(card._id))?.parent,
          frame.parent,
        );
      });
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

    it("places a card into a collapsed frame and grows it", async function () {
      const frame = await frameFor(groupTag._id);
      await upsertNodes(member, boardId, [{ _id: frame._id, collapsed: true }]);
      // More than a row's worth, so the frame needs another row
      const ids = [];
      for (const title of ["C1", "C2", "C3", "C4", "C5"]) {
        ids.push(await newPuzzle(title, [groupTag._id]));
      }
      await syncPuzzlesOnBoard(huntId, ids);
      for (const id of ids) {
        assert.equal((await cardFor(id)).parent, frame._id);
      }
      const grown = (await WhiteboardNodes.findOneAsync(frame._id))!;
      assert.isTrue(grown.collapsed);
      assert.isAbove(grown.height!, frame.height!);
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

  describe("deleted and replaced puzzles", function () {
    let boardId: string;
    let backingId: string;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
      backingId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
    });

    const cardFor = (puzzleId: string) =>
      WhiteboardNodes.findOneAsync({ board: boardId, puzzle: puzzleId });
    // A feeder with an arrow to its meta, and its card
    const feederWithArrow = async () => {
      const arrow = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!;
      const puzzle = (await Puzzles.findOneAsync(arrow.feeder))!;
      const card = (await cardFor(puzzle._id))!;
      return { arrow, puzzle, card };
    };
    const newPuzzle = (title: string, tags: string[]) =>
      Puzzles.insertAsync({
        hunt: huntId,
        title,
        tags,
        answers: [],
        expectedAnswerCount: 1,
        createdBy: operator,
      });
    const destroy = (puzzleId: string, replacedBy?: string) =>
      asUser(operator, () =>
        destroyPuzzle.callPromise({
          puzzleId,
          ...(replacedBy ? { replacedBy } : {}),
          copySheetsToReplacement: false,
        }),
      );
    const undestroy = (puzzleId: string) =>
      asUser(operator, () => undestroyPuzzle.callPromise({ puzzleId }));
    // A comment pinned to a node, 3 across and 4 down from its corner
    const pin = async (node: string, text: string) => {
      await asUser(member, () =>
        sendChatMessage.callPromise({
          puzzleId: backingId,
          content: JSON.stringify(contentFromMessage(text)),
          comment: { node, x: 3, y: 4 },
        }),
      );
      return (await ChatMessages.findOneAsync({
        puzzle: backingId,
        "content.children.text": text,
      }))!._id;
    };
    const anchorOf = async (messageId: string) =>
      (await ChatMessages.findOneAsync(messageId))?.comment;

    it("hands a replaced puzzle's card to its replacement, as it was", async function () {
      const { arrow, puzzle, card } = await feederWithArrow();
      await WhiteboardNodes.updateAsync(card._id, {
        $set: {
          manual: true,
          locked: true,
          lockedBy: operator,
          position: { x: card.position.x + 7, y: card.position.y + 9 },
        },
      });
      const before = (await WhiteboardNodes.findOneAsync(card._id))!;
      const comment = await pin(card._id, "on the old card");

      // The replacement already has a card, with a comment and a line
      const replacement = await newPuzzle("Replacement", puzzle.tags);
      await syncPuzzlesOnBoard(huntId, [replacement]);
      const theirs = (await cardFor(replacement))!;
      const theirComment = await pin(theirs._id, "on the new card");
      // and a free pin that came off it
      const freePin = await pin(theirs._id, "off the new card");
      await ChatMessages.updateAsync(freePin, {
        $set: { "comment.detachedFrom": theirs._id },
        $unset: { "comment.node": 1 },
      });
      const note = Random.id();
      const line = Random.id();
      await upsertNodes(member, boardId, [
        { _id: note, type: "sticky", position: { x: -900, y: -900 } },
      ]);
      await upsertEdges(member, boardId, [
        { _id: line, source: note, target: theirs._id },
      ]);

      await destroy(puzzle._id, replacement);
      await waitForAssertion(async () => {
        const cards = await WhiteboardNodes.find({
          board: boardId,
          puzzle: replacement,
        }).fetchAsync();
        assert.deepEqual(
          cards.map((c) => c._id),
          [card._id],
        );
        const arrows = await WhiteboardEdges.find({
          board: boardId,
          auto: true,
          $or: [{ feeder: puzzle._id }, { feeder: replacement }],
        }).fetchAsync();
        assert.deepEqual(
          arrows.map((a) => [a.feeder, a.meta, a.source, a.target, a.hidden]),
          [[replacement, arrow.meta, card._id, arrow.target, undefined]],
        );
      }, 5000);

      const after = (await WhiteboardNodes.findOneAsync(card._id))!;
      for (const field of [
        "position",
        "parent",
        "width",
        "height",
        "manual",
        "locked",
        "lockedBy",
        "hidden",
      ] as const) {
        assert.deepEqual(after[field], before[field], field);
      }
      assert.isUndefined(await cardFor(puzzle._id));
      assert.isUndefined(await WhiteboardNodes.findOneAsync(theirs._id));
      assert.equal((await anchorOf(comment))?.node, card._id);
      assert.equal((await anchorOf(theirComment))?.node, card._id);
      assert.equal((await anchorOf(freePin))?.detachedFrom, card._id);
      assert.equal(
        (await WhiteboardEdges.findOneAsync(line))?.target,
        card._id,
      );
    });

    it("gives a replacement placed at the same moment no card of its own", async function () {
      const { puzzle, card } = await feederWithArrow();
      const replacement = await newPuzzle("Racing replacement", puzzle.tags);
      await Promise.all([
        syncPuzzlesOnBoard(huntId, [replacement]),
        destroy(puzzle._id, replacement),
        syncPuzzlesOnBoard(huntId, [replacement]),
      ]);
      await waitForAssertion(async () => {
        const cards = await WhiteboardNodes.find({
          board: boardId,
          puzzle: replacement,
        }).fetchAsync();
        assert.deepEqual(
          cards.map((c) => [c._id, c.position, c.parent]),
          [[card._id, card.position, card.parent]],
        );
        assert.isUndefined(await cardFor(puzzle._id));
      }, 5000);
    });

    it("hides a deleted puzzle's card and arrows, and brings them back where they were", async function () {
      const { arrow, puzzle, card } = await feederWithArrow();
      const comment = await pin(card._id, "on the doomed card");

      await destroy(puzzle._id);
      await waitForAssertion(async () => {
        const hidden = await WhiteboardNodes.findOneAsync(card._id);
        assert.isTrue(hidden?.hidden);
        assert.isTrue(hidden?.hiddenWithPuzzle);
        assert.isTrue((await WhiteboardEdges.findOneAsync(arrow._id))?.hidden);
        const anchor = await anchorOf(comment);
        assert.isUndefined(anchor?.node);
        assert.equal(anchor?.detachedFrom, card._id);
      }, 5000);
      assert.deepEqual(
        (await WhiteboardNodes.findOneAsync(card._id))?.position,
        card.position,
      );

      // Nobody can put them back while the puzzle is deleted
      await assert.isRejected(
        upsertNodes(member, boardId, [{ _id: card._id, hidden: false }]),
        /deleted/,
      );
      await assert.isRejected(
        upsertEdges(member, boardId, [{ _id: arrow._id, hidden: false }]),
        /deleted/,
      );
      // and placing the meta leaves the arrow hidden rather than removing it
      await syncPuzzlesOnBoard(huntId, [arrow.meta!]);
      assert.isTrue((await WhiteboardEdges.findOneAsync(arrow._id))?.hidden);

      await undestroy(puzzle._id);
      await waitForAssertion(async () => {
        const back = (await WhiteboardNodes.findOneAsync(card._id))!;
        assert.isUndefined(back.hidden);
        assert.isUndefined(back.hiddenWithPuzzle);
        assert.deepEqual(back.position, card.position);
        assert.equal(back.parent, card.parent);
        const shown = await WhiteboardEdges.findOneAsync(arrow._id);
        assert.exists(shown);
        assert.isUndefined(shown.hidden);
        assert.isUndefined(shown.hiddenWithPuzzle);
        assert.deepEqual(await anchorOf(comment), {
          node: card._id,
          x: 3,
          y: 4,
        });
      }, 5000);
    });

    it("leaves a card someone took off the board off it when its puzzle comes back", async function () {
      const { arrow, puzzle, card } = await feederWithArrow();
      await deleteNodes(member, boardId, [card._id]);
      await deleteEdges(member, boardId, [arrow._id]);
      await destroy(puzzle._id);
      // As the deferred sync does, but known to have finished
      await syncPuzzlesOnBoard(huntId, [puzzle._id]);
      assert.isNotOk(
        (await WhiteboardNodes.findOneAsync(card._id))?.hiddenWithPuzzle,
      );
      await undestroy(puzzle._id);
      await syncPuzzlesOnBoard(huntId, [puzzle._id]);
      const after = (await WhiteboardNodes.findOneAsync(card._id))!;
      assert.isTrue(after.hidden);
      assert.isTrue((await WhiteboardEdges.findOneAsync(arrow._id))?.hidden);
    });

    it("leaves what someone put back and took off again off when its puzzle comes back", async function () {
      const { arrow, puzzle, card } = await feederWithArrow();
      await Puzzles.destroyAsync(puzzle._id);
      await syncPuzzlesOnBoard(huntId, [puzzle._id]);
      assert.isTrue(
        (await WhiteboardEdges.findOneAsync(arrow._id))?.hiddenWithPuzzle,
      );
      // Back, but before the sync that would show them again
      await Puzzles.undestroyAsync(puzzle._id);
      await upsertNodes(member, boardId, [{ _id: card._id, hidden: false }]);
      await upsertEdges(member, boardId, [{ _id: arrow._id, hidden: false }]);
      const shownArrow = await WhiteboardEdges.findOneAsync(arrow._id);
      assert.isUndefined(shownArrow?.hidden);
      assert.isUndefined(shownArrow?.hiddenWithPuzzle);
      await deleteNodes(member, boardId, [card._id]);
      await deleteEdges(member, boardId, [arrow._id]);
      await syncPuzzlesOnBoard(huntId, [puzzle._id]);

      for (const doc of [
        await WhiteboardNodes.findOneAsync(card._id),
        await WhiteboardEdges.findOneAsync(arrow._id),
      ]) {
        assert.isTrue(doc?.hidden);
        assert.isUndefined(doc?.hiddenWithPuzzle);
      }
    });

    it("leaves the arrows of a puzzle that's back before a sync of its delete gets to them", async function () {
      const { arrow, puzzle } = await feederWithArrow();
      await deleteEdges(member, boardId, [arrow._id]);
      const board = (await Whiteboards.findOneAsync(boardId))!;
      const tags = await Tags.find({ hunt: huntId }).fetchAsync();
      // As a sync that read the puzzle as deleted just before it came back
      await syncAutoEdges(board, [], tags, [puzzle._id]);
      const after = await WhiteboardEdges.findOneAsync(arrow._id);
      assert.isTrue(after?.hidden);
      assert.isUndefined(after?.hiddenWithPuzzle);
    });

    it("keeps a deleted puzzle's arrows off through a reset that puts things back", async function () {
      const arrows = await WhiteboardEdges.find({
        board: boardId,
        auto: true,
      }).fetchAsync();
      const metas = new Map<string, typeof arrows>();
      arrows.forEach((a) =>
        metas.set(a.meta!, [...(metas.get(a.meta!) ?? []), a]),
      );
      const [meta, [byHand, withPuzzle] = []] =
        [...metas].find(([, feeding]) => feeding.length >= 2) ?? [];
      assert.exists(meta, "a meta with two feeders");
      assert.exists(byHand);
      assert.exists(withPuzzle);
      // One is taken off by hand, and a card for a live puzzle too, which
      // put-back should bring back
      await deleteEdges(member, boardId, [byHand._id]);
      const other = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
        puzzle: { $nin: [meta, byHand.feeder!, withPuzzle.feeder!] },
      }))!;
      await deleteNodes(member, boardId, [other._id]);
      await Puzzles.destroyAsync(meta);
      await syncPuzzlesOnBoard(huntId, [meta]);
      assert.isTrue(
        (await WhiteboardEdges.findOneAsync(withPuzzle._id))?.hiddenWithPuzzle,
      );

      await asUser(operator, () =>
        resetWhiteboardLayout.callPromise({ boardId, putBack: true }),
      );

      assert.isTrue((await WhiteboardEdges.findOneAsync(byHand._id))?.hidden);
      assert.isTrue(
        (await WhiteboardEdges.findOneAsync(withPuzzle._id))?.hidden,
      );
      assert.isUndefined(
        (await WhiteboardNodes.findOneAsync(other._id))?.hidden,
      );
    });

    it("gives a puzzle that comes back after being replaced a card of its own", async function () {
      const { puzzle, card } = await feederWithArrow();
      const replacement = await newPuzzle("Stand-in", puzzle.tags);
      await destroy(puzzle._id, replacement);
      await waitForAssertion(async () => {
        assert.equal((await cardFor(replacement))?._id, card._id);
      }, 5000);
      await undestroy(puzzle._id);
      await waitForAssertion(async () => {
        const own = await cardFor(puzzle._id);
        assert.exists(own);
        assert.notEqual(own._id, card._id);
        assert.isNotOk(own.hidden);
        assert.equal((await cardFor(replacement))?._id, card._id);
      }, 5000);
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

    it("clears a node's colour when sent null", async function () {
      const _id = Random.id();
      await upsertNodes(member, boardId, [
        { _id, type: "text", position: { x: 0, y: 0 }, color: "red" },
      ]);
      await upsertNodes(member, boardId, [{ _id, color: null }]);
      const text = (await WhiteboardNodes.findOneAsync(_id))!;
      assert.isUndefined(text.color);
      assert.lengthOf(text.contributors, 2);
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

    describe("images", function () {
      const bucket = {
        bucketName: "jr-test-images",
        bucketRegion: "ap-southeast-2",
      };
      const inBucket = (key: string) =>
        `https://s3.${bucket.bucketRegion}.amazonaws.com/${bucket.bucketName}/${key}`;
      let backing: string;
      // Where an upload for the board's chat would be
      const stored = () => inBucket(`${huntId}/${backing}/${Random.id()}`);
      const imageInput = (url: string) => ({
        _id: Random.id(),
        type: "image" as const,
        position: { x: 10, y: 20 },
        width: 240,
        height: 120,
        image: { url, width: 800, height: 400 },
      });

      beforeEach(async function () {
        backing = (await Whiteboards.findOneAsync(boardId))!.puzzle;
        await Settings.insertAsync({
          name: "s3.image_bucket",
          value: bucket,
          createdBy: operator,
        });
      });

      it("takes an image uploaded for the board, with its size", async function () {
        const input = imageInput(stored());
        await asUser(member, () =>
          upsertWhiteboardNodes.callPromise({ boardId, nodes: [input] }),
        );
        const node = (await WhiteboardNodes.findOneAsync(input._id))!;
        assert.equal(node.type, "image");
        assert.deepEqual(node.image, input.image);
        assert.equal(node.width, 240);
        assert.equal(node.height, 120);
        assert.deepEqual(
          node.contributors.map((c) => c.user),
          [member],
        );
      });

      it("takes an image uploaded in another hunt, as a paste from there brings", async function () {
        const input = imageInput(
          inBucket(`${Random.id()}/${Random.id()}/${Random.id()}`),
        );
        await upsertNodes(member, boardId, [input]);
        assert.deepEqual(
          (await WhiteboardNodes.findOneAsync(input._id))!.image,
          input.image,
        );
      });

      it("refuses an image from anywhere else", async function () {
        const elsewhere = [
          "https://example.com/cat.png",
          "data:image/png;base64,iVBORw0KGgo=",
          inBucket(`${backing}/${Random.id()}`),
          inBucket(`chat/${backing}/${Random.id()}`),
          inBucket(`${huntId}/${backing}/${Random.id()}/more`),
          inBucket(`${huntId}/${backing}/../${Random.id()}`),
          `https://s3.${bucket.bucketRegion}.amazonaws.com/another-bucket/${huntId}/${backing}/${Random.id()}`,
        ];
        for (const url of elsewhere) {
          const input = imageInput(url);
          await assert.isRejected(
            upsertNodes(member, boardId, [input]),
            /That image isn't one we stored/,
          );
          assert.notOk(await WhiteboardNodes.findOneAsync(input._id));
        }
      });

      it("refuses every image when there's no bucket", async function () {
        const url = stored();
        await Settings.removeAsync({ name: "s3.image_bucket" });
        await assert.isRejected(
          upsertNodes(member, boardId, [imageInput(url)]),
          /That image isn't one we stored/,
        );
      });

      it("needs an image and a size on an image node, and no image on anything else", async function () {
        const { image: _image, ...bare } = imageInput(stored());
        await assert.isRejected(
          upsertNodes(member, boardId, [bare]),
          /need an image and a size/,
        );
        const { width: _width, ...unsized } = imageInput(stored());
        await assert.isRejected(
          upsertNodes(member, boardId, [unsized]),
          /need an image and a size/,
        );
        await assert.isRejected(
          upsertNodes(member, boardId, [
            { ...imageInput(stored()), type: "sticky" },
          ]),
          /Only image nodes have an image/,
        );
      });

      it("caps the images on a board", async function () {
        await upsertNodes(
          member,
          boardId,
          Array.from({ length: MAX_IMAGES_PER_BOARD }, () =>
            imageInput(stored()),
          ),
        );
        const extra = imageInput(stored());
        await assert.isRejected(
          upsertNodes(member, boardId, [extra]),
          /can't take any more images/,
        );
        assert.notOk(await WhiteboardNodes.findOneAsync(extra._id));
        // Other nodes still go in
        await upsertNodes(member, boardId, [
          { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
        ]);
      });

      it("never changes an image once it's on the board", async function () {
        const input = imageInput(stored());
        await upsertNodes(member, boardId, [input]);
        await assert.isRejected(
          upsertNodes(member, boardId, [
            { _id: input._id, image: { ...input.image, url: stored() } },
          ]),
          /An image can't be changed/,
        );
        await assert.isRejected(
          upsertNodes(member, boardId, [
            { _id: input._id, image: { ...input.image, width: 1 } },
          ]),
          /An image can't be changed/,
        );
        // The same image with a new size on the board is just a resize
        await upsertNodes(member, boardId, [
          { _id: input._id, image: input.image, width: 480, height: 240 },
        ]);
        const node = (await WhiteboardNodes.findOneAsync(input._id))!;
        assert.deepEqual(node.image, input.image);
        assert.equal(node.width, 480);

        const sticky = Random.id();
        await upsertNodes(member, boardId, [
          { _id: sticky, type: "sticky", position: { x: 0, y: 0 } },
        ]);
        await assert.isRejected(
          upsertNodes(member, boardId, [{ _id: sticky, image: input.image }]),
          /Only image nodes have an image/,
        );
      });

      it("locks, and deletes without touching the upload", async function () {
        const input = imageInput(stored());
        await upsertNodes(member, boardId, [input]);
        await upsertNodes(member, boardId, [{ _id: input._id, locked: true }]);
        await assert.isRejected(
          upsertNodes(operator, boardId, [
            { _id: input._id, position: { x: 0, y: 0 } },
          ]),
          /locked/,
        );
        await upsertNodes(member, boardId, [{ _id: input._id, locked: false }]);
        await deleteNodes(member, boardId, [input._id]);
        assert.notOk(await WhiteboardNodes.findOneAsync(input._id));
      });
    });

    describe("collapsing frames", function () {
      const seededFrame = async () =>
        (await WhiteboardNodes.findOneAsync({
          board: boardId,
          type: "frame",
          tag: { $exists: true },
        }))!;

      it("collapses and expands a frame without making it manual", async function () {
        const frame = await seededFrame();
        assert.notOk(frame.manual);
        await asUser(member, () =>
          upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [{ _id: frame._id, collapsed: true }],
          }),
        );
        const collapsed = (await WhiteboardNodes.findOneAsync(frame._id))!;
        assert.isTrue(collapsed.collapsed);
        assert.notOk(collapsed.manual);
        assert.deepEqual(collapsed.contributors, frame.contributors);
        assert.equal(collapsed.width, frame.width);
        assert.equal(collapsed.height, frame.height);

        await upsertNodes(member, boardId, [
          { _id: frame._id, collapsed: false },
        ]);
        const expanded = (await WhiteboardNodes.findOneAsync(frame._id))!;
        assert.notProperty(expanded, "collapsed");
        assert.notOk(expanded.manual);
      });

      it("refuses collapsed on a sticky", async function () {
        const sticky = Random.id();
        await assert.isRejected(
          upsertNodes(member, boardId, [
            {
              _id: sticky,
              type: "sticky",
              position: { x: 0, y: 0 },
              collapsed: true,
            },
          ]),
          /Only frames can be collapsed/,
        );
        assert.notOk(await WhiteboardNodes.findOneAsync(sticky));
        await upsertNodes(member, boardId, [
          { _id: sticky, type: "sticky", position: { x: 0, y: 0 } },
        ]);
        await assert.isRejected(
          upsertNodes(member, boardId, [{ _id: sticky, collapsed: false }]),
          /Only frames can be collapsed/,
        );
      });

      it("refuses a batch with a non-frame collapse before writing any of it", async function () {
        const frame = await seededFrame();
        const sticky = Random.id();
        await upsertNodes(member, boardId, [
          { _id: sticky, type: "sticky", position: { x: 0, y: 0 } },
        ]);
        await assert.isRejected(
          upsertNodes(member, boardId, [
            { _id: frame._id, position: { x: 12345, y: 12345 } },
            { _id: sticky, collapsed: true },
          ]),
          /Only frames can be collapsed/,
        );
        assert.deepEqual(
          (await WhiteboardNodes.findOneAsync(frame._id))?.position,
          frame.position,
        );
      });

      it("refuses collapsing to someone who can't edit", async function () {
        const frame = await seededFrame();
        await Whiteboards.updateAsync(boardId, {
          $set: { editPolicy: "operators" },
        });
        await assert.isRejected(
          upsertNodes(member, boardId, [{ _id: frame._id, collapsed: true }]),
          /Only operators/,
        );
        await assert.isRejected(
          upsertNodes(outsider, boardId, [{ _id: frame._id, collapsed: true }]),
          /member/,
        );
        assert.notOk(
          (await WhiteboardNodes.findOneAsync(frame._id))?.collapsed,
        );

        await Whiteboards.updateAsync(boardId, { $unset: { editPolicy: 1 } });
        await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
        await assert.isRejected(
          upsertNodes(operator, boardId, [{ _id: frame._id, collapsed: true }]),
          /archived/,
        );
      });

      it("keeps collapsed when a frame is re-inserted", async function () {
        const frame = Random.id();
        await upsertNodes(member, boardId, [
          {
            _id: frame,
            type: "frame",
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            collapsed: true,
          },
        ]);
        assert.isTrue((await WhiteboardNodes.findOneAsync(frame))?.collapsed);
        const open = Random.id();
        await upsertNodes(member, boardId, [
          {
            _id: open,
            type: "frame",
            position: { x: 500, y: 0 },
            width: 400,
            height: 300,
            collapsed: false,
          },
        ]);
        assert.notProperty(
          (await WhiteboardNodes.findOneAsync(open))!,
          "collapsed",
        );
      });

      it("opens a seeded frame when it's taken off the board", async function () {
        const frame = await seededFrame();
        await upsertNodes(member, boardId, [
          { _id: frame._id, collapsed: true },
        ]);
        await deleteNodes(member, boardId, [frame._id]);
        const hidden = (await WhiteboardNodes.findOneAsync(frame._id))!;
        assert.isTrue(hidden.hidden);
        assert.notProperty(hidden, "collapsed");

        await upsertNodes(member, boardId, [
          { _id: frame._id, hidden: false, parent: null },
        ]);
        assert.notOk(
          (await WhiteboardNodes.findOneAsync(frame._id))?.collapsed,
        );
      });

      it("records no version for a collapse-only batch", async function () {
        const frame = await seededFrame();
        await WhiteboardVersions.removeAsync({ board: boardId });
        await upsertNodes(member, boardId, [
          { _id: frame._id, collapsed: true },
        ]);
        await upsertNodes(member, boardId, [
          { _id: frame._id, collapsed: false },
        ]);
        assert.equal(
          await WhiteboardVersions.find({ board: boardId }).countAsync(),
          0,
        );

        // Anything else in the batch is an edit like any other
        await upsertNodes(member, boardId, [
          { _id: frame._id, collapsed: true, position: { x: 10, y: 10 } },
        ]);
        assert.equal(
          await WhiteboardVersions.find({ board: boardId }).countAsync(),
          1,
        );
      });
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

    it("clears a line's colour when sent null", async function () {
      const a = await sticky(0);
      const b = await sticky(300);
      const line = Random.id();
      await upsertEdges(member, boardId, [
        { _id: line, source: a, target: b, color: "red" },
      ]);
      await upsertEdges(member, boardId, [{ _id: line, color: null }]);
      assert.isUndefined((await WhiteboardEdges.findOneAsync(line))?.color);
    });

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

    describe("selection and editing", function () {
      const nodeIds = async (count: number) =>
        (
          await WhiteboardNodes.find(
            { board: boardId },
            { limit: count, projection: { _id: 1 } },
          ).fetchAsync()
        ).map((n) => n._id);
      // Enough notes for a selection of `count` nodes on this board
      const boardNodes = async (count: number) => {
        const have = await WhiteboardNodes.find({
          board: boardId,
        }).countAsync();
        if (have < count) {
          const notes = Array.from({ length: count - have }, (_, i) => ({
            _id: Random.id(),
            type: "sticky" as const,
            position: { x: i * 10, y: 0 },
          }));
          for (let i = 0; i < notes.length; i += 100) {
            await upsertNodes(member, boardId, notes.slice(i, i + 100));
          }
        }
        return nodeIds(count);
      };

      it("keeps a selection of up to 50 of the board's nodes, and what's being typed in", async function () {
        const { connection, close } = fakeConnection();
        try {
          const ids = await boardNodes(MAX_LIVE_SELECTION);
          await setLive(member, connection, boardId, {
            ...state,
            selection: ids,
            editing: ids[0],
          });
          const doc = await WhiteboardPresence.findOneAsync({
            connection: connection.id,
          });
          assert.deepEqual(doc?.selection, ids);
          assert.equal(doc?.editing, ids[0]);

          // A line's label is typed in too
          const line = Random.id();
          await upsertEdges(member, boardId, [
            { _id: line, source: ids[0]!, target: ids[1]! },
          ]);
          await setLive(member, connection, boardId, {
            ...state,
            selection: null,
            editing: line,
          });
          const after = await WhiteboardPresence.findOneAsync({
            connection: connection.id,
          });
          assert.isNull(after?.selection);
          assert.equal(after?.editing, line);

          // An update from a client that doesn't send them clears them
          await setLive(member, connection, boardId, state);
          const cleared = await WhiteboardPresence.findOneAsync({
            connection: connection.id,
          });
          assert.isNull(cleared?.selection);
          assert.isNull(cleared?.editing);
        } finally {
          close();
        }
      });

      it("refuses too big a selection, bad ids and things not on the board", async function () {
        const { connection, close } = fakeConnection();
        try {
          const ids = await boardNodes(MAX_LIVE_SELECTION + 1);
          await assert.isRejected(
            setLive(member, connection, boardId, { ...state, selection: ids }),
            /Invalid live update/,
          );
          await assert.isRejected(
            setLive(member, connection, boardId, {
              ...state,
              selection: [ids[0]!, Random.id()],
            }),
            /Selected nodes must be on this board/,
          );
          await assert.isRejected(
            setLive(member, connection, boardId, {
              ...state,
              selection: ["not an id!"],
            }),
            /Invalid live update/,
          );
          await assert.isRejected(
            setLive(member, connection, boardId, {
              ...state,
              editing: Random.id(),
            }),
            /Edited items must be on this board/,
          );
          await assert.isRejected(
            setLive(member, connection, boardId, {
              ...state,
              editing: "not an id!",
            }),
            /Invalid live update/,
          );
          await assert.isRejected(
            setLive(member, connection, boardId, { ...state, editing: "" }),
            /Invalid live update/,
          );
          // A node on another board is as good as none
          const otherHunt = await createTestHunt(operator);
          await MeteorUsers.updateAsync(operator, {
            $addToSet: { hunts: otherHunt },
            $set: { [`roles.${otherHunt}`]: ["operator"] },
          });
          const otherBoard = await ensureWhiteboard(operator, otherHunt);
          const elsewhere = Random.id();
          await upsertNodes(operator, otherBoard, [
            { _id: elsewhere, type: "sticky", position: { x: 0, y: 0 } },
          ]);
          await assert.isRejected(
            setLive(member, connection, boardId, {
              ...state,
              selection: [elsewhere],
            }),
            /on this board/,
          );
          await assert.isRejected(
            setLive(member, connection, boardId, {
              ...state,
              editing: elsewhere,
            }),
            /on this board/,
          );
          assert.equal(
            await WhiteboardPresence.find({
              connection: connection.id,
            }).countAsync(),
            0,
          );
        } finally {
          close();
        }
      });

      it("doesn't write an update over a newer one that overtook it", async function () {
        const { connection, close } = fakeConnection();
        try {
          const ids = await boardNodes(1);
          await setLive(member, connection, boardId, state);
          // The first looks up its selection; the second, sent after it,
          // has nothing to look up and is written first.
          await Promise.all([
            setLive(member, connection, boardId, {
              ...state,
              selection: ids,
              editing: ids[0],
            }),
            setLive(member, connection, boardId, {
              ...state,
              cursor: { x: 5, y: 6 },
            }),
          ]);
          const presence = await WhiteboardPresence.findOneAsync({
            connection: connection.id,
          });
          assert.deepEqual(presence?.cursor, { x: 5, y: 6 });
          assert.isNull(presence?.selection);
          assert.isNull(presence?.editing);
        } finally {
          close();
        }
      });

      it("keeps when someone typing last said so, only while they're typing", async function () {
        const { connection, close } = fakeConnection();
        try {
          const [id] = await boardNodes(1);
          const at = new Date(Date.now() - 5000);
          await setLive(member, connection, boardId, {
            ...state,
            editing: id,
            editingAt: at,
          });
          const presence = () =>
            WhiteboardPresence.findOneAsync({ connection: connection.id });
          assert.deepEqual((await presence())?.editingAt, at);

          // Nothing being typed in has no time
          await setLive(member, connection, boardId, {
            ...state,
            editing: null,
            editingAt: at,
          });
          assert.isNull((await presence())?.editingAt);
          // nor does a client that doesn't send one
          await setLive(member, connection, boardId, { ...state, editing: id });
          assert.isNull((await presence())?.editingAt);

          await assert.isRejected(
            setLive(member, connection, boardId, {
              ...state,
              editing: id,
              editingAt: new Date(Number.NaN),
            }),
            /Invalid live update/,
          );
          await assert.isRejected(
            asUser(
              member,
              () =>
                setWhiteboardLive.callPromise({
                  boardId,
                  ...state,
                  editing: id,
                  editingAt: "now" as unknown as Date,
                }),
              connection,
            ),
            /Match/,
          );
        } finally {
          close();
        }
      });

      it("publishes what others have selected and are typing in", async function () {
        const mine = new StubSubscription(member);
        Object.assign(mine, { connection: fakeConnection().connection });
        const theirs = fakeConnection();
        try {
          const ids = await boardNodes(2);
          const editingAt = new Date();
          await setLive(operator, theirs.connection, boardId, {
            ...state,
            selection: ids,
            editing: ids[1],
            editingAt,
          });
          const cursor = await publishHandler(whiteboardPresence.name).call(
            mine,
            { boardId },
          );
          const published = await cursor.fetchAsync();
          assert.lengthOf(published, 1);
          assert.deepEqual(published[0].selection, ids);
          assert.equal(published[0].editing, ids[1]);
          assert.deepEqual(published[0].editingAt, editingAt);
        } finally {
          mine.stop();
          theirs.close();
        }
      });
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
      // Each remembers its node, for a restore that brings it back
      assert.deepEqual((await reload(onNested._id)).comment, {
        x: 115,
        y: 226,
        detachedFrom: nested,
      });
      assert.deepEqual((await reload(onTopLevel._id)).comment, {
        x: 307,
        y: 408,
        detachedFrom: topLevel,
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
      assert.deepEqual((await reload(onFrame._id)).comment, {
        x: 101,
        y: 201,
        detachedFrom: frame,
      });
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
        detachedFrom: card._id,
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
        detachedFrom: node,
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

    it("purges versions and chunks with the hunt", async function () {
      await upsertNodes(member, boardId, [
        { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
      ]);
      assert.equal(await WhiteboardVersions.find({}).countAsync(), 1);
      assert.isAbove(await WhiteboardVersionChunks.find({}).countAsync(), 0);
      // Keep the purge away from Google Drive
      await FeatureFlags.insertAsync({
        name: "disable.google",
        type: "on",
        createdBy: operator,
      });

      await runJob(purgeHuntJob, { huntId }, { userId: operator });

      assert.equal(await WhiteboardVersions.find({}).countAsync(), 0);
      assert.equal(await WhiteboardVersionChunks.find({}).countAsync(), 0);
    });

    it("reassigns whiteboard version users", async function () {
      const source = await makeUser("source@example.com", []);
      const target = await makeUser("target@example.com", []);
      await upsertNodes(source, boardId, [
        { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
      ]);
      await upsertNodes(member, boardId, [
        { _id: Random.id(), type: "sticky", position: { x: 300, y: 0 } },
      ]);
      await upsertNodes(target, boardId, [
        { _id: Random.id(), type: "sticky", position: { x: 600, y: 0 } },
      ]);

      await runJob(
        mergeUsersJob,
        { sourceUser: source, targetUser: target },
        { userId: target },
      );

      const [version, ...rest] = await WhiteboardVersions.find({}).fetchAsync();
      assert.isEmpty(rest);
      // Whoever started it stays first
      assert.deepEqual(
        version!.users.map((u) => u.user),
        [target, member, target],
      );
      assert.equal(version!.createdBy, target);
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
    // A cursor, a drag, a stroke, a selection and text being typed in all
    // at once
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
        selection: [node._id],
        editing: node._id,
        editingAt: new Date(),
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

    it("drops live drags, strokes, selections and editing from non-editors but keeps the cursor", async function () {
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
        assert.isNull(doc?.selection);
        assert.isNull(doc?.editing);
        const mine = await presenceOf(ours.connection);
        assert.deepEqual(mine?.drag, live.drag);
        assert.deepEqual(mine?.selection, live.selection);
        assert.equal(mine?.editing, live.editing);
        // Not even checked: a drag, selection or edit of something on
        // another board is dropped rather than refused.
        await setLive(member, theirs.connection, boardId, {
          ...live,
          drag: [{ node: Random.id(), x: 0, y: 0 }],
          selection: [Random.id()],
          editing: Random.id(),
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
        assert.isNull(doc?.selection);
        assert.isNull(doc?.editing);
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

      it("clears the live edits of someone demoted, before they next move", async function () {
        await setPolicy(operator, "operators");
        const live = await busy();
        const { connection, close } = fakeConnection();
        try {
          await setLive(operator, connection, boardId, live);
          assert.equal((await presenceOf(connection))?.editing, live.editing);
          await MeteorUsers.updateAsync(operator, {
            $set: { [`roles.${huntId}`]: [] },
          });
          await waitForAssertion(async () => {
            const doc = await presenceOf(connection);
            assert.deepEqual(doc?.cursor, live.cursor);
            assert.isNull(doc?.drag);
            assert.isNull(doc?.stroke);
            assert.isNull(doc?.selection);
            assert.isNull(doc?.editing);
            assert.isNull(doc?.editingAt);
          }, 12000);
        } finally {
          close();
        }
      });

      it("clears everyone's live edits on a hunt that's archived, before they next move", async function () {
        const live = await busy();
        const theirs = fakeConnection();
        const ours = fakeConnection();
        try {
          await setLive(member, theirs.connection, boardId, live);
          await setLive(operator, ours.connection, boardId, live);
          await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
          await waitForAssertion(async () => {
            for (const connection of [theirs.connection, ours.connection]) {
              const doc = await presenceOf(connection);
              assert.deepEqual(doc?.cursor, live.cursor);
              assert.isNull(doc?.drag);
              assert.isNull(doc?.stroke);
              assert.isNull(doc?.selection);
              assert.isNull(doc?.editing);
              assert.isNull(doc?.editingAt);
            }
          }, 12000);
        } finally {
          theirs.close();
          ours.close();
        }
      });

      it("clears live edits only of those a hunt's default roles stop making operators", async function () {
        await setPolicy(operator, "operators");
        await Hunts.updateAsync(huntId, {
          $set: { defaultRoles: ["operator"] },
        });
        const live = await busy();
        // An operator only by the hunt's default, and one in their own right
        const theirs = fakeConnection();
        const ours = fakeConnection();
        try {
          await setLive(member, theirs.connection, boardId, live);
          await setLive(operator, ours.connection, boardId, live);
          assert.equal(
            (await presenceOf(theirs.connection))?.editing,
            live.editing,
          );
          await Hunts.updateAsync(huntId, { $set: { defaultRoles: [] } });
          await waitForAssertion(async () => {
            const doc = await presenceOf(theirs.connection);
            assert.deepEqual(doc?.cursor, live.cursor);
            assert.isNull(doc?.drag);
            assert.isNull(doc?.stroke);
            assert.isNull(doc?.selection);
            assert.isNull(doc?.editing);
            assert.isNull(doc?.editingAt);
          }, 12000);
          // Cleared in the same pass, so the operator's would be gone by now
          const kept = await presenceOf(ours.connection);
          assert.deepEqual(kept?.drag, live.drag);
          assert.deepEqual(kept?.stroke, live.stroke);
          assert.deepEqual(kept?.selection, live.selection);
          assert.equal(kept?.editing, live.editing);
          assert.deepEqual(kept?.editingAt, live.editingAt);
        } finally {
          theirs.close();
          ours.close();
        }
      });

      it("clears a demoted user's live edits only on boards they can no longer edit", async function () {
        const otherHunt = await createTestHunt(operator);
        await MeteorUsers.updateAsync(operator, {
          $addToSet: { hunts: otherHunt },
          $set: { [`roles.${otherHunt}`]: ["operator"] },
        });
        const otherBoard = await ensureWhiteboard(operator, otherHunt);
        await setPolicy(operator, "operators");
        await asUser(operator, () =>
          setWhiteboardEditPolicy.callPromise({
            boardId: otherBoard,
            editPolicy: "operators",
            editors: [],
          }),
        );
        const note = Random.id();
        await upsertNodes(operator, otherBoard, [
          { _id: note, type: "sticky", position: { x: 0, y: 0 } },
        ]);
        const here = await busy();
        const there = {
          ...here,
          drag: [{ node: note, x: 5, y: 6, parent: null }],
          selection: [note],
          editing: note,
        };
        const { connection, close } = fakeConnection();
        const rowOn = (board: string) =>
          WhiteboardPresence.findOneAsync({ connection: connection.id, board });
        try {
          await setLive(operator, connection, boardId, here);
          await setLive(operator, connection, otherBoard, there);
          await MeteorUsers.updateAsync(operator, {
            $set: { [`roles.${huntId}`]: [] },
          });
          await waitForAssertion(async () => {
            const doc = await rowOn(boardId);
            assert.isNull(doc?.drag);
            assert.isNull(doc?.editing);
            assert.isNull(doc?.editingAt);
          }, 12000);
          // Cleared in the same pass, so the other board's would be gone by
          // now
          const kept = await rowOn(otherBoard);
          assert.deepEqual(kept?.drag, there.drag);
          assert.deepEqual(kept?.selection, there.selection);
          assert.equal(kept?.editing, there.editing);
          assert.deepEqual(kept?.editingAt, there.editingAt);
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

  describe("reset and place by tags", function () {
    let boardId: string;
    const anger = FixtureHunt.tags.find((t) => t.name === "group:anger")!;
    const joy = FixtureHunt.tags.find((t) => t.name === "group:joy")!;
    const angerMeta = FixtureHunt.tags.find(
      (t) => t.name === "meta-for:anger",
    )!;

    beforeEach(async function () {
      boardId = await ensureWhiteboard(operator, huntId);
    });

    const frameFor = async (tagId: string) =>
      (await WhiteboardNodes.findOneAsync({ board: boardId, tag: tagId }))!;
    const cardFor = async (puzzleId: string) =>
      (await WhiteboardNodes.findOneAsync({
        board: boardId,
        puzzle: puzzleId,
      }))!;
    // A card in the anger round that isn't its meta
    const angerCard = async () => {
      const puzzle = (await Puzzles.findOneAsync({
        hunt: huntId,
        tags: { $all: [anger._id], $nin: [angerMeta._id] },
      }))!;
      return cardFor(puzzle._id);
    };
    const placeByTags = (userId: string, nodeIds: string[]) =>
      asUser(userId, () =>
        placeWhiteboardCardsByTags.callPromise({ boardId, nodeIds }),
      );
    const reset = (userId: string, putBack = false) =>
      asUser(userId, () =>
        resetWhiteboardLayout.callPromise({ boardId, putBack }),
      );
    const versions = () =>
      WhiteboardVersions.find(
        { board: boardId },
        { sort: { createdAt: -1 } },
      ).fetchAsync();
    // Where every card and seeded frame is
    const layout = async () =>
      new Map(
        (
          await WhiteboardNodes.find({
            board: boardId,
            type: { $in: ["puzzle", "frame"] },
          }).fetchAsync()
        ).map((n) => [
          n._id,
          {
            parent: n.parent,
            position: n.position,
            width: n.width,
            height: n.height,
            manual: n.manual,
            hidden: n.hidden,
          },
        ]),
      );
    const comment = async (node: string, text: string) => {
      const puzzleId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
      await asUser(member, () =>
        sendChatMessage.callPromise({
          puzzleId,
          content: JSON.stringify(contentFromMessage(text)),
          comment: { node, x: 10, y: 20 },
        }),
      );
      return (await ChatMessages.findOneAsync({
        "content.children.text": text,
      }))!._id;
    };

    it("places a dragged card back into its round and clears manual", async function () {
      const card = await angerCard();
      const joyFrame = await frameFor(joy._id);
      await upsertNodes(member, boardId, [
        { _id: card._id, parent: joyFrame._id, position: { x: 900, y: 900 } },
      ]);
      assert.isTrue((await cardFor(card.puzzle)).manual);

      await placeByTags(member, [card._id]);

      const placed = await cardFor(card.puzzle);
      assert.equal(placed._id, card._id);
      assert.equal(placed.parent, (await frameFor(anger._id))._id);
      assert.notOk(placed.manual);
      assert.notDeepEqual(placed.position, { x: 900, y: 900 });
      // and follows its tags from then on
      await Puzzles.updateAsync(card.puzzle, { $set: { tags: [joy._id] } });
      await syncPuzzlesOnBoard(huntId, [card.puzzle]);
      assert.equal((await cardFor(card.puzzle)).parent, joyFrame._id);
    });

    it("leaves a card already in its round where it is", async function () {
      const card = await angerCard();
      const moved = { x: card.position.x + 5, y: card.position.y + 7 };
      await upsertNodes(member, boardId, [{ _id: card._id, position: moved }]);

      await placeByTags(member, [card._id]);

      const placed = await cardFor(card.puzzle);
      assert.equal(placed.parent, card.parent);
      assert.deepEqual(placed.position, moved);
      assert.notOk(placed.manual);
    });

    it("places by tags with history off, recording nothing", async function () {
      const card = await angerCard();
      await upsertNodes(member, boardId, [
        { _id: card._id, parent: null, position: { x: 900, y: 900 } },
      ]);
      await FeatureFlags.insertAsync({
        name: "disable.whiteboard_versions",
        type: "on",
        createdBy: operator,
      });
      const before = await versions();

      await placeByTags(operator, [card._id]);

      const placed = await cardFor(card.puzzle);
      assert.equal(placed.parent, (await frameFor(anger._id))._id);
      assert.notOk(placed.manual);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        before.map((v) => v._id),
      );
    });

    it("refuses place by tags for non-cards and non-editors", async function () {
      const card = await angerCard();
      await upsertNodes(member, boardId, [
        { _id: card._id, position: { x: 1, y: 1 } },
      ]);
      const sticky = Random.id();
      await upsertNodes(member, boardId, [
        { _id: sticky, type: "sticky", position: { x: 0, y: 0 } },
      ]);
      const hidden = (await WhiteboardNodes.findOneAsync({
        board: boardId,
        type: "puzzle",
        _id: { $ne: card._id },
      }))!;
      await deleteNodes(member, boardId, [hidden._id]);

      for (const ids of [
        [card._id, sticky],
        [hidden._id],
        [Random.id()],
        [(await frameFor(anger._id))._id],
      ]) {
        await assert.isRejected(
          placeByTags(member, ids),
          /Only cards on this board can be placed by tags/,
        );
      }
      // A card on another hunt's board
      const otherHunt = await Hunts.insertAsync({
        name: "Another hunt",
        openSignups: true,
        hasGuessQueue: true,
        createdBy: operator,
      });
      await MeteorUsers.updateAsync(operator, {
        $addToSet: { hunts: otherHunt },
        $set: { [`roles.${otherHunt}`]: ["operator"] },
      });
      await Puzzles.insertAsync({
        hunt: otherHunt,
        title: "Elsewhere",
        tags: [],
        answers: [],
        expectedAnswerCount: 1,
        createdBy: operator,
      });
      const otherBoard = await ensureWhiteboard(operator, otherHunt);
      const foreign = (await WhiteboardNodes.findOneAsync({
        board: otherBoard,
        type: "puzzle",
      }))!;
      await WhiteboardNodes.updateAsync(foreign._id, {
        $set: { manual: true },
      });
      await assert.isRejected(
        placeByTags(operator, [foreign._id]),
        /Only cards on this board can be placed by tags/,
      );
      assert.isTrue((await WhiteboardNodes.findOneAsync(foreign._id))?.manual);

      await assert.isRejected(
        placeByTags(
          member,
          Array.from({ length: MAX_BATCH + 1 }, () => card._id),
        ),
        /Too many/,
      );
      await assert.isRejected(placeByTags(outsider, [card._id]), /member/);
      await asUser(operator, () =>
        setWhiteboardEditPolicy.callPromise({
          boardId,
          editPolicy: "operators",
          editors: [],
        }),
      );
      await assert.isRejected(
        placeByTags(member, [card._id]),
        /Only operators can edit/,
      );
      assert.isTrue((await cardFor(card.puzzle)).manual);
    });

    it("resets cards and round frames and keeps notes, ink and lines", async function () {
      const seeded = await layout();
      const card = await angerCard();
      const angerFrame = await frameFor(anger._id);
      const joyFrame = await frameFor(joy._id);
      const note = Random.id();
      const ink = Random.id();
      const end = Random.id();
      const line = Random.id();
      const freeLine = Random.id();
      await upsertNodes(member, boardId, [
        { _id: card._id, parent: null, position: { x: 9000, y: 9000 } },
        { _id: joyFrame._id, position: { x: 7000, y: 7000 } },
        {
          _id: note,
          type: "sticky",
          position: { x: 20, y: 30 },
          parent: angerFrame._id,
          text: "a note",
        },
        {
          _id: ink,
          type: "ink",
          position: { x: 8000, y: 8000 },
          width: 20,
          height: 20,
          points: [
            [0, 0, 0.5],
            [20, 20, 0.5],
          ],
          strokeWidth: "thin",
          color: "black",
          stroke: Random.id(),
        },
        { _id: end, type: "point", position: { x: 8500, y: 8500 } },
      ]);
      await upsertEdges(member, boardId, [
        { _id: line, source: note, target: card._id },
        { _id: freeLine, source: card._id, target: end },
      ]);
      const kept = await WhiteboardNodes.find({
        _id: { $in: [note, ink, end] },
      }).fetchAsync();

      await reset(member);

      // Every card and frame is back where a new board would have it
      assert.deepEqual(await layout(), seeded);
      assert.sameDeepMembers(
        await WhiteboardNodes.find({
          _id: { $in: [note, ink, end] },
        }).fetchAsync(),
        kept,
      );
      const edge = (await WhiteboardEdges.findOneAsync(line))!;
      assert.equal(edge.source, note);
      assert.equal(edge.target, card._id);
      const free = (await WhiteboardEdges.findOneAsync(freeLine))!;
      assert.equal(free.source, card._id);
      assert.equal(free.target, end);
      assert.ok((await Whiteboards.findOneAsync(boardId))?.lastRewrittenAt);
    });

    it("keeps comment anchors and collapsed frames through a reset", async function () {
      const card = await angerCard();
      const angerFrame = await frameFor(anger._id);
      await upsertNodes(member, boardId, [
        { _id: card._id, parent: null, position: { x: 9000, y: 9000 } },
        { _id: angerFrame._id, collapsed: true },
      ]);
      const onCard = await comment(card._id, "on the card");
      const onFrame = await comment(angerFrame._id, "on the frame");

      await reset(member);

      assert.deepEqual((await ChatMessages.findOneAsync(onCard))?.comment, {
        node: card._id,
        x: 10,
        y: 20,
      });
      assert.deepEqual((await ChatMessages.findOneAsync(onFrame))?.comment, {
        node: angerFrame._id,
        x: 10,
        y: 20,
      });
      assert.isTrue((await frameFor(anger._id)).collapsed);
    });

    it("records a reset version first and restores from it", async function () {
      const card = await angerCard();
      await upsertNodes(member, boardId, [
        { _id: card._id, parent: null, position: { x: 9000, y: 9000 } },
      ]);
      const before = await WhiteboardNodes.find({
        board: boardId,
      }).fetchAsync();

      await reset(operator);

      const [version] = await versions();
      assert.equal(version!.kind, "reset");
      assert.deepEqual(
        version!.users.map((u) => u.user),
        [operator],
      );
      const payload = await decodeVersion(
        (
          await WhiteboardVersionChunks.find(
            { version: version!._id },
            { sort: { index: 1 } },
          ).fetchAsync()
        ).map((c) => c.data),
      );
      assert.sameDeepMembers(payload.nodes, before);
      assert.notOk((await cardFor(card.puzzle)).manual);

      await restoreVersion(operator, boardId, version!._id);
      const restored = await cardFor(card.puzzle);
      assert.deepEqual(restored.position, { x: 9000, y: 9000 });
      assert.notOk(restored.parent);
      assert.isTrue(restored.manual);
    });

    it("snapshots the first edit after a reset", async function () {
      const sticky = () =>
        upsertNodes(member, boardId, [
          { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
        ]);
      await sticky();
      assert.lengthOf(await versions(), 1);

      await reset(operator);
      assert.deepEqual(
        (await versions()).map((v) => v.kind),
        ["reset", "edits"],
      );

      // Inside the member's window, but the board has been rewritten since
      await sticky();
      assert.deepEqual(
        (await versions()).map((v) => v.kind),
        ["edits", "reset", "edits"],
      );
    });

    it("unhides feeder arrows only when putting back", async function () {
      const arrow = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!;
      const card = await angerCard();
      await deleteEdges(member, boardId, [arrow._id]);
      await deleteNodes(member, boardId, [card._id]);
      const hiddenAt = (await cardFor(card.puzzle)).position;

      await reset(member);
      assert.isTrue((await WhiteboardEdges.findOneAsync(arrow._id))?.hidden);
      const stillHidden = await cardFor(card.puzzle);
      assert.isTrue(stillHidden.hidden);
      assert.deepEqual(stillHidden.position, hiddenAt);

      await reset(member, true);
      assert.notOk((await WhiteboardEdges.findOneAsync(arrow._id))?.hidden);
      const back = await cardFor(card.puzzle);
      assert.notOk(back.hidden);
      assert.equal(back.parent, (await frameFor(anger._id))._id);
    });

    it("survives a card inserted by hand during a reset", async function () {
      const puzzleId = await Puzzles.insertAsync({
        hunt: huntId,
        title: "Not on the board yet",
        tags: [anger._id],
        answers: [],
        expectedAnswerCount: 1,
        createdBy: operator,
      });
      assert.notOk(await cardFor(puzzleId));
      const insert = WhiteboardNodes.insertAsync.bind(WhiteboardNodes);
      let byHand: string | undefined;
      const stub = sinon
        .stub(WhiteboardNodes, "insertAsync")
        .callsFake(async (doc) => {
          if (doc.puzzle === puzzleId && !byHand) {
            byHand = await insert({
              hunt: huntId,
              board: boardId,
              type: "puzzle",
              puzzle: puzzleId,
              position: { x: 9000, y: 9000 },
              createdBy: member,
            });
          }
          return insert(doc);
        });
      try {
        await reset(operator);
      } finally {
        stub.restore();
      }

      const cards = await WhiteboardNodes.find({
        board: boardId,
        puzzle: puzzleId,
      }).fetchAsync();
      assert.lengthOf(cards, 1);
      assert.equal(cards[0]!._id, byHand);
      assert.equal(cards[0]!.parent, (await frameFor(anger._id))._id);
    });

    it("checks access and history again once it has the board's lock", async function () {
      const card = await angerCard();
      await upsertNodes(member, boardId, [
        { _id: card._id, position: { x: 1, y: 1 } },
      ]);
      const before = await versions();

      // Holds the board's lock, lets a reset by userId queue for it, makes
      // change, then lets the reset have the lock.
      const lockName = `whiteboard:${boardId}`;
      const resetWhileLocked = async (
        userId: string,
        change: () => Promise<unknown>,
      ) => {
        const held = await Locks.insertAsync({ name: lockName });
        const insertLock = Locks.insertAsync.bind(Locks);
        let queued!: () => void;
        const waiting = new Promise<void>((resolve) => {
          queued = resolve;
        });
        const stub = sinon
          .stub(Locks, "insertAsync")
          .callsFake((...args: Parameters<typeof insertLock>) => {
            if (args[0].name === lockName) queued();
            return insertLock(...args);
          });
        try {
          const result = reset(userId);
          await Promise.race([waiting, result]);
          await change();
          await Locks.removeAsync(held);
          await result;
        } finally {
          stub.restore();
          await Locks.removeAsync(held);
        }
      };

      await assert.isRejected(
        resetWhileLocked(member, () =>
          asUser(operator, () =>
            setWhiteboardEditPolicy.callPromise({
              boardId,
              editPolicy: "operators",
              editors: [],
            }),
          ),
        ),
        /Only operators can edit/,
      );
      await assert.isRejected(
        resetWhileLocked(operator, () =>
          FeatureFlags.insertAsync({
            name: "disable.whiteboard_versions",
            type: "on",
            createdBy: operator,
          }),
        ),
        /Reset layout needs board history, which is turned off/,
      );

      assert.isTrue((await cardFor(card.puzzle)).manual);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        before.map((v) => v._id),
      );
    });

    it("refuses reset with history off, for non-editors and on an archived hunt", async function () {
      const card = await angerCard();
      await upsertNodes(member, boardId, [
        { _id: card._id, position: { x: 1, y: 1 } },
      ]);
      const before = await versions();

      await assert.isRejected(reset(outsider), /member/);
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(reset(operator), /archived/);
      await Hunts.updateAsync(huntId, { $set: { isArchived: false } });
      await asUser(operator, () =>
        setWhiteboardEditPolicy.callPromise({
          boardId,
          editPolicy: "operators",
          editors: [],
        }),
      );
      await assert.isRejected(reset(member), /Only operators can edit/);
      await FeatureFlags.insertAsync({
        name: "disable.whiteboard_versions",
        type: "on",
        createdBy: operator,
      });
      await assert.isRejected(
        reset(operator),
        /Reset layout needs board history, which is turned off/,
      );

      assert.isTrue((await cardFor(card.puzzle)).manual);
      assert.sameMembers(
        (await versions()).map((v) => v._id),
        before.map((v) => v._id),
      );
    });
  });
});
