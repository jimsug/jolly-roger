import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import FixtureHunt from "../../../../imports/FixtureHunt";
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
import Tags from "../../../../imports/lib/models/Tags";
import WhiteboardEdges from "../../../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../../../imports/lib/models/WhiteboardNodes";
import WhiteboardPresence from "../../../../imports/lib/models/WhiteboardPresence";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import { POINT_SIZE } from "../../../../imports/lib/whiteboard/limits";
import type { CommentAnchorInput } from "../../../../imports/methods/sendChatMessage";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import {
  createWhiteboard,
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
import resetDatabase from "../../../lib/resetDatabase";

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
      close() {},
      onClose(cb: () => void) {
        closers.push(cb);
      },
      clientAddress: "127.0.0.1",
      httpHeaders: {},
    } as unknown as Meteor.Connection,
    close: () => closers.forEach((cb) => cb()),
  };
}

async function callMethod(name: string, userId: string, args: unknown) {
  const handler = (
    Meteor as unknown as {
      server: { method_handlers: Record<string, (arg: unknown) => unknown> };
    }
  ).server.method_handlers[name];
  if (!handler) throw new Error(`No method ${name}`);
  const invocation = {
    userId,
    connection: fakeConnection().connection,
    isSimulation: false,
    unblock() {},
    setUserId() {},
  };
  // Models stamp createdBy from Meteor.userId(), which only works inside a
  // method invocation.
  return DDP._CurrentInvocation.withValue(invocation, () =>
    handler.call(invocation, args),
  );
}

describe("whiteboard", function () {
  let operator: string;
  let member: string;
  let outsider: string;

  beforeEach(async function () {
    this.timeout(10000);
    await resetDatabase("whiteboard");
    operator = await makeUser("operator@example.com", ["operator"]);
    member = await makeUser("member@example.com", []);
    outsider = await makeUser("outsider@example.com");
    await makeFixtureHunt(operator);
  });

  describe("createWhiteboard", function () {
    it("seeds a frame per round, a card per puzzle and feeder arrows", async function () {
      const boardId = await createWhiteboard(operator, huntId);
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
      const first = await createWhiteboard(operator, huntId);
      const second = await createWhiteboard(operator, huntId);
      assert.equal(second, first);
      assert.equal(await Whiteboards.find({ hunt: huntId }).countAsync(), 1);
      assert.equal(
        await Puzzles.find({ hunt: huntId, kind: "whiteboard" }).countAsync(),
        1,
      );
    });

    it("is for operators only", async function () {
      await assert.isRejected(createWhiteboard(member, huntId));
      await assert.isRejected(createWhiteboard(outsider, huntId));
    });

    it("doesn't create a document or announce the backing puzzle", async function () {
      const boardId = await createWhiteboard(operator, huntId);
      const board = (await Whiteboards.findOneAsync(boardId))!;
      assert.equal(
        await Documents.find({ puzzle: board.puzzle }).countAsync(),
        0,
      );
      assert.equal(
        await PuzzleNotifications.find({ puzzle: board.puzzle }).countAsync(),
        0,
      );
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

    beforeEach(async function () {
      this.timeout(10000);
      boardId = await createWhiteboard(operator, huntId);
    });

    it("puts a new puzzle in its round's frame", async function () {
      const puzzleId = await Puzzles.insertAsync({
        hunt: huntId,
        title: "Brand new",
        tags: [groupTag._id],
        answers: [],
        expectedAnswerCount: 1,
        createdBy: operator,
      });
      await syncPuzzlesOnBoard(huntId, [puzzleId]);
      const card = await cardFor(puzzleId);
      assert.equal(card.parent, (await frameFor(groupTag._id))._id);
    });

    it("places locked puzzles too", async function () {
      const puzzleId = await Puzzles.insertAsync({
        hunt: huntId,
        title: "Locked",
        tags: [groupTag._id],
        answers: [],
        expectedAnswerCount: 1,
        locked: true,
        createdBy: operator,
      });
      await syncPuzzlesOnBoard(huntId, [puzzleId]);
      assert.ok(await cardFor(puzzleId));
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
      assert.notEqual((await cardFor(second!._id)).parent, otherFrame._id);
    });

    it("drops feeder arrows when the tag goes, and keeps hidden ones hidden", async function () {
      const edge = (await WhiteboardEdges.findOneAsync({
        board: boardId,
        auto: true,
      }))!;
      const feeder = (await Puzzles.findOneAsync(edge.feeder!))!;

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

    it("keeps a frame's label after its tag is destroyed", async function () {
      const frame = await frameFor(groupTag._id);
      await Tags.removeAsync(groupTag._id);
      assert.equal((await frameFor(groupTag._id)).label, frame.label);
      assert.equal(frame.label, "anger");
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
  });

  describe("edits", function () {
    let boardId: string;

    beforeEach(async function () {
      this.timeout(10000);
      boardId = await createWhiteboard(operator, huntId);
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
    });

    it("rejects edits in an archived hunt", async function () {
      await Hunts.updateAsync(huntId, { $set: { isArchived: true } });
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { _id: Random.id(), type: "sticky", position: { x: 0, y: 0 } },
        ]),
        /archived/,
      );
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
    });

    it("rejects out-of-range and oversized input", async function () {
      const sticky = { _id: Random.id(), type: "sticky" as const };
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { ...sticky, position: { x: 1e9, y: 0 } },
        ]),
      );
      await assert.isRejected(
        upsertNodes(member, boardId, [
          { ...sticky, position: { x: 0, y: 0 }, text: "x".repeat(2001) },
        ]),
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
      );
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
      );
    });
  });

  describe("lines", function () {
    let boardId: string;

    beforeEach(async function () {
      this.timeout(10000);
      boardId = await createWhiteboard(operator, huntId);
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

  describe("guards on the backing puzzle", function () {
    let backingId: string;

    beforeEach(async function () {
      this.timeout(10000);
      const boardId = await createWhiteboard(operator, huntId);
      backingId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
    });

    const guarded: [string, (puzzleId: string) => unknown][] = [
      ["Puzzles.methods.addAnswer", (puzzleId) => ({ puzzleId, answer: "x" })],
      [
        "Puzzles.methods.removeAnswer",
        (puzzleId) => ({ puzzleId, guessId: Random.id() }),
      ],
      [
        "Guesses.method.create",
        (puzzleId) => ({ puzzleId, guess: "x", direction: 0, confidence: 50 }),
      ],
      [
        "Puzzles.methods.update",
        (puzzleId) => ({
          puzzleId,
          title: "x",
          tags: [],
          expectedAnswerCount: 1,
        }),
      ],
      [
        "Puzzles.methods.markComplete",
        (puzzleId) => ({ puzzleId, markedComplete: true }),
      ],
      ["Puzzles.methods.addTag", (puzzleId) => ({ puzzleId, tagName: "x" })],
      [
        "Puzzles.methods.removeTag",
        (puzzleId) => ({ puzzleId, tagId: Random.id() }),
      ],
      ["Puzzles.methods.unlock", (puzzleId) => ({ puzzleId })],
      ["Puzzles.methods.destroy", (puzzleId) => ({ puzzleId })],
      ["Puzzles.methods.undestroy", (puzzleId) => ({ puzzleId })],
      ["Puzzles.methods.ensureDocument", (puzzleId) => ({ puzzleId })],
      [
        "Puzzle.methods.createPuzzleDocument",
        (puzzleId) => ({ huntId, puzzleId, docType: "spreadsheet" }),
      ],
      [
        "Puzzles.methods.provideFeedback",
        (puzzleId) => ({ puzzleId, score: 1 }),
      ],
      ["Puzzles.methods.withdrawInterest", (puzzleId) => ({ puzzleId })],
    ];

    guarded.forEach(([name, args]) => {
      it(`${name} refuses the whiteboard`, async function () {
        await assert.isRejected(
          callMethod(name, operator, args(backingId)) as Promise<unknown>,
          /isn't a puzzle/,
        );
      });
    });

    it("covers every puzzle method", function () {
      // A new Puzzles method has to either guard against the whiteboard or be
      // added here on purpose.
      const allowed = new Set([
        "Puzzles.methods.create",
        "Puzzles.methods.bookmark",
      ]);
      const names = Object.keys(
        (
          Meteor as unknown as {
            server: { method_handlers: Record<string, unknown> };
          }
        ).server.method_handlers,
      ).filter((name) => /^Puzzles?\.methods\./.test(name));
      const covered = new Set(guarded.map(([name]) => name));
      names.forEach((name) => {
        assert.isTrue(
          covered.has(name) || allowed.has(name),
          `${name} is neither guarded nor allowed`,
        );
      });
    });
  });

  describe("live", function () {
    let boardId: string;

    beforeEach(async function () {
      this.timeout(10000);
      boardId = await createWhiteboard(operator, huntId);
    });

    const state = {
      cursor: { x: 1, y: 2 },
      drag: null,
      stroke: null,
    };

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

      close();
      // onClose removal isn't awaited by Meteor, so give it a moment.
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(
        await WhiteboardPresence.find({
          connection: connection.id,
        }).countAsync(),
        0,
      );
    });

    it("removes a connection's document when it unsubscribes", async function () {
      const { connection } = fakeConnection();
      await setLive(member, connection, boardId, state);
      await removePresence(boardId, connection.id);
      assert.equal(
        await WhiteboardPresence.find({
          connection: connection.id,
        }).countAsync(),
        0,
      );
    });

    it("rejects people outside the hunt", async function () {
      await assert.isRejected(
        setLive(outsider, fakeConnection().connection, boardId, state),
      );
    });

    it("rejects out-of-range positions and foreign nodes", async function () {
      const { connection } = fakeConnection();
      await assert.isRejected(
        setLive(member, connection, boardId, {
          ...state,
          cursor: { x: Number.POSITIVE_INFINITY, y: 0 },
        }),
      );
      await assert.isRejected(
        setLive(member, connection, boardId, {
          ...state,
          drag: [{ node: Random.id(), x: 0, y: 0 }],
        }),
      );
    });
  });

  describe("comments", function () {
    this.timeout(10000);

    let boardId: string;
    let backingId: string;

    beforeEach(async function () {
      boardId = await createWhiteboard(operator, huntId);
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
      await callMethod("ChatMessages.methods.send", userId, {
        puzzleId,
        content: JSON.stringify(content),
        ...rest,
      });
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
      callMethod("Whiteboards.methods.setCommentResolved", userId, {
        messageId,
        resolved,
      }) as Promise<void>;
    const deleteComment = (userId: string, messageId: string) =>
      callMethod("Whiteboards.methods.deleteComment", userId, {
        messageId,
      }) as Promise<void>;
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

    it("only replies to messages on the same puzzle", async function () {
      const otherPuzzle = (await Puzzles.findOneAsync({
        hunt: huntId,
        kind: { $ne: "whiteboard" },
      }))!;
      const elsewhere = await send(member, "elsewhere", {
        puzzleId: otherPuzzle._id,
      });
      await assert.isRejected(
        reply(member, elsewhere._id, "across puzzles"),
        /another puzzle/,
      );
    });

    it("still takes a reply to a deleted message, outside any thread", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      await deleteComment(member, root._id);
      const late = await reply(member, root._id, "too late");
      assert.equal(late.parentId, root._id);
      assert.notOk(late.thread);
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

    it("only resolves root comments, for people who can edit the board", async function () {
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

    it("won't let ordinary chat delete remove a comment", async function () {
      const root = await send(member, "root", { comment: { x: 0, y: 0 } });
      const own = await reply(member, root._id, "a reply");
      await assert.isRejected(
        callMethod("ChatMessages.methods.remove", member, { id: root._id }),
        /from the board/,
      );
      assert.notOk((await reload(root._id)).deleted);
      // Replies in a thread are ordinary messages.
      await callMethod("ChatMessages.methods.remove", member, { id: own._id });
      assert.isUndefined(
        await ChatMessages.findOneAllowingDeletedAsync(own._id),
      );
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
      notifications.forEach((n) => assert.equal(n.thread, root._id));
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
  });
});
