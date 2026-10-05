import { promisify } from "node:util";
import { Accounts } from "meteor/accounts-base";
import { check } from "meteor/check";
import { DDP } from "meteor/ddp";
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import { Tracker } from "meteor/tracker";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { assert } from "chai";
import type React from "react";
import type { Location, NavigateFunction } from "react-router";
import {
  MemoryRouter,
  Routes as ReactRouterRoutes,
  Route,
  useLocation,
  useNavigate,
} from "react-router";
import sinon from "sinon";
import FixtureHunt from "../../imports/FixtureHunt";
import ChatMessages from "../../imports/lib/models/ChatMessages";
import Hunts from "../../imports/lib/models/Hunts";
import Puzzles from "../../imports/lib/models/Puzzles";
import Tags from "../../imports/lib/models/Tags";
import WhiteboardEdges from "../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../imports/lib/models/WhiteboardNodes";
import type { WhiteboardEditPolicy } from "../../imports/lib/models/Whiteboards";
import Whiteboards from "../../imports/lib/models/Whiteboards";
import whiteboardContents from "../../imports/lib/publications/whiteboardContents";
import whiteboardForHunt from "../../imports/lib/publications/whiteboardForHunt";
import whiteboardPresence from "../../imports/lib/publications/whiteboardPresence";
import { COLLAPSED_FRAME_HEIGHT } from "../../imports/lib/whiteboard/collapse";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  cardSlot,
  FRAME_HEADER,
  FRAME_PADDING,
  GAP,
} from "../../imports/lib/whiteboard/layout";
import { MAX_LIVE_SELECTION } from "../../imports/lib/whiteboard/limits";
import addHuntUser from "../../imports/methods/addHuntUser";
import addPuzzleTag from "../../imports/methods/addPuzzleTag";
import createChatImageUpload from "../../imports/methods/createChatImageUpload";
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import createPuzzle from "../../imports/methods/createPuzzle";
import createWhiteboard from "../../imports/methods/createWhiteboard";
import deleteWhiteboardComment from "../../imports/methods/deleteWhiteboardComment";
import deleteWhiteboardEdges from "../../imports/methods/deleteWhiteboardEdges";
import deleteWhiteboardNodes from "../../imports/methods/deleteWhiteboardNodes";
import destroyPuzzle from "../../imports/methods/destroyPuzzle";
import promoteOperator from "../../imports/methods/promoteOperator";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import removePuzzleTag from "../../imports/methods/removePuzzleTag";
import resetWhiteboardLayout from "../../imports/methods/resetWhiteboardLayout";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import setWhiteboardCommentResolved from "../../imports/methods/setWhiteboardCommentResolved";
import setWhiteboardEditPolicy from "../../imports/methods/setWhiteboardEditPolicy";
import setWhiteboardLayoutLocked from "../../imports/methods/setWhiteboardLayoutLocked";
import setWhiteboardLive from "../../imports/methods/setWhiteboardLive";
import TypedMethod from "../../imports/methods/TypedMethod";
import undestroyPuzzle from "../../imports/methods/undestroyPuzzle";
import upsertWhiteboardEdges from "../../imports/methods/upsertWhiteboardEdges";
import upsertWhiteboardNodes from "../../imports/methods/upsertWhiteboardNodes";
import resetDatabase from "../lib/resetDatabase";
import createTestUser from "./createTestUser";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";

// Archiving through updateHunt means sending every field of the hunt, so this
// punches through instead.
const setHuntArchived = new TypedMethod<
  { huntId: string; isArchived: boolean },
  void
>("test.methods.whiteboard.setHuntArchived");

// Marks a puzzle deleted without syncing the board, leaving its card as it
// was.
const markPuzzleDeleted = new TypedMethod<{ puzzleId: string }, void>(
  "test.methods.whiteboard.markPuzzleDeleted",
);

// Starts a board's history afresh, so a test knows which versions it made.
const clearWhiteboardVersions = new TypedMethod<{ boardId: string }, void>(
  "test.methods.whiteboard.clearVersions",
);

// Solving or unsolving a puzzle without going through guesses.
const setPuzzleAnswers = new TypedMethod<
  { puzzleId: string; answers: string[] },
  void
>("test.methods.whiteboard.setPuzzleAnswers");

// Puts a user on a puzzle as if they'd opened it in a tab ageMs ago, visible
// or not, with no connection behind it, until clearPuzzleSubscribers.
const addPuzzleSubscriber = new TypedMethod<
  { puzzleId: string; userId: string; visible: boolean; ageMs: number },
  void
>("test.methods.whiteboard.addPuzzleSubscriber");

const clearPuzzleSubscribers = new TypedMethod<{ userIds: string[] }, void>(
  "test.methods.whiteboard.clearPuzzleSubscribers",
);

// The image bucket uploads are checked against: configured as TEST_BUCKET,
// or not at all.
const TEST_BUCKET = { bucketName: "jr-test-images", bucketRegion: "us-east-1" };
const setImageBucket = new TypedMethod<{ on: boolean }, void>(
  "test.methods.whiteboard.setImageBucket",
);

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;

  defineMethod(setPuzzleAnswers, {
    validate(arg: unknown) {
      check(arg, { puzzleId: String, answers: [String] });
      return arg;
    },

    async run({ puzzleId, answers }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      await Puzzles.updateAsync(puzzleId, { $set: { answers } });
    },
  });

  const Subscribers: typeof import("../../imports/server/models/Subscribers").default =
    require("../../imports/server/models/Subscribers").default;
  const serverId: typeof import("../../imports/server/serverId").default =
    require("../../imports/server/serverId").default;

  defineMethod(addPuzzleSubscriber, {
    validate(arg: unknown) {
      check(arg, {
        puzzleId: String,
        userId: String,
        visible: Boolean,
        ageMs: Number,
      });
      return arg;
    },

    async run({ puzzleId, userId, visible, ageMs }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      const puzzle = await Puzzles.findOneAsync(puzzleId);
      if (!puzzle) {
        throw new Meteor.Error(404, "Unknown puzzle");
      }
      // Straight to the collection, since the model stamps updatedAt itself
      const at = new Date(Date.now() - ageMs);
      await Subscribers.collection.insertAsync({
        _id: Random.id(),
        server: serverId,
        connection: Random.id(),
        user: userId,
        name: `puzzle:${puzzleId}`,
        context: { hunt: puzzle.hunt, puzzle: puzzleId, visible },
        createdAt: at,
        updatedAt: at,
      });
    },
  });

  defineMethod(clearPuzzleSubscribers, {
    validate(arg: unknown) {
      check(arg, { userIds: [String] });
      return arg;
    },

    async run({ userIds }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      await Subscribers.removeAsync({ user: { $in: userIds } });
    },
  });

  const WhiteboardVersions: typeof import("../../imports/lib/models/WhiteboardVersions").default =
    require("../../imports/lib/models/WhiteboardVersions").default;
  const WhiteboardVersionChunks: typeof import("../../imports/server/models/WhiteboardVersionChunks").default =
    require("../../imports/server/models/WhiteboardVersionChunks").default;

  defineMethod(clearWhiteboardVersions, {
    validate(arg: unknown) {
      check(arg, { boardId: String });
      return arg;
    },

    async run({ boardId }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      await WhiteboardVersions.removeAsync({ board: boardId });
      await WhiteboardVersionChunks.removeAsync({ board: boardId });
    },
  });

  const Settings: typeof import("../../imports/lib/models/Settings").default =
    require("../../imports/lib/models/Settings").default;

  defineMethod(setImageBucket, {
    validate(arg: unknown) {
      check(arg, { on: Boolean });
      return arg;
    },

    async run({ on }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      if (on) {
        await Settings.upsertAsync(
          { name: "s3.image_bucket" },
          {
            $set: {
              "value.bucketName": TEST_BUCKET.bucketName,
              "value.bucketRegion": TEST_BUCKET.bucketRegion,
            },
          },
        );
      } else {
        await Settings.removeAsync({ name: "s3.image_bucket" });
      }
    },
  });

  defineMethod(markPuzzleDeleted, {
    validate(arg: unknown) {
      check(arg, { puzzleId: String });
      return arg;
    },

    async run({ puzzleId }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      await Puzzles.updateAsync(puzzleId, { $set: { deleted: true } });
    },
  });

  defineMethod(setHuntArchived, {
    validate(arg: unknown) {
      check(arg, { huntId: String, isArchived: Boolean });
      return arg;
    },

    async run({ huntId, isArchived }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      await Hunts.updateAsync(huntId, { $set: { isArchived } });
    },
  });
}

if (Meteor.isClient) {
  const Routes: typeof import("../../imports/client/components/Routes").default =
    require("../../imports/client/components/Routes").default;
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const location: React.RefObject<Location | null> = { current: null };
  const navigate: React.RefObject<NavigateFunction | null> = {
    current: null,
  };

  const LocationCapture = () => {
    location.current = useLocation();
    navigate.current = useNavigate();
    return null;
  };

  const TestApp = () => (
    <MemoryRouter>
      <Routes />
      <ReactRouterRoutes>
        <Route path="*" element={<LocationCapture />} />
      </ReactRouterRoutes>
    </MemoryRouter>
  );

  const huntId = FixtureHunt._id;
  const boardPath = `/hunts/${huntId}/whiteboard`;

  const goTo = async (url: string) => {
    await act(async () => {
      await stabilize();
      await navigate.current!(url);
      await stabilize();
    });
  };

  const subs: Meteor.SubscriptionHandle[] = [];

  // Creating a board that exists returns it, so each test can start here.
  const ensureBoard = async () => {
    await createWhiteboard.callPromise({ huntId });
    subs.push(await typedSubscribe.async(whiteboardForHunt, { huntId }));
    const board = await Whiteboards.findOneAsync({ hunt: huntId });
    assert.ok(board);
    return board;
  };

  // Two cards side by side in a round's frame, GAP apart, with the board
  // opening at zoom 1 and the first card well inside the canvas, so screen
  // pixels are board units.
  const sideBySideCards = async (boardId: string) => {
    subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
    const nodes = await WhiteboardNodes.find({ board: boardId }).fetchAsync();
    const frames = new Map(
      nodes
        .filter((n) => n.type === "frame" && !n.parent)
        .map((f) => [f._id, f]),
    );
    const cards = nodes.filter(
      (n) => n.type === "puzzle" && !!n.parent && frames.has(n.parent),
    );
    const pairs = cards.flatMap((a) =>
      cards
        .filter(
          (b) =>
            b.parent === a.parent &&
            b.position.y === a.position.y &&
            b.position.x === a.position.x + CARD_WIDTH + GAP,
        )
        .map((b) => [a, b] as const),
    );
    assert.isNotEmpty(pairs);
    const [a, b] = pairs[0]!;
    const frame = frames.get(a.parent!)!;
    localStorage.setItem(
      `whiteboard:viewport:${boardId}`,
      JSON.stringify({
        x: 200 - frame.position.x - a.position.x,
        y: 200 - frame.position.y - a.position.y,
        zoom: 1,
      }),
    );
    return { a, b, frame };
  };

  const nodeElement = (id: string) =>
    document.querySelector(`.react-flow__node[data-id="${id}"]`);

  const handleOf = (nodeId: string, side: string) =>
    waitFor(
      () => {
        const found = document.querySelector(
          `.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${side}"]`,
        );
        assert.isNotNull(found);
        return found;
      },
      { timeout: 20000 },
    );

  // Whether a click at the middle of `element` would land on it
  const takesThePointer = (element: Element) => {
    const box = element.getBoundingClientRect();
    return element.contains(
      document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      ),
    );
  };

  // Stands in for the server refusing a method, answering later as Meteor
  // does, until restored.
  const refuseCalls = (method: { call: (...args: never[]) => unknown }) =>
    sinon.stub(method, "call").callsFake((...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === "function") {
        Meteor.defer(() =>
          callback(new Meteor.Error(403, "Refused for the test")),
        );
      }
    });

  // Stands in for a phone held upright, until restore puts things back:
  // PuzzlePage's narrow layout goes by innerWidth, and the board's compact
  // query (and anything else asking for a minimum or maximum width) by
  // matchMedia, which usehooks-ts reads. setPhone(false) makes those queries
  // answer as a wider screen would, and tells whatever is listening, leaving
  // innerWidth alone.
  const simulatePhone = () => {
    const width = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 500,
    });
    let phone = true;
    const listeners = new Set<() => void>();
    const realMatchMedia = window.matchMedia.bind(window);
    const matchMedia = sinon
      .stub(window, "matchMedia")
      .callsFake((query: string) => {
        if (!/m(in|ax)-width/.test(query)) return realMatchMedia(query);
        return {
          matches: phone !== query.includes("min-width"),
          media: query,
          onchange: null,
          addEventListener: sinon.fake(),
          removeEventListener: sinon.fake(),
          addListener: (listener: () => void) => listeners.add(listener),
          removeListener: (listener: () => void) => listeners.delete(listener),
          dispatchEvent: () => false,
        } as unknown as MediaQueryList;
      });
    return {
      setPhone: (on: boolean) => {
        phone = on;
        listeners.forEach((listener) => listener());
      },
      restore: () => {
        matchMedia.restore();
        if (width) {
          Object.defineProperty(window, "innerWidth", width);
        } else {
          delete (window as { innerWidth?: number }).innerWidth;
        }
      },
    };
  };

  // Types into a Slate editor, which takes text from beforeinput at the
  // selection focusing it set.
  const typeInto = async (editor: HTMLElement, text: string) => {
    await act(async () => {
      editor.focus();
      await stabilize();
    });
    await act(async () => {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: text,
          bubbles: true,
          cancelable: true,
        }),
      );
      await stabilize();
    });
  };

  const linesBetween = (boardId: string, source: string, target: string) =>
    WhiteboardEdges.find({
      board: boardId,
      source,
      target,
      auto: { $ne: true },
    }).countAsync();

  describe("whiteboard page", function () {
    afterEach(function () {
      subs.splice(0).forEach((sub) => sub.stop());
    });

    before(async function () {
      this.timeout(10000);
      await resetDatabase("whiteboard page");
      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
      await createFixtureHunt.callPromise();
      await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
      await promoteOperator.callPromise({
        targetUserId: Meteor.userId()!,
        huntId,
      });
    });

    it("offers operators a button to create the board", async function () {
      this.timeout(10000);
      render(<TestApp />);
      await goTo(boardPath);
      await screen.findByRole("button", { name: "Create whiteboard" });
    });

    it("doesn't offer to create a board on an archived hunt", async function () {
      this.timeout(10000);
      await setHuntArchived.callPromise({ huntId, isArchived: true });
      try {
        render(<TestApp />);
        await goTo(boardPath);
        await screen.findByText(/^This hunt is archived/);
        assert.isNull(
          screen.queryByRole("button", { name: "Create whiteboard" }),
        );
      } finally {
        await setHuntArchived.callPromise({ huntId, isArchived: false });
      }
    });

    it("shows the canvas, styled, and chat once there's a board", async function () {
      this.timeout(30000);
      await ensureBoard();
      render(<TestApp />);
      await goTo(boardPath);
      await waitFor(
        () => {
          assert.isNotNull(document.querySelector(".react-flow__node-puzzle"));
          assert.isNotNull(document.querySelector(".react-flow__node-frame"));
        },
        { timeout: 20000 },
      );
      // React Flow's own stylesheet is loaded
      const viewport = document.querySelector(".react-flow__viewport")!;
      assert.equal(getComputedStyle(viewport).pointerEvents, "none");
      const pane = document.querySelector(".react-flow__pane")!;
      assert.equal(getComputedStyle(pane).position, "absolute");
      // and the board's chat is beside it
      await waitFor(() =>
        assert.isNotNull(document.querySelector("[data-slate-editor]")),
      );
    });

    it("sends the backing puzzle's page to the board", async function () {
      this.timeout(10000);
      const board = await ensureBoard();
      render(<TestApp />);
      await goTo(`/hunts/${huntId}/puzzles/${board.puzzle}`);
      await waitFor(() => {
        assert.equal(location.current?.pathname, boardPath);
      });
    });

    it("doesn't let things be picked up while the line tool is in use", async function () {
      this.timeout(30000);
      await ensureBoard();
      render(<TestApp />);
      await goTo(boardPath);
      await waitFor(
        () => {
          assert.isNotNull(
            document.querySelector(".react-flow__node-puzzle.draggable"),
          );
          assert.isNotNull(
            document.querySelector(".react-flow__handle.connectable"),
          );
        },
        { timeout: 20000 },
      );
      const lineTool = screen.getByTitle(/^Line:/);
      await act(async () => {
        fireEvent.click(lineTool);
        await stabilize();
      });
      await waitFor(() => {
        assert.isNull(document.querySelector(".react-flow__node.draggable"));
        assert.isNull(document.querySelector(".react-flow__node.selectable"));
        assert.isNull(
          document.querySelector(".react-flow__handle.connectable"),
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByTitle(/^Select and move/));
        await stabilize();
      });
      await waitFor(() => {
        assert.isNotNull(
          document.querySelector(".react-flow__node-puzzle.draggable"),
        );
      });
    });

    it("joins a line from a handle to what it's let go on, not a nearby handle", async function () {
      this.timeout(30000);
      const board = await ensureBoard();
      const { a, b } = await sideBySideCards(board._id);
      const before = await linesBetween(board._id, a._id, b._id);

      render(<TestApp />);
      await goTo(boardPath);
      const handle = await handleOf(a._id, "right");
      const cardA = nodeElement(a._id)!.getBoundingClientRect();
      const cardB = nodeElement(b._id)!.getBoundingClientRect();
      const y = cardA.top + cardA.height / 2;
      const drag = async (to: { x: number; y: number }) => {
        const from = handle.getBoundingClientRect();
        await act(async () => {
          fireEvent.mouseDown(handle, {
            button: 0,
            clientX: from.left + from.width / 2,
            clientY: from.top + from.height / 2,
          });
          fireEvent.mouseMove(document, { clientX: to.x, clientY: to.y });
          fireEvent.mouseUp(document, { clientX: to.x, clientY: to.y });
          await stabilize();
        });
      };

      // Off the first card's handle but in the gap nearer it, and within
      // React Flow's snapping distance of the second card's handle
      assert.isAbove(cardB.left - cardA.right, 14);
      await drag({ x: cardA.right + 7, y });
      // On the second card itself
      await drag({ x: cardB.left + cardB.width / 2, y });
      await waitFor(
        async () =>
          assert.equal(await linesBetween(board._id, a._id, b._id), before + 1),
        { timeout: 10000 },
      );
    });

    it("joins a line from a clicked handle to the next handle clicked", async function () {
      this.timeout(30000);
      const board = await ensureBoard();
      const { a, b } = await sideBySideCards(board._id);
      const before = await linesBetween(board._id, a._id, b._id);

      render(<TestApp />);
      await goTo(boardPath);
      const from = await handleOf(a._id, "right");
      const to = await handleOf(b._id, "left");
      const click = (handle: Element) => {
        const box = handle.getBoundingClientRect();
        fireEvent.click(handle, {
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        });
      };
      await act(async () => {
        click(from);
        click(to);
        await stabilize();
      });
      await waitFor(
        async () =>
          assert.equal(await linesBetween(board._id, a._id, b._id), before + 1),
        { timeout: 10000 },
      );
    });

    it("leaves cards that ink is drawn round within reach", async function () {
      this.timeout(30000);
      const board = await ensureBoard();
      const { a, frame } = await sideBySideCards(board._id);
      // Ink drawn round three sides of the first card, so its box covers the
      // card but none of it is drawn over the card
      const ink = Random.id();
      const width = CARD_WIDTH + 40;
      const height = CARD_HEIGHT + 40;
      await upsertWhiteboardNodes.callPromise({
        boardId: board._id,
        nodes: [
          {
            _id: ink,
            type: "ink",
            parent: frame._id,
            position: { x: a.position.x - 20, y: a.position.y - 20 },
            width,
            height,
            points: [
              [0, 0, 0.5],
              [width, 0, 0.5],
              [width, height, 0.5],
              [0, height, 0.5],
            ],
            strokeWidth: "medium",
            color: "black",
            stroke: Random.id(),
          },
        ],
      });
      try {
        render(<TestApp />);
        await goTo(boardPath);
        await waitFor(
          () => {
            assert.isNotNull(nodeElement(ink));
            assert.isNotNull(nodeElement(a._id));
          },
          { timeout: 20000 },
        );
        assert.isTrue(takesThePointer(nodeElement(a._id)!));
      } finally {
        await deleteWhiteboardNodes.callPromise({
          boardId: board._id,
          nodeIds: [ink],
        });
      }
    });

    it("lets a read-only board's cards open their puzzles", async function () {
      this.timeout(30000);
      const board = await ensureBoard();
      const { a } = await sideBySideCards(board._id);
      await setHuntArchived.callPromise({ huntId, isArchived: true });
      try {
        render(<TestApp />);
        await goTo(boardPath);
        await screen.findByText("Viewing only", {}, { timeout: 20000 });
        const open = await waitFor(
          () => {
            const found = nodeElement(a._id)?.querySelector(
              'a[title="Open puzzle"]',
            );
            assert.exists(found);
            return found;
          },
          { timeout: 20000 },
        );
        assert.isTrue(takesThePointer(open));
      } finally {
        await setHuntArchived.callPromise({ huntId, isArchived: false });
      }
    });

    describe("comments", function () {
      const panelText = () =>
        document.querySelector(".react-flow__panel.top.right")?.textContent ??
        "";

      before(async function () {
        this.timeout(30000);
        const board = await ensureBoard();
        await sendChatMessage.callPromise({
          puzzleId: board.puzzle,
          content: JSON.stringify({
            type: "message",
            children: [{ text: "Is this the meta?" }],
          }),
          comment: { x: 40, y: -200 },
        });
      });

      it("opens a comment from a ?comment= link, then drops the link", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(boardPath);
        const commentId = await waitFor(
          async () => {
            const found = await ChatMessages.findOneAsync({
              comment: { $exists: true },
            });
            assert.ok(found);
            return found._id;
          },
          { timeout: 20000 },
        );
        await goTo(`${boardPath}?comment=${commentId}`);
        await waitFor(
          () => {
            // The only comment on the board
            assert.isNotNull(document.querySelector(".jr-comment-pin"));
            assert.include(panelText(), "Is this the meta?");
            assert.equal(location.current?.search, "");
          },
          { timeout: 20000 },
        );
      });

      it("shows a comment on the board from chat", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(boardPath);
        // The link under the comment in chat, rather than the icon in its
        // hover menu
        const show = await screen.findByText(
          "Show on board",
          { selector: "button" },
          { timeout: 20000 },
        );
        assert.include(
          show.closest("div")?.textContent ?? "",
          "Comment on the board",
        );
        assert.notInclude(panelText(), "Is this the meta?");
        await act(async () => {
          fireEvent.click(show);
          await stabilize();
        });
        await waitFor(() => {
          assert.include(panelText(), "Is this the meta?");
        });
      });
    });

    describe("finding things", function () {
      // Temperance, from the fixture hunt
      const puzzleId = "yZKtXk5oLJMGqwP6E";
      let boardId: string;
      let cardId: string;
      let cardHome: { parent?: string; position: { x: number; y: number } };

      const paneCentre = () => {
        const box = document
          .querySelector(".react-flow__pane")!
          .getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      };

      // The card is marked, and has been brought to the middle of the board.
      const assertShown = () => {
        assert.isNotNull(
          document.querySelector(`.jr-node-pulse[data-node="${cardId}"]`),
        );
        const card = nodeElement(cardId);
        assert.isNotNull(card);
        const box = card.getBoundingClientRect();
        const centre = paneCentre();
        assert.closeTo(box.left + box.width / 2, centre.x, 4);
        assert.closeTo(box.top + box.height / 2, centre.y, 4);
      };

      before(async function () {
        this.timeout(10000);
        boardId = (await ensureBoard())._id;
        subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
        const card = await WhiteboardNodes.findOneAsync({
          board: boardId,
          puzzle: puzzleId,
        });
        assert.ok(card);
        cardId = card._id;
        cardHome = { parent: card.parent, position: card.position };
      });

      // Deleting a card hides it; putting it back where it was undoes that.
      const hideCard = () =>
        deleteWhiteboardNodes.callPromise({ boardId, nodeIds: [cardId] });
      const restoreCard = () =>
        upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: cardId,
              hidden: false,
              parent: cardHome.parent ?? null,
              position: cardHome.position,
            },
          ],
        });

      const searchFor = async (text: string) => {
        const search = await screen.findByRole(
          "combobox",
          { name: "Search the board" },
          { timeout: 20000 },
        );
        await act(async () => {
          fireEvent.focus(search);
          fireEvent.change(search, { target: { value: text } });
          await stabilize();
        });
        return search;
      };

      beforeEach(function () {
        // Opens well away from the card
        localStorage.setItem(
          `whiteboard:viewport:${boardId}`,
          JSON.stringify({ x: 4000, y: 4000, zoom: 0.5 }),
        );
      });

      it("pans to a card the search finds, and marks it", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(boardPath);
        const search = await screen.findByRole(
          "combobox",
          { name: "Search the board" },
          { timeout: 20000 },
        );
        await act(async () => {
          fireEvent.focus(search);
          fireEvent.change(search, { target: { value: "temperance" } });
          await stabilize();
        });
        const option = await screen.findByRole("option", {
          name: /^Temperance/,
        });
        await act(async () => {
          fireEvent.click(option);
          await stabilize();
        });
        await waitFor(assertShown, { timeout: 10000 });
      });

      it("shows the card a ?puzzle= link names, then drops the link", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(`${boardPath}?puzzle=${puzzleId}`);
        await waitFor(
          () => {
            assertShown();
            assert.equal(location.current?.search, "");
          },
          { timeout: 20000 },
        );
      });

      it("opens the view a ?v= link names, then drops the link", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(`${boardPath}?v=1000,-500,1.5`);
        await waitFor(
          () => {
            const centre = paneCentre();
            const viewport = document.querySelector<HTMLElement>(
              ".react-flow__viewport",
            )!;
            const { a, e, f } = new DOMMatrix(
              getComputedStyle(viewport).transform,
            );
            const pane = document
              .querySelector(".react-flow__pane")!
              .getBoundingClientRect();
            assert.closeTo(a, 1.5, 0.001);
            // Board point (1000, -500) is in the middle of the pane
            assert.closeTo(pane.left + e + 1000 * a, centre.x, 1);
            assert.closeTo(pane.top + f - 500 * a, centre.y, 1);
            assert.equal(location.current?.search, "");
          },
          { timeout: 20000 },
        );
      });

      it("opens a card's puzzle on a double-click", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(`${boardPath}?puzzle=${puzzleId}`);
        await waitFor(assertShown, { timeout: 20000 });
        const box = nodeElement(cardId)!.getBoundingClientRect();
        await act(async () => {
          fireEvent.doubleClick(nodeElement(cardId)!, {
            // Clear of the handles at the middle of each side
            clientX: box.left + 30,
            clientY: box.top + box.height / 2 + 10,
          });
          await stabilize();
        });
        await waitFor(() => {
          assert.equal(
            location.current?.pathname,
            `/hunts/${huntId}/puzzles/${puzzleId}`,
          );
        });
      });

      it("goes from a puzzle's page to its card on the board", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(`/hunts/${huntId}/puzzles/${puzzleId}`);
        // The related puzzles' rows have their own
        const show = await waitFor(
          () => {
            const found = screen
              .getAllByRole("link", { name: "Show on board" })
              .find((link) =>
                link.getAttribute("href")?.endsWith(`?puzzle=${puzzleId}`),
              );
            assert.exists(found);
            return found;
          },
          { timeout: 20000 },
        );
        await act(async () => {
          fireEvent.click(show);
          await stabilize();
        });
        await waitFor(
          () => {
            assert.equal(location.current?.pathname, boardPath);
            assert.equal(location.current?.search, "");
            assertShown();
          },
          { timeout: 20000 },
        );
      });

      it("puts back a hidden card from the search only when asked", async function () {
        this.timeout(30000);
        await hideCard();
        try {
          render(<TestApp />);
          await goTo(boardPath);
          const search = await searchFor("temperance");
          const option = await screen.findByRole("option", {
            name: /^Temperance/,
          });
          assert.include(option.textContent ?? "", "Not on the board");
          // Enter on the row, or a click on it, leaves the card where it is
          await act(async () => {
            fireEvent.keyDown(search, { key: "Enter" });
            fireEvent.click(option);
            await stabilize();
          });
          assert.isTrue(
            (await WhiteboardNodes.findOneAsync(cardId))?.hidden ?? false,
          );
          await act(async () => {
            fireEvent.click(
              within(option).getByRole("button", { name: "Put back" }),
            );
            await stabilize();
          });
          await waitFor(
            async () => {
              const card = await WhiteboardNodes.findOneAsync(cardId);
              assert.ok(card);
              assert.isNotOk(card.hidden);
              assert.isNotNull(
                document.querySelector(`.jr-node-pulse[data-node="${cardId}"]`),
              );
            },
            { timeout: 10000 },
          );
        } finally {
          await restoreCard();
        }
      });

      it("puts back a removed frame from the search", async function () {
        this.timeout(30000);
        // Any round's frame but Temperance's, whose card the other tests use
        const frame = await WhiteboardNodes.findOneAsync({
          board: boardId,
          type: "frame",
          tag: { $exists: true },
          hidden: { $ne: true },
          parent: { $exists: false },
          ...(cardHome.parent ? { _id: { $ne: cardHome.parent } } : {}),
        });
        assert.ok(frame);
        const tag = await Tags.findOneAsync(frame.tag ?? "");
        assert.ok(tag);
        const label = tag.name.replace(/^group:/, "");
        await deleteWhiteboardNodes.callPromise({
          boardId,
          nodeIds: [frame._id],
        });
        render(<TestApp />);
        await goTo(boardPath);
        await searchFor(label);
        const option = await waitFor(() => {
          const found = screen
            .getAllByRole("option")
            .find((o) => o.querySelector(`[title="${CSS.escape(label)}"]`));
          assert.ok(found);
          assert.include(found.textContent ?? "", "Not on the board");
          return found;
        });
        await act(async () => {
          fireEvent.click(
            within(option).getByRole("button", { name: "Put back" }),
          );
          await stabilize();
        });
        await waitFor(
          async () => {
            const back = await WhiteboardNodes.findOneAsync(frame._id);
            assert.ok(back);
            assert.isNotOk(back.hidden);
            assert.isUndefined(back.parent);
          },
          { timeout: 10000 },
        );
      });

      it("finds a hidden card on a read-only board, with no way to put it back", async function () {
        this.timeout(30000);
        await hideCard();
        await setHuntArchived.callPromise({ huntId, isArchived: true });
        try {
          render(<TestApp />);
          await goTo(boardPath);
          await screen.findByText("Viewing only", {}, { timeout: 20000 });
          const search = await searchFor("temperance");
          const option = await screen.findByRole("option", {
            name: /^Temperance/,
          });
          assert.equal(option.getAttribute("aria-disabled"), "true");
          assert.include(option.textContent ?? "", "Not on the board");
          assert.isNull(
            within(option).queryByRole("button", { name: "Put back" }),
          );
          await act(async () => {
            fireEvent.keyDown(search, { key: "Enter" });
            await stabilize();
          });
          assert.isTrue(
            (await WhiteboardNodes.findOneAsync(cardId))?.hidden ?? false,
          );
        } finally {
          await setHuntArchived.callPromise({ huntId, isArchived: false });
          await restoreCard();
        }
      });

      it("says so when a ?puzzle= link's card is hidden, then drops the link", async function () {
        this.timeout(30000);
        await hideCard();
        try {
          render(<TestApp />);
          await goTo(`${boardPath}?puzzle=${puzzleId}`);
          await screen.findByText(
            "That puzzle isn't on the board.",
            {},
            { timeout: 20000 },
          );
          await waitFor(() => assert.equal(location.current?.search, ""));
        } finally {
          await restoreCard();
        }
      });

      it("shows the node a ?node= link names, then drops the link", async function () {
        this.timeout(30000);
        const sticky = Random.id();
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: sticky,
              type: "sticky",
              position: { x: 3000, y: 3000 },
              width: 160,
              height: 120,
              text: "Linked note",
            },
          ],
        });
        try {
          render(<TestApp />);
          await goTo(`${boardPath}?node=${sticky}`);
          await waitFor(
            () => {
              assert.isNotNull(
                document.querySelector(`.jr-node-pulse[data-node="${sticky}"]`),
              );
              assert.equal(location.current?.search, "");
            },
            { timeout: 20000 },
          );
        } finally {
          await deleteWhiteboardNodes.callPromise({
            boardId,
            nodeIds: [sticky],
          });
        }
      });

      it("drops a ?v= link it can't read, without a notice", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(`${boardPath}?v=abc`);
        await screen.findByRole(
          "combobox",
          { name: "Search the board" },
          { timeout: 20000 },
        );
        await waitFor(() => assert.equal(location.current?.search, ""));
        assert.isNull(screen.queryByText(/^That (puzzle )?isn't on the board/));
      });

      it("jumps to the search on / while the board has focus, and leaves Ctrl+F alone elsewhere", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(boardPath);
        const search = await screen.findByRole(
          "combobox",
          { name: "Search the board" },
          { timeout: 20000 },
        );
        // Lets the canvas's effects, which listen for the keys, run
        await act(async () => {
          await stabilize();
        });
        const pane = document.querySelector(".react-flow__pane")!;
        const box = pane.getBoundingClientRect();
        const at = {
          button: 0,
          pointerId: 1,
          clientX: box.left + box.width * 0.6,
          clientY: box.top + box.height * 0.6,
        };
        await act(async () => {
          fireEvent.pointerDown(pane, at);
          fireEvent.pointerUp(pane, at);
          fireEvent.keyDown(pane, { key: "/" });
          await stabilize();
        });
        assert.equal(document.activeElement, search);

        await act(async () => {
          search.blur();
          fireEvent.pointerDown(document.body);
          await stabilize();
        });
        let notCancelled = true;
        await act(async () => {
          notCancelled = fireEvent.keyDown(document.body, {
            key: "f",
            ctrlKey: true,
          });
          await stabilize();
        });
        assert.isTrue(notCancelled, "the browser's find still runs");
        assert.notEqual(document.activeElement, search);
      });

      it("says so when a ?comment= link's thread has gone", async function () {
        this.timeout(30000);
        const board = await ensureBoard();
        await sendChatMessage.callPromise({
          puzzleId: board.puzzle,
          content: JSON.stringify({
            type: "message",
            children: [{ text: "Soon gone" }],
          }),
          comment: { x: 777, y: 777 },
        });
        render(<TestApp />);
        await goTo(boardPath);
        const commentId = await waitFor(
          async () => {
            const found = await ChatMessages.findOneAsync({
              "comment.x": 777,
            });
            assert.ok(found);
            return found._id;
          },
          { timeout: 20000 },
        );
        await deleteWhiteboardComment.callPromise({ messageId: commentId });
        await waitFor(async () => {
          assert.isUndefined(await ChatMessages.findOneAsync(commentId));
        });
        await goTo(`${boardPath}?comment=${commentId}`);
        await screen.findByText(
          "That comment is gone.",
          {},
          { timeout: 20000 },
        );
        await waitFor(() => assert.equal(location.current?.search, ""));
      });
    });

    describe("deleted and replaced puzzles", function () {
      let boardId: string;

      before(async function () {
        this.timeout(10000);
        boardId = (await ensureBoard())._id;
      });

      // A new puzzle in a round of its own, once its card is on the board
      const puzzleOnBoard = async (title: string) => {
        subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
        const puzzleId = await createPuzzle.callPromise({
          huntId,
          title,
          tags: ["group:stand-ins"],
          expectedAnswerCount: 1,
          docType: "spreadsheet",
        });
        const card = await waitFor(
          async () => {
            const found = await WhiteboardNodes.findOneAsync({
              board: boardId,
              puzzle: puzzleId,
            });
            assert.ok(found);
            return found;
          },
          { timeout: 10000 },
        );
        return { puzzleId, card };
      };

      // The puzzle list's delete button on the row with this title
      const deleteButtonFor = (title: string) =>
        screen.queryAllByTitle("Delete puzzle...").find((button) => {
          for (
            let row = button.parentElement;
            row?.querySelectorAll('[title="Delete puzzle..."]').length === 1;
            row = row.parentElement
          ) {
            if (row.textContent?.includes(title)) return true;
          }
          return false;
        });

      it("keeps a replaced puzzle's card where it was, for its replacement", async function () {
        this.timeout(60000);
        const { card } = await puzzleOnBoard("Withdrawn puzzle");
        // Moved by hand, so placement wouldn't put anything here
        const position = { x: card.position.x + 13, y: card.position.y + 17 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [{ _id: card._id, position }],
        });
        const { puzzleId: replacement } =
          await puzzleOnBoard("Stand-in puzzle");

        render(<TestApp />);
        await goTo(`/hunts/${huntId}/puzzles`);
        const remove = await waitFor(
          () => {
            const found = deleteButtonFor("Withdrawn puzzle");
            assert.exists(found);
            return found;
          },
          { timeout: 20000 },
        );
        await act(async () => {
          fireEvent.click(remove);
          await stabilize();
        });
        const dialog = await screen.findByRole(
          "dialog",
          {},
          { timeout: 10000 },
        );
        const choose = await within(dialog).findByRole(
          "combobox",
          {},
          { timeout: 10000 },
        );
        await act(async () => {
          fireEvent.focus(choose);
          fireEvent.change(choose, { target: { value: "Stand-in puzzle" } });
          await stabilize();
        });
        const option = await within(dialog).findByText("Stand-in puzzle");
        await act(async () => {
          fireEvent.click(option);
          await stabilize();
        });
        await act(async () => {
          fireEvent.click(
            within(dialog).getByRole("button", { name: "Delete" }),
          );
          await stabilize();
        });

        await waitFor(
          async () => {
            const cards = await WhiteboardNodes.find({
              board: boardId,
              puzzle: replacement,
            }).fetchAsync();
            assert.deepEqual(
              cards.map((c) => [c._id, c.position, c.parent]),
              [[card._id, position, card.parent]],
            );
          },
          { timeout: 20000 },
        );
        await goTo(`${boardPath}?node=${card._id}`);
        await waitFor(
          () => {
            const shown = nodeElement(card._id);
            assert.include(shown?.textContent ?? "", "Stand-in puzzle");
            assert.notInclude(shown?.textContent ?? "", "Withdrawn puzzle");
          },
          { timeout: 20000 },
        );
      });

      it("takes a deleted puzzle's card off the board and puts it back where it was", async function () {
        this.timeout(60000);
        const { puzzleId, card } = await puzzleOnBoard("Wavering puzzle");
        render(<TestApp />);
        await goTo(`${boardPath}?node=${card._id}`);
        await waitFor(() => assert.isNotNull(nodeElement(card._id)), {
          timeout: 20000,
        });

        await destroyPuzzle.callPromise({
          puzzleId,
          copySheetsToReplacement: false,
        });
        await waitFor(
          async () => {
            assert.isNull(nodeElement(card._id));
            assert.isTrue(
              (await WhiteboardNodes.findOneAsync(card._id))?.hidden,
            );
          },
          { timeout: 10000 },
        );

        await undestroyPuzzle.callPromise({ puzzleId });
        await waitFor(
          async () => {
            assert.isNotNull(nodeElement(card._id));
            const back = await WhiteboardNodes.findOneAsync(card._id);
            assert.ok(back);
            assert.isUndefined(back.hidden);
            assert.deepEqual(back.position, card.position);
            assert.equal(back.parent, card.parent);
          },
          { timeout: 10000 },
        );
      });

      it("says so when a ?comment= link's card has gone with its puzzle", async function () {
        this.timeout(60000);
        const { puzzleId, card } = await puzzleOnBoard("Vanishing puzzle");
        const board = await ensureBoard();
        await sendChatMessage.callPromise({
          puzzleId: board.puzzle,
          content: JSON.stringify({
            type: "message",
            children: [{ text: "On the vanishing card" }],
          }),
          comment: { node: card._id, x: 5, y: 5 },
        });
        render(<TestApp />);
        await goTo(boardPath);
        const commentId = await waitFor(
          async () => {
            const found = await ChatMessages.findOneAsync({
              "comment.node": card._id,
            });
            assert.ok(found);
            return found._id;
          },
          { timeout: 20000 },
        );
        await markPuzzleDeleted.callPromise({ puzzleId });
        await goTo(`${boardPath}?comment=${commentId}`);
        await screen.findByText(
          "That isn't on the board any more.",
          {},
          { timeout: 20000 },
        );
        await waitFor(() => assert.equal(location.current?.search, ""));
      });
    });

    describe("what cards and rounds show", function () {
      // From the fixture hunt: The Robber is the unsolved meta of the Games
      // Island round, some of whose feeders are unsolved too. Cross Words is
      // an ordinary puzzle.
      const gamesIsland = "nPbTi6DPvjAkot94n";
      const gamesIslandMetaFor = "5rMx6AkFJnTxxn9g3";
      const robber = "3zTi6pDY9mHJSbLoS";
      const crossWords = "eQpPRTrHJdYrGStFY";
      let boardId: string;

      before(async function () {
        this.timeout(10000);
        boardId = (await ensureBoard())._id;
        subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
      });

      const nodeFor = async (selector: { tag?: string; puzzle?: string }) => {
        const node = await WhiteboardNodes.findOneAsync({
          board: boardId,
          ...selector,
        });
        assert.ok(node);
        return node._id;
      };

      it("counts a round's solved cards and marks it finished once its meta is solved", async function () {
        this.timeout(30000);
        const frameId = await nodeFor({ tag: gamesIsland });
        render(<TestApp />);
        await goTo(`${boardPath}?node=${frameId}`);
        const header = () =>
          nodeElement(frameId)?.textContent?.replaceAll(/\s+/g, " ") ?? "";
        await waitFor(
          () => {
            assert.match(header(), /\d+\/\d+ solved/);
            assert.notInclude(header(), "Finished");
          },
          { timeout: 20000 },
        );
        try {
          await setPuzzleAnswers.callPromise({
            puzzleId: robber,
            answers: ["MONEY"],
          });
          await waitFor(
            () => {
              assert.match(header(), /Finished, [1-9]\d* unsolved/);
              assert.isNotNull(
                nodeElement(frameId)!.querySelector("svg.fa-check"),
              );
            },
            { timeout: 10000 },
          );
        } finally {
          await setPuzzleAnswers.callPromise({ puzzleId: robber, answers: [] });
        }
        await waitFor(() => assert.notInclude(header(), "Finished"), {
          timeout: 10000,
        });
      });

      it("shows the people the puzzle list would on a card", async function () {
        this.timeout(30000);
        const cardId = await nodeFor({ puzzle: robber });
        const viewer = await createTestUser.callPromise({
          email: "card-viewer@example.com",
          password: "password",
          displayName: "Vic",
        });
        const gone = await createTestUser.callPromise({
          email: "card-gone@example.com",
          password: "password",
          displayName: "Gail",
        });
        await addHuntUser.callPromise({
          huntId,
          email: "card-viewer@example.com",
        });
        await addHuntUser.callPromise({
          huntId,
          email: "card-gone@example.com",
        });
        // Vic has the puzzle open; Gail's only trace is a tab she hid ten
        // minutes ago, which the puzzle list no longer counts
        await addPuzzleSubscriber.callPromise({
          puzzleId: robber,
          userId: viewer,
          visible: true,
          ageMs: 0,
        });
        await addPuzzleSubscriber.callPromise({
          puzzleId: robber,
          userId: gone,
          visible: false,
          ageMs: 10 * 60 * 1000,
        });
        try {
          render(<TestApp />);
          await goTo(`${boardPath}?puzzle=${robber}`);
          await waitFor(
            () => {
              const eye = nodeElement(cardId)?.querySelector("svg.fa-eye");
              assert.exists(eye);
              // The eye's group holds the viewers' avatars, here initials
              assert.equal(eye.parentElement?.textContent, "V");
            },
            { timeout: 20000 },
          );
        } finally {
          await clearPuzzleSubscribers.callPromise({ userIds: [viewer, gone] });
        }
      });

      it("shows a card's priority, stuck flag and needs: tags", async function () {
        this.timeout(30000);
        const cardId = await nodeFor({ puzzle: crossWords });
        const added = ["priority:high", "stuck", "needs:extraction"];
        for (const tagName of added) {
          await addPuzzleTag.callPromise({ puzzleId: crossWords, tagName });
        }
        try {
          render(<TestApp />);
          await goTo(`${boardPath}?puzzle=${crossWords}`);
          await waitFor(
            () => {
              const card = nodeElement(cardId) as HTMLElement | null;
              assert.isNotNull(card);
              within(card).getByTitle("High priority");
              within(card).getByTitle("Stuck");
              within(card).getByText("needs:extraction");
            },
            { timeout: 20000 },
          );
        } finally {
          const tags = await Tags.find({
            hunt: huntId,
            name: { $in: added },
          }).fetchAsync();
          for (const tag of tags) {
            await removePuzzleTag.callPromise({
              puzzleId: crossWords,
              tagId: tag._id,
            });
          }
        }
      });

      it("brings out a meta's feeder arrows while it's hovered", async function () {
        this.timeout(30000);
        const metaCard = await nodeFor({ puzzle: robber });
        const arrows = await WhiteboardEdges.find({
          board: boardId,
          auto: true,
        }).fetchAsync();
        const intoMeta = new Set(
          arrows.filter((a) => a.target === metaCard).map((a) => a._id),
        );
        assert.isNotEmpty(intoMeta);
        render(<TestApp />);
        await goTo(`${boardPath}?puzzle=${robber}`);
        const card = await waitFor(
          () => {
            const found = nodeElement(metaCard);
            assert.isNotNull(found);
            // Its arrows are drawn
            assert.isNotNull(
              document.querySelector(
                `.react-flow__edge[data-id="${[...intoMeta][0]}"]`,
              ),
            );
            return found;
          },
          { timeout: 20000 },
        );
        const emphasis = (id: string) => {
          const path = document.querySelector(
            `.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`,
          );
          if (path?.classList.contains("jr-feeder-raised")) return "raised";
          if (path?.classList.contains("jr-feeder-faded")) return "faded";
          return path ? "plain" : undefined;
        };
        await act(async () => {
          fireEvent.mouseEnter(card);
          await stabilize();
        });
        await waitFor(() => {
          arrows.forEach((arrow) => {
            const shown = emphasis(arrow._id);
            if (!shown) return;
            assert.equal(
              shown,
              intoMeta.has(arrow._id) || arrow.source === metaCard
                ? "raised"
                : "faded",
              arrow._id,
            );
          });
        });
        await act(async () => {
          fireEvent.mouseLeave(card);
          await stabilize();
        });
        await waitFor(() => {
          intoMeta.forEach((id) => {
            const shown = emphasis(id);
            if (shown) assert.equal(shown, "plain");
          });
        });
      });

      it("brings out a meta's feeder arrows while it's selected", async function () {
        this.timeout(30000);
        const metaCard = await nodeFor({ puzzle: robber });
        const intoMeta = (
          await WhiteboardEdges.find({
            board: boardId,
            auto: true,
            target: metaCard,
          }).fetchAsync()
        ).map((a) => a._id);
        assert.isNotEmpty(intoMeta);
        render(<TestApp />);
        await goTo(`${boardPath}?puzzle=${robber}`);
        const arrowPath = (id: string) =>
          document.querySelector(
            `.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`,
          );
        const card = await waitFor(
          () => {
            const found = nodeElement(metaCard);
            assert.isNotNull(found);
            assert.isNotNull(arrowPath(intoMeta[0]!));
            return found;
          },
          { timeout: 20000 },
        );
        assert.isFalse(
          arrowPath(intoMeta[0]!)!.classList.contains("jr-feeder-raised"),
        );
        // A click with no pointer movement selects without hovering.
        await act(async () => {
          fireEvent.click(card);
          await stabilize();
        });
        await waitFor(() => {
          assert.isTrue(card.classList.contains("selected"));
          intoMeta.forEach((id) => {
            const path = arrowPath(id);
            if (path)
              assert.isTrue(path.classList.contains("jr-feeder-raised"));
          });
        });
      });

      it("says a round is ready to meta once every feeder is solved", async function () {
        this.timeout(30000);
        const frameId = await nodeFor({ tag: gamesIsland });
        render(<TestApp />);
        await goTo(`${boardPath}?node=${frameId}`);
        const header = () =>
          nodeElement(frameId)?.textContent?.replaceAll(/\s+/g, " ") ?? "";
        await waitFor(
          () => {
            assert.match(header(), /\d+\/\d+ solved/);
            assert.notInclude(header(), "Ready to meta");
          },
          { timeout: 20000 },
        );
        const feeders = await Puzzles.find({
          hunt: huntId,
          $and: [{ tags: gamesIsland }, { tags: { $ne: gamesIslandMetaFor } }],
        }).fetchAsync();
        assert.isNotEmpty(feeders);
        try {
          for (const feeder of feeders) {
            await setPuzzleAnswers.callPromise({
              puzzleId: feeder._id,
              answers: Array.from(
                { length: Math.max(feeder.expectedAnswerCount, 1) },
                (_, i) => `ANSWER${i}`,
              ),
            });
          }
          await waitFor(
            () => {
              assert.include(header(), "Ready to meta");
              assert.notInclude(header(), "Finished");
            },
            { timeout: 10000 },
          );
        } finally {
          for (const feeder of feeders) {
            await setPuzzleAnswers.callPromise({
              puzzleId: feeder._id,
              answers: feeder.answers,
            });
          }
        }
        await waitFor(() => assert.notInclude(header(), "Ready to meta"), {
          timeout: 10000,
        });
      });

      it("shows a round's count and finished tick zoomed right out", async function () {
        this.timeout(30000);
        localStorage.setItem(
          `whiteboard:viewport:${boardId}`,
          JSON.stringify({ x: 0, y: 0, zoom: 0.1 }),
        );
        render(<TestApp />);
        await goTo(boardPath);
        const pill = () =>
          [
            ...document.querySelectorAll(".react-flow__viewport-portal span"),
          ].find((el) => el.textContent?.includes("games-island"));
        await waitFor(
          () => {
            const found = pill();
            assert.ok(found);
            assert.match(found.textContent ?? "", /games-island \d+\/\d+/);
            assert.isNull(found.querySelector("svg.fa-check"));
          },
          { timeout: 20000 },
        );
        try {
          await setPuzzleAnswers.callPromise({
            puzzleId: robber,
            answers: ["MONEY"],
          });
          await waitFor(
            () => {
              const found = pill();
              assert.ok(found);
              assert.isNotNull(found.querySelector("svg.fa-check"));
              assert.match(found.textContent ?? "", /\d+\/\d+/);
            },
            { timeout: 10000 },
          );
        } finally {
          await setPuzzleAnswers.callPromise({ puzzleId: robber, answers: [] });
          localStorage.removeItem(`whiteboard:viewport:${boardId}`);
        }
      });

      describe("feeders", function () {
        // The Robber's feeders as the board has them: the rest of Games
        // Island, all in its frame, row by row.
        const feedersInBoardOrder = async () => {
          const feeders = await Puzzles.find({
            hunt: huntId,
            $and: [{ tags: gamesIsland }, { _id: { $ne: robber } }],
          }).fetchAsync();
          const cards = await WhiteboardNodes.find({
            board: boardId,
            puzzle: { $in: feeders.map((p) => p._id) },
          }).fetchAsync();
          assert.lengthOf(cards, feeders.length);
          assert.lengthOf(new Set(cards.map((c) => c.parent)), 1);
          const byPuzzle = new Map(feeders.map((p) => [p._id, p]));
          return cards
            .toSorted(
              (a, b) =>
                a.position.y - b.position.y || a.position.x - b.position.x,
            )
            .map((c) => byPuzzle.get(c.puzzle!)!);
        };

        // Opens the board at zoom 1 with The Robber's card in view, so
        // nothing moves while the test works with it, and opens its Feeders.
        const openFeeders = async () => {
          // Lets the last test's page let go of its subscriptions first, or
          // subscribing takes one of them over and gives back no handle.
          await stabilize();
          subs.push(
            await typedSubscribe.async(whiteboardContents, { boardId }),
          );
          const card = await WhiteboardNodes.findOneAsync({
            board: boardId,
            puzzle: robber,
          });
          assert.ok(card?.parent);
          const frame = await WhiteboardNodes.findOneAsync(card.parent);
          assert.ok(frame);
          localStorage.setItem(
            `whiteboard:viewport:${boardId}`,
            JSON.stringify({
              x: 200 - frame.position.x - card.position.x,
              y: 200 - frame.position.y - card.position.y,
              zoom: 1,
            }),
          );
          render(<TestApp />);
          await goTo(boardPath);
          return clickFeeders("The Robber", 20000);
        };

        // Opens the Feeders popover of the card with this title.
        const clickFeeders = async (title: string, timeout = 10000) => {
          const button = await waitFor(
            () => {
              const card = [
                ...document.querySelectorAll<HTMLElement>(
                  ".react-flow__node-puzzle",
                ),
              ].find((el) => el.textContent?.includes(title));
              assert.ok(card);
              return within(card).getByRole("button", { name: "Feeders" });
            },
            { timeout },
          );
          act(() => {
            fireEvent.click(button);
          });
          return waitFor(
            () => {
              const popover = document.querySelector<HTMLElement>(".popover");
              assert.isNotNull(popover);
              assert.isNotEmpty(popover.querySelectorAll("li"));
              return popover;
            },
            { timeout: 10000 },
          );
        };

        const popoverClosed = () =>
          waitFor(() => assert.isNull(document.querySelector(".popover")), {
            timeout: 10000,
          });

        const rowTitles = (popover: HTMLElement) =>
          [...popover.querySelectorAll("li a > span:first-child")].map(
            (el) => el.textContent,
          );

        afterEach(function () {
          localStorage.removeItem("whiteboard:feederOrder");
          localStorage.removeItem(`whiteboard:viewport:${boardId}`);
        });

        it("lists a meta's feeders with their answers, by board or solve time, and copies the answers", async function () {
          this.timeout(30000);
          let last: { _id: string; answers: string[] } | undefined;
          const writeText = sinon.stub().resolves();
          const realClipboard = Object.getOwnPropertyDescriptor(
            navigator,
            "clipboard",
          );
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
          });
          try {
            // The page brings the puzzles and cards the expected list is
            // worked out from.
            const popover = await openFeeders();
            const feeders = await feedersInBoardOrder();
            const feeder = feeders.at(-1)!;
            last = feeder;
            assert.deepEqual(
              rowTitles(popover),
              feeders.map((p) => p.title),
            );
            const solved = feeders.filter(
              (p) => p.answers.length >= p.expectedAnswerCount,
            ).length;
            assert.include(
              popover.textContent,
              `${solved} of ${feeders.length} solved`,
            );

            await act(async () => {
              fireEvent.click(
                within(popover).getByRole("button", { name: /Copy answers/ }),
              );
              await stabilize();
            });
            assert.isTrue(writeText.calledOnce);
            assert.equal(
              writeText.firstCall.args[0],
              feeders.map((p) => p.answers.join(", ")).join("\n"),
            );

            // Answering the last feeder makes it the most recent
            await setPuzzleAnswers.callPromise({
              puzzleId: feeder._id,
              answers: ["LATEST"],
            });
            act(() => {
              fireEvent.click(within(popover).getByLabelText("By solve time"));
            });
            await waitFor(
              () => assert.equal(rowTitles(popover)[0], feeder.title),
              { timeout: 10000 },
            );
            assert.equal(
              localStorage.getItem("whiteboard:feederOrder"),
              '"solveTime"',
            );

            // With History open, Escape closes only the popover
            await act(async () => {
              fireEvent.click(screen.getByRole("button", { name: "History" }));
              await stabilize();
            });
            await popoverClosed();
            await screen.findByRole("button", { name: "Now" });
            const reopened = await clickFeeders("The Robber");
            const escape = { key: "Escape", code: "Escape", keyCode: 27 };
            await act(async () => {
              fireEvent.keyDown(
                within(reopened).getByRole("button", { name: /Copy answers/ }),
                escape,
              );
              fireEvent.keyUp(document, escape);
              await stabilize();
            });
            await popoverClosed();
            assert.exists(screen.queryByRole("button", { name: "Now" }));
            // The next one closes History
            await act(async () => {
              fireEvent.keyDown(document.body, escape);
              await stabilize();
            });
            assert.isNull(screen.queryByRole("button", { name: "Now" }));
          } finally {
            if (last) {
              await setPuzzleAnswers.callPromise({
                puzzleId: last._id,
                answers: last.answers,
              });
            }
            if (realClipboard) {
              Object.defineProperty(navigator, "clipboard", realClipboard);
            } else {
              delete (navigator as { clipboard?: Clipboard }).clipboard;
            }
          }
        });

        it("lets someone who can only view open a meta's feeders, and closes on a click outside", async function () {
          this.timeout(30000);
          await setHuntArchived.callPromise({ huntId, isArchived: true });
          try {
            const popover = await openFeeders();
            await screen.findByText("Viewing only", {}, { timeout: 20000 });
            const feeders = await feedersInBoardOrder();
            assert.deepEqual(
              rowTitles(popover),
              feeders.map((p) => p.title),
            );

            // A click anywhere else closes it
            act(() => {
              fireEvent.click(document.body);
            });
            await popoverClosed();
          } finally {
            await setHuntArchived.callPromise({ huntId, isArchived: false });
          }
        });

        it("opens a meta's feeders with a tap on a phone", async function () {
          this.timeout(30000);
          const phone = simulatePhone();
          try {
            const popover = await openFeeders();
            await screen.findByText(
              "Editing needs a wider screen. You can still comment.",
              {},
              { timeout: 20000 },
            );
            const feeders = await feedersInBoardOrder();
            assert.deepEqual(
              rowTitles(popover),
              feeders.map((p) => p.title),
            );
            act(() => {
              fireEvent.click(document.body);
            });
            await popoverClosed();
          } finally {
            phone.restore();
          }
        });

        it("keeps the viewer's order from one meta's feeders to another's", async function () {
          this.timeout(30000);
          let other: { _id: string; title: string } | undefined;
          try {
            let popover = await openFeeders();
            [other] = await feedersInBoardOrder();
            assert.ok(other);
            // A second meta on the board: a bare is:meta, fed by the rest
            // of its round
            await addPuzzleTag.callPromise({
              puzzleId: other._id,
              tagName: "is:meta",
            });
            act(() => {
              fireEvent.click(within(popover).getByLabelText("By solve time"));
            });
            await waitFor(() =>
              assert.isTrue(
                within(popover).getByLabelText<HTMLInputElement>(
                  "By solve time",
                ).checked,
              ),
            );
            act(() => {
              fireEvent.click(document.body);
            });
            await popoverClosed();

            popover = await clickFeeders(other.title);
            assert.notInclude(rowTitles(popover), other.title);
            assert.isTrue(
              within(popover).getByLabelText<HTMLInputElement>("By solve time")
                .checked,
            );
          } finally {
            if (other) {
              const tag = await Tags.findOneAsync({
                hunt: huntId,
                name: "is:meta",
              });
              if (tag) {
                await removePuzzleTag.callPromise({
                  puzzleId: other._id,
                  tagId: tag._id,
                });
              }
            }
          }
        });
      });
    });

    describe("edit policy", function () {
      const MEMBER_EMAIL = "editor-policy-member@example.com";
      const MEMBER_PASSWORD = "password";
      let boardId: string;

      const login = (email: string, password: string) =>
        promisify(Meteor.loginWithPassword)(email, password);
      const setPolicy = (editPolicy: WhiteboardEditPolicy) =>
        setWhiteboardEditPolicy.callPromise({
          boardId,
          editPolicy,
          editors: [],
        });

      before(async function () {
        this.timeout(10000);
        boardId = (await ensureBoard())._id;
        await createTestUser.callPromise({
          email: MEMBER_EMAIL,
          password: MEMBER_PASSWORD,
          displayName: "Member",
        });
        await addHuntUser.callPromise({ huntId, email: MEMBER_EMAIL });
      });

      it("offers operators the who-can-edit dialog", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(boardPath);
        const open = await screen.findByTitle(
          "Who can edit: Everyone in the hunt",
          {},
          { timeout: 20000 },
        );
        await act(async () => {
          fireEvent.click(open);
          await stabilize();
        });
        await screen.findByText("Who can edit the board");
        await act(async () => {
          fireEvent.click(screen.getByLabelText("Operators only"));
          fireEvent.click(screen.getByRole("button", { name: "Save" }));
          await stabilize();
        });
        try {
          await waitFor(
            async () => {
              assert.equal(
                (await Whiteboards.findOneAsync(boardId))?.editPolicy,
                "operators",
              );
              assert.isNull(screen.queryByText("Who can edit the board"));
            },
            { timeout: 10000 },
          );
          await screen.findByTitle("Who can edit: Operators only");
        } finally {
          await setPolicy("members");
        }
      });

      describe("for someone who can't edit", function () {
        // An image an operator put on the board, for a viewer to see
        const image = Random.id();
        // Just above the cards, so a board opened to fit everything still
        // shows them
        const imageAt = { x: 0, y: -300 };
        let imageUrl: string;

        before(async function () {
          this.timeout(10000);
          await setImageBucket.callPromise({ on: true });
          const backing = (await ensureBoard()).puzzle;
          imageUrl = `https://s3.${TEST_BUCKET.bucketRegion}.amazonaws.com/${TEST_BUCKET.bucketName}/${huntId}/${backing}/${Random.id()}`;
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: image,
                type: "image",
                position: imageAt,
                width: 200,
                height: 100,
                image: { url: imageUrl, width: 400, height: 200 },
              },
            ],
          });
          await setPolicy("operators");
          await promisify(Meteor.logout)();
          await login(MEMBER_EMAIL, MEMBER_PASSWORD);
        });

        // Nodes made for a test, removed once an operator is back
        const leftovers: string[] = [];

        after(async function () {
          this.timeout(10000);
          await promisify(Meteor.logout)();
          await login(USER_EMAIL, USER_PASSWORD);
          await setPolicy("members");
          await deleteWhiteboardNodes.callPromise({
            boardId,
            nodeIds: [image, ...leftovers.splice(0)],
          });
          await setImageBucket.callPromise({ on: false });
        });

        it("shows a viewer images, with no Image tool", async function () {
          this.timeout(30000);
          localStorage.setItem(
            `whiteboard:viewport:${boardId}`,
            JSON.stringify({
              x: 150 - imageAt.x,
              y: 150 - imageAt.y,
              zoom: 1,
            }),
          );
          try {
            render(<TestApp />);
            await goTo(boardPath);
            await screen.findByText("Viewing only", {}, { timeout: 20000 });
            const shown = await waitFor(
              () => {
                const found = document.querySelector(
                  `.react-flow__node[data-id="${image}"] img`,
                );
                assert.isNotNull(found);
                return found;
              },
              { timeout: 20000 },
            );
            assert.equal(shown.getAttribute("src"), imageUrl);
            assert.isNull(screen.queryByRole("button", { name: "Image" }));
            assert.isNull(document.querySelector(".jr-image-tool-input"));
          } finally {
            localStorage.removeItem(`whiteboard:viewport:${boardId}`);
          }
        });

        it("shows non-editors why they can't edit and keeps the comment tool", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          await screen.findByText("Viewing only", {}, { timeout: 20000 });
          screen.getByText("Only operators can edit this board.");
          assert.exists(screen.getByTitle(/^Comment:/));
          assert.isNull(screen.queryByTitle(/^Select and move/));
          assert.isNull(screen.queryByLabelText("Who can edit"));
        });

        it("offers a non-editor no undo", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          await screen.findByText("Viewing only", {}, { timeout: 20000 });
          assert.isNull(screen.queryByRole("button", { name: "Undo" }));
          assert.isNull(screen.queryByRole("button", { name: "Redo" }));
        });

        it("gives a non-editor the Comment key and no other", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          await screen.findByText("Viewing only", {}, { timeout: 20000 });
          await waitFor(
            () =>
              assert.isNotNull(
                document.querySelector(".react-flow__node-puzzle"),
              ),
            { timeout: 20000 },
          );
          await act(async () => {
            await stabilize();
          });
          const pane = document.querySelector(".react-flow__pane")!;
          const box = pane.getBoundingClientRect();
          const at = {
            button: 0,
            pointerId: 1,
            clientX: box.left + box.width * 0.6,
            clientY: box.top + box.height * 0.6,
          };
          await act(async () => {
            fireEvent.pointerDown(pane, at);
            fireEvent.pointerUp(pane, at);
            await stabilize();
          });
          const key = async (init: KeyboardEventInit) => {
            await act(async () => {
              fireEvent.keyDown(pane, init);
              await stabilize();
            });
          };
          const commentPressed = () =>
            screen
              .getByRole("button", { name: /^Comment:/ })
              .getAttribute("aria-pressed");

          await key({ key: "a", ctrlKey: true });
          assert.isNull(document.querySelector(".react-flow__node.selected"));
          await key({ key: "c" });
          assert.equal(commentPressed(), "true");
          await key({ key: "p" });
          assert.equal(commentPressed(), "true");
          await key({ key: "Escape" });
          assert.equal(commentPressed(), "false");
          assert.isNull(
            screen.queryByRole("button", { name: /^Not on the board/ }),
          );
        });

        it("does nothing with a viewer's copy, paste or duplicate", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          await screen.findByText("Viewing only", {}, { timeout: 20000 });
          await waitFor(
            () =>
              assert.isNotNull(
                document.querySelector(".react-flow__node-puzzle"),
              ),
            { timeout: 20000 },
          );
          const pane = document.querySelector(".react-flow__pane")!;
          const box = pane.getBoundingClientRect();
          const at = {
            button: 0,
            pointerId: 1,
            clientX: box.left + box.width * 0.6,
            clientY: box.top + box.height * 0.6,
          };
          await act(async () => {
            fireEvent.pointerDown(pane, at);
            fireEvent.pointerUp(pane, at);
            await stabilize();
          });
          const saves = sinon.spy(upsertWhiteboardNodes, "call");
          try {
            const data = new DataTransfer();
            data.setData("text/plain", "A viewer's note");
            const event = new ClipboardEvent("paste", {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            });
            const copy = new ClipboardEvent("copy", {
              clipboardData: new DataTransfer(),
              bubbles: true,
              cancelable: true,
            });
            await act(async () => {
              pane.dispatchEvent(event);
              pane.dispatchEvent(copy);
              fireEvent.keyDown(pane, { key: "d", ctrlKey: true });
              await stabilize();
            });
            assert.isFalse(event.defaultPrevented);
            assert.isFalse(copy.defaultPrevented);
            sinon.assert.notCalled(saves);
          } finally {
            saves.restore();
          }
        });

        it("disables Restore this item for a viewer", async function () {
          this.timeout(60000);
          // A version with a note on it, made as an operator
          await promisify(Meteor.logout)();
          await login(USER_EMAIL, USER_PASSWORD);
          const note = Random.id();
          leftovers.push(note);
          const base = { x: 33000, y: 33000 };
          try {
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [
                {
                  _id: note,
                  type: "sticky",
                  position: base,
                  width: 200,
                  height: 160,
                },
              ],
            });
            await clearWhiteboardVersions.callPromise({ boardId });
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: note, text: "Changed since" }],
            });
          } finally {
            await promisify(Meteor.logout)();
            await login(MEMBER_EMAIL, MEMBER_PASSWORD);
          }
          localStorage.setItem(
            `whiteboard:viewport:${boardId}`,
            JSON.stringify({ x: 150 - base.x, y: 150 - base.y, zoom: 1 }),
          );
          try {
            render(<TestApp />);
            await goTo(boardPath);
            await screen.findByText("Viewing only", {}, { timeout: 20000 });
            await act(async () => {
              fireEvent.click(screen.getByRole("button", { name: "History" }));
              await stabilize();
            });
            const row = await waitFor(
              () => {
                const found = [
                  ...document.querySelectorAll<HTMLElement>(
                    ".react-flow__panel.top.right button",
                  ),
                ].find((b) => b.textContent?.startsWith("Before edits by"));
                assert.exists(found);
                return found;
              },
              { timeout: 10000 },
            );
            await act(async () => {
              fireEvent.click(row);
              await stabilize();
            });
            const shown = await waitFor(
              () => {
                const found = nodeElement(note);
                assert.isNotNull(found);
                return found as HTMLElement;
              },
              { timeout: 10000 },
            );
            await act(async () => {
              fireEvent.click(shown);
              await stabilize();
            });
            const button = await screen.findByRole("button", {
              name: "Restore this item",
            });
            assert.isTrue(button.hasAttribute("disabled"));
            within(button.parentElement!).getByText(
              "Only people who can edit the board can restore it.",
            );
          } finally {
            localStorage.removeItem(`whiteboard:viewport:${boardId}`);
          }
        });

        it("lets a non-editor place a comment", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          const commentTool = await screen.findByTitle(
            /^Comment:/,
            {},
            { timeout: 20000 },
          );
          await act(async () => {
            fireEvent.click(commentTool);
            await stabilize();
          });
          const pane = document.querySelector(".react-flow__pane")!;
          const box = pane.getBoundingClientRect();
          const at = {
            button: 0,
            pointerId: 1,
            clientX: box.left + box.width * 0.6,
            clientY: box.top + box.height * 0.6,
          };
          await act(async () => {
            fireEvent.pointerDown(pane, at);
            fireEvent.pointerUp(pane, at);
            await stabilize();
          });
          const panel = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              ".react-flow__panel.top.right",
            );
            assert.include(found?.textContent ?? "", "New comment on");
            assert.isNotNull(found?.querySelector("[data-slate-editor]"));
            return found!;
          });
          const editor = panel.querySelector<HTMLElement>(
            "[data-slate-editor]",
          )!;
          await act(async () => {
            editor.focus();
            await stabilize();
          });
          await act(async () => {
            // Slate types from beforeinput, at the selection focusing set
            editor.dispatchEvent(
              new InputEvent("beforeinput", {
                inputType: "insertText",
                data: "Where does this go?",
                bubbles: true,
                cancelable: true,
              }),
            );
            await stabilize();
          });
          await act(async () => {
            fireEvent.click(
              within(panel).getByRole("button", { name: "Send" }),
            );
            await stabilize();
          });
          await waitFor(
            async () => {
              const sent = await ChatMessages.findOneAsync({
                sender: Meteor.userId()!,
                comment: { $exists: true },
              });
              assert.exists(sent);
            },
            { timeout: 10000 },
          );
        });
      });
    });

    describe("editing", function () {
      let boardId: string;

      before(async function () {
        this.timeout(10000);
        boardId = (await ensureBoard())._id;
        subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
      });

      const pane = () => document.querySelector(".react-flow__pane")!;
      const paneAt = (fx: number, fy: number) => {
        const box = pane().getBoundingClientRect();
        return {
          button: 0,
          pointerId: 1,
          clientX: box.left + box.width * fx,
          clientY: box.top + box.height * fy,
        };
      };
      // A press on an empty part of the board, which gives it focus.
      const pressBoard = async () => {
        const at = paneAt(0.6, 0.6);
        await act(async () => {
          fireEvent.pointerDown(pane(), at);
          fireEvent.pointerUp(pane(), at);
          await stabilize();
        });
      };
      const press = async (target: Element, init: KeyboardEventInit) => {
        await act(async () => {
          fireEvent.keyDown(target, init);
          await stabilize();
        });
      };
      const openBoard = async () => {
        render(<TestApp />);
        await goTo(boardPath);
        await screen.findByRole(
          "button",
          { name: /^Select and move/ },
          { timeout: 20000 },
        );
        // Lets the canvas's effects, which listen for the keys, run
        await act(async () => {
          await stabilize();
        });
      };
      const pressed = (name: RegExp) =>
        screen.getByRole("button", { name }).getAttribute("aria-pressed");
      const panelText = () =>
        document.querySelector(".react-flow__panel.top.right")?.textContent ??
        "";

      it("gets a handle from typedSubscribe.async for a subscription that's already ready", async function () {
        // A computation being rerun lets go of its subscription, which a
        // subscribe for the same thing in the meantime picks up, already
        // ready.
        const rerun = new Tracker.Dependency();
        let held: Meteor.SubscriptionHandle | undefined;
        const computation = Tracker.autorun(() => {
          rerun.depend();
          held = typedSubscribe(whiteboardContents, { boardId });
        });
        let reused: Meteor.SubscriptionHandle | undefined;
        try {
          await waitFor(() => assert.isTrue(held?.ready()), {
            timeout: 10000,
          });
          rerun.changed();
          reused = await typedSubscribe.async(whiteboardContents, { boardId });
          assert.exists(reused);
          assert.isTrue(reused.ready());
        } finally {
          computation.stop();
          reused?.stop();
        }
      });

      it("switches tools with their keys, but not while typing", async function () {
        this.timeout(30000);
        await openBoard();
        await pressBoard();
        await press(pane(), { key: "p" });
        assert.equal(pressed(/^Draw/), "true");
        assert.include(
          screen.getByRole("button", { name: /^Draw/ }).title,
          "[P]",
        );
        await press(pane(), { key: "1" });
        assert.equal(
          screen.getByRole<HTMLSelectElement>("combobox", {
            name: "Pen width",
          }).value,
          "thin",
        );
        await press(pane(), { key: "2" });
        await press(pane(), { key: "l" });
        assert.equal(pressed(/^Line:/), "true");

        // Typing in the search field leaves the tool alone
        const search = screen.getByRole("combobox", {
          name: "Search the board",
        });
        await act(async () => {
          search.focus();
          await stabilize();
        });
        await press(search, { key: "s" });
        assert.equal(pressed(/^Line:/), "true");
        assert.equal(pressed(/^Sticky note/), "false");

        await pressBoard();
        await press(pane(), { key: "v" });
        assert.equal(pressed(/^Select and move/), "true");
      });

      it("selects everything but frames on Ctrl+A", async function () {
        this.timeout(30000);
        localStorage.removeItem(`whiteboard:viewport:${boardId}`);
        await openBoard();
        await waitFor(
          () =>
            assert.isNotNull(
              document.querySelector(".react-flow__node-puzzle"),
            ),
          { timeout: 20000 },
        );
        await pressBoard();
        await press(pane(), { key: "a", ctrlKey: true });
        await waitFor(() => {
          const cards = document.querySelectorAll(".react-flow__node-puzzle");
          assert.isAbove(cards.length, 0);
          cards.forEach((card) =>
            assert.isTrue(card.classList.contains("selected")),
          );
          assert.isNull(
            document.querySelector(".react-flow__node-frame.selected"),
          );
        });
      });

      it("shows a click-to-connect line until Escape lets it go", async function () {
        this.timeout(30000);
        await ensureBoard();
        const { a, b } = await sideBySideCards(boardId);
        const before = await linesBetween(boardId, a._id, b._id);
        await openBoard();
        const from = await handleOf(a._id, "right");
        const click = async (handle: Element) => {
          const box = handle.getBoundingClientRect();
          await act(async () => {
            fireEvent.click(handle, {
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
            });
            await stabilize();
          });
        };
        await click(from);
        assert.isTrue(from.classList.contains("clickconnecting"));
        const at = paneAt(0.8, 0.8);
        await act(async () => {
          fireEvent.pointerMove(pane(), at);
          await stabilize();
        });
        await waitFor(() =>
          assert.isNotNull(document.querySelector(".jr-click-connect line")),
        );

        await press(document.body, { key: "Escape" });
        await waitFor(() => {
          assert.isNull(document.querySelector(".jr-click-connect"));
          assert.isFalse(from.classList.contains("clickconnecting"));
        });
        // The next handle clicked starts a line rather than ending one
        const to = await handleOf(b._id, "left");
        await click(to);
        assert.isTrue(to.classList.contains("clickconnecting"));
        await press(document.body, { key: "Escape" });
        assert.equal(await linesBetween(boardId, a._id, b._id), before);
      });

      describe("comment threads", function () {
        before(async function () {
          this.timeout(10000);
          const board = await ensureBoard();
          await sendChatMessage.callPromise({
            puzzleId: board.puzzle,
            content: JSON.stringify({
              type: "message",
              children: [{ text: "Keyboard thread" }],
            }),
            comment: { x: 4321, y: 4321 },
          });
        });

        // Opens the board at a comment, found once the board's chat has
        // loaded.
        const openAtComment = async (x: number) => {
          await openBoard();
          const id = await waitFor(
            async () => {
              const found = await ChatMessages.findOneAsync({
                "comment.x": x,
              });
              assert.ok(found);
              return found._id;
            },
            { timeout: 20000 },
          );
          await goTo(`${boardPath}?comment=${id}`);
          return id;
        };

        it("moves focus into a thread, and back to its pin when Escape closes it", async function () {
          this.timeout(30000);
          const threadId = await openAtComment(4321);
          const pin = () =>
            document.querySelector<HTMLElement>(
              `.jr-comment-pin[data-thread="${threadId}"]`,
            );
          const panel = await waitFor(
            () => {
              const found = document.querySelector("dialog[open]");
              assert.ok(found);
              assert.include(found.textContent ?? "", "Keyboard thread");
              assert.equal(
                found.getAttribute("aria-label"),
                "Comment on the board",
              );
              return found;
            },
            { timeout: 20000 },
          );
          const editor = panel.querySelector("[data-slate-editor]")!;
          await waitFor(() =>
            assert.isTrue(editor.contains(document.activeElement)),
          );
          await press(document.activeElement!, { key: "Escape" });
          await waitFor(() => {
            assert.isNull(document.querySelector("dialog[open]"));
            assert.equal(document.activeElement, pin());
          });
        });

        it("keeps a thread open on Escape while its composer has text", async function () {
          this.timeout(30000);
          await openAtComment(4321);
          const panel = await waitFor(
            () => {
              const found = document.querySelector<HTMLElement>("dialog[open]");
              assert.ok(found);
              assert.include(found.textContent ?? "", "Keyboard thread");
              return found;
            },
            { timeout: 20000 },
          );
          const editor = panel.querySelector<HTMLElement>(
            "[data-slate-editor]",
          )!;
          await typeInto(editor, "Not finished");
          await press(editor, { key: "Escape" });
          assert.isNotNull(document.querySelector("dialog[open]"));
          assert.include(editor.textContent ?? "", "Not finished");
        });

        it("says when resolving a thread is refused", async function () {
          this.timeout(30000);
          const refuse = refuseCalls(setWhiteboardCommentResolved);
          try {
            await openAtComment(4321);
            const panel = await waitFor(
              () => {
                const found =
                  document.querySelector<HTMLElement>("dialog[open]");
                assert.ok(found);
                assert.include(found.textContent ?? "", "Keyboard thread");
                return found;
              },
              { timeout: 20000 },
            );
            await act(async () => {
              fireEvent.click(
                within(panel).getByRole("button", { name: "Resolve" }),
              );
              await stabilize();
            });
            await screen.findByText("Couldn't save: Refused for the test");
            assert.isTrue(refuse.calledOnce);
          } finally {
            refuse.restore();
          }
        });

        it("keeps a refused new comment open with its text", async function () {
          this.timeout(30000);
          const refuse = refuseCalls(sendChatMessage);
          try {
            await openBoard();
            await act(async () => {
              fireEvent.click(
                screen.getByRole("button", { name: /^Comment:/ }),
              );
              await stabilize();
            });
            const at = paneAt(0.6, 0.6);
            await act(async () => {
              fireEvent.pointerDown(pane(), at);
              fireEvent.pointerUp(pane(), at);
              await stabilize();
            });
            const panel = await waitFor(() => {
              const found = document.querySelector<HTMLElement>("dialog[open]");
              assert.ok(found);
              assert.include(found.textContent ?? "", "New comment on");
              return found;
            });
            await typeInto(
              panel.querySelector<HTMLElement>("[data-slate-editor]")!,
              "Refused words",
            );
            await act(async () => {
              fireEvent.click(
                within(panel).getByRole("button", { name: "Send" }),
              );
              await stabilize();
            });
            await screen.findByText("Couldn't save: Refused for the test");
            await waitFor(() => {
              const open = document.querySelector<HTMLElement>("dialog[open]");
              assert.include(open?.textContent ?? "", "New comment on");
              assert.include(
                open?.querySelector("[data-slate-editor]")?.textContent ?? "",
                "Refused words",
              );
            });
          } finally {
            refuse.restore();
          }
        });

        it("closes an open thread on Escape, then drops a comment being started", async function () {
          this.timeout(30000);
          await openAtComment(4321);
          await waitFor(() => assert.include(panelText(), "Keyboard thread"), {
            timeout: 20000,
          });
          await press(document.body, { key: "Escape" });
          await waitFor(() =>
            assert.notInclude(panelText(), "Keyboard thread"),
          );

          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Comment:/ }));
            await stabilize();
          });
          const at = paneAt(0.6, 0.6);
          await act(async () => {
            fireEvent.pointerDown(pane(), at);
            fireEvent.pointerUp(pane(), at);
            await stabilize();
          });
          await waitFor(() => assert.include(panelText(), "New comment on"));
          await press(document.body, { key: "Escape" });
          await waitFor(() => assert.notInclude(panelText(), "New comment on"));
          assert.equal(pressed(/^Select and move/), "true");
        });

        it("asks before deleting a comment, and leaves it on cancel", async function () {
          this.timeout(30000);
          const board = await ensureBoard();
          await sendChatMessage.callPromise({
            puzzleId: board.puzzle,
            content: JSON.stringify({
              type: "message",
              children: [{ text: "Delete me" }],
            }),
            comment: { x: 5432, y: 5432 },
          });
          const doomed = await openAtComment(5432);
          await waitFor(() => assert.include(panelText(), "Delete me"), {
            timeout: 20000,
          });
          const deleteButton = () =>
            within(
              document.querySelector<HTMLElement>("dialog[open]")!,
            ).getByRole("button", { name: "Delete" });
          const modal = () => document.querySelector<HTMLElement>(".modal");

          await act(async () => {
            fireEvent.click(deleteButton());
            await stabilize();
          });
          await screen.findByText(
            "Delete this comment and every reply to it? This can't be undone.",
          );
          await act(async () => {
            fireEvent.click(
              within(modal()!).getByRole("button", { name: "Cancel" }),
            );
            await stabilize();
          });
          await waitFor(() => assert.isNull(modal()));
          assert.exists(await ChatMessages.findOneAsync(doomed));
          assert.include(panelText(), "Delete me");

          await act(async () => {
            fireEvent.click(deleteButton());
            await stabilize();
          });
          await waitFor(() => assert.isNotNull(modal()));
          await act(async () => {
            fireEvent.click(
              within(modal()!).getByRole("button", { name: "Delete" }),
            );
            await stabilize();
          });
          await waitFor(
            async () =>
              assert.isUndefined(await ChatMessages.findOneAsync(doomed)),
            { timeout: 10000 },
          );
        });
      });

      it("puts back a removed frame and removed feeder arrows", async function () {
        this.timeout(30000);
        const frame = await WhiteboardNodes.findOneAsync({
          board: boardId,
          type: "frame",
          tag: { $exists: true },
          hidden: { $ne: true },
        });
        assert.ok(frame);
        const arrows = await WhiteboardEdges.find({
          board: boardId,
          auto: true,
        }).fetchAsync();
        assert.isAtLeast(arrows.length, 2);
        const [first, second] = arrows;
        await deleteWhiteboardNodes.callPromise({
          boardId,
          nodeIds: [frame._id],
        });
        await deleteWhiteboardEdges.callPromise({
          boardId,
          edgeIds: [first!._id, second!._id],
        });

        await openBoard();
        const toggle = screen.getByRole("button", {
          name: /^Not on the board/,
        });
        await act(async () => {
          fireEvent.click(toggle);
          await stabilize();
        });
        const sidePanel = () =>
          document.querySelector<HTMLElement>(".react-flow__panel.top.right")!;
        await waitFor(() => {
          assert.include(sidePanel().textContent ?? "", "Frames");
          assert.include(sidePanel().textContent ?? "", "Feeder arrows");
        });
        const rowFor = (text: string) => {
          const label = within(sidePanel()).getByTitle(text);
          return within(label.parentElement!).getByRole("button", {
            name: "Put back",
          });
        };

        const tag = await Tags.findOneAsync(frame.tag ?? "");
        await act(async () => {
          fireEvent.click(rowFor(tag!.name.replace(/^group:/, "")));
          await stabilize();
        });
        await waitFor(
          async () => {
            const back = await WhiteboardNodes.findOneAsync(frame._id);
            assert.isUndefined(back?.hidden);
            assert.isUndefined(back?.parent);
          },
          { timeout: 10000 },
        );

        const title = async (id: string | undefined) =>
          (await Puzzles.findOneAsync(id ?? ""))?.title;
        const firstLabel = `${await title(first!.feeder)} → ${await title(first!.meta)}`;
        await act(async () => {
          fireEvent.click(rowFor(firstLabel));
          await stabilize();
        });
        await waitFor(
          async () => {
            assert.isUndefined(
              (await WhiteboardEdges.findOneAsync(first!._id))?.hidden,
            );
            assert.isTrue(
              (await WhiteboardEdges.findOneAsync(second!._id))?.hidden,
            );
          },
          { timeout: 10000 },
        );

        // With feeder arrows turned off, the panel says why putting them back
        // shows nothing
        const arrowsOff =
          "Feeder arrows are hidden for you; turn them on in the toolbar to see these.";
        const toggleArrows = async () => {
          await act(async () => {
            fireEvent.click(
              screen.getByRole("button", { name: "Show feeder arrows" }),
            );
            await stabilize();
          });
        };
        try {
          assert.notInclude(sidePanel().textContent ?? "", arrowsOff);
          await toggleArrows();
          await waitFor(() =>
            assert.include(sidePanel().textContent ?? "", arrowsOff),
          );
          await toggleArrows();
          await waitFor(() =>
            assert.notInclude(sidePanel().textContent ?? "", arrowsOff),
          );
        } finally {
          localStorage.removeItem("whiteboard:feederArrows");
        }

        await act(async () => {
          fireEvent.click(
            within(sidePanel()).getByRole("button", {
              name: "Put back all feeder arrows",
            }),
          );
          await stabilize();
        });
        await waitFor(
          async () =>
            assert.equal(
              await WhiteboardEdges.find({
                board: boardId,
                hidden: true,
              }).countAsync(),
              0,
            ),
          { timeout: 10000 },
        );
      });

      it("says when a save is refused, and keeps refused text to retry", async function () {
        this.timeout(30000);
        const sticky = Random.id();
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: sticky,
              type: "sticky",
              position: { x: 6000, y: 6000 },
              width: 200,
              height: 160,
              text: "Original",
            },
          ],
        });
        localStorage.setItem(
          `whiteboard:viewport:${boardId}`,
          JSON.stringify({ x: -5800, y: -5800, zoom: 1 }),
        );
        const refuse = sinon
          .stub(upsertWhiteboardNodes, "call")
          .callsFake((...args: unknown[]) => {
            const callback = args.at(-1);
            if (typeof callback === "function") {
              callback(
                new Meteor.Error(
                  403,
                  "Only operators can edit this whiteboard",
                ),
              );
            }
          });
        try {
          await openBoard();
          const note = await waitFor(
            () => {
              const found = nodeElement(sticky);
              assert.isNotNull(found);
              return found as HTMLElement;
            },
            { timeout: 20000 },
          );
          await act(async () => {
            fireEvent.doubleClick(within(note).getByText("Original"));
            await stabilize();
          });
          const editor = within(note).getByRole("textbox");
          await act(async () => {
            fireEvent.change(editor, { target: { value: "Changed" } });
            fireEvent.blur(editor);
            await stabilize();
          });
          await screen.findByText(
            "Couldn't save: Only operators can edit this whiteboard",
          );
          within(note).getByText("Changed");
          const retry = within(note).getByRole("button", { name: "Retry" });

          refuse.restore();
          await act(async () => {
            fireEvent.click(retry);
            await stabilize();
          });
          await waitFor(
            async () => {
              assert.equal(
                (await WhiteboardNodes.findOneAsync(sticky))?.text,
                "Changed",
              );
              assert.isNull(
                within(note).queryByRole("button", { name: "Retry" }),
              );
            },
            { timeout: 10000 },
          );
        } finally {
          refuse.restore();
          localStorage.removeItem(`whiteboard:viewport:${boardId}`);
          await deleteWhiteboardNodes.callPromise({
            boardId,
            nodeIds: [sticky],
          });
        }
      });

      it("goes view-only while offline, and back without a notice", async function () {
        this.timeout(30000);
        let offline = false;
        const connection = new Tracker.Dependency();
        const realStatus = Meteor.status.bind(Meteor);
        const status = sinon.stub(Meteor, "status").callsFake(() => {
          connection.depend();
          const real = realStatus();
          return offline
            ? { ...real, connected: false, status: "offline" as const }
            : real;
        });
        const setOffline = async (value: boolean) => {
          offline = value;
          await act(async () => {
            connection.changed();
            Tracker.flush();
            await stabilize();
          });
        };
        try {
          await openBoard();
          await setOffline(true);
          await screen.findByText(
            "Offline: the board is view-only until you reconnect",
          );
          screen.getByText("Viewing only");
          assert.isNull(
            screen.queryByRole("button", { name: /^Select and move/ }),
          );

          await setOffline(false);
          await screen.findByRole("button", { name: /^Select and move/ });
          assert.isNull(
            screen.queryByText(
              "Offline: the board is view-only until you reconnect",
            ),
          );
          assert.isNull(screen.queryByText("You can now edit this board."));
          assert.isNull(
            screen.queryByText("You can no longer edit this board."),
          );

          // Edit rights that go while offline are announced on reconnecting
          await setOffline(true);
          await setHuntArchived.callPromise({ huntId, isArchived: true });
          await setOffline(false);
          await screen.findByText(
            "You can no longer edit this board.",
            {},
            { timeout: 10000 },
          );
        } finally {
          status.restore();
          await setHuntArchived.callPromise({ huntId, isArchived: false });
        }
      });

      // Opens the board with board point `at` near the top left of the
      // canvas at `zoom`, and gives back how to find a board point on screen.
      const lookAt = (at: { x: number; y: number }, zoom = 1) => {
        const viewport = { x: 150 - at.x * zoom, y: 150 - at.y * zoom, zoom };
        localStorage.setItem(
          `whiteboard:viewport:${boardId}`,
          JSON.stringify(viewport),
        );
        return (x: number, y: number) => {
          const box = pane().getBoundingClientRect();
          return {
            clientX: box.left + viewport.x + x * zoom,
            clientY: box.top + viewport.y + y * zoom,
          };
        };
      };
      const forgetView = () =>
        localStorage.removeItem(`whiteboard:viewport:${boardId}`);
      const removeNodes = (nodeIds: string[]) =>
        deleteWhiteboardNodes.callPromise({ boardId, nodeIds });
      const nodeShown = (id: string) =>
        waitFor(
          () => {
            const found = nodeElement(id);
            assert.isNotNull(found);
            return found as HTMLElement;
          },
          { timeout: 20000 },
        );
      const select = async (id: string) => {
        await act(async () => {
          fireEvent.click(await nodeShown(id));
          await stabilize();
        });
      };
      const savedNode = (id: string) => WhiteboardNodes.findOneAsync(id);

      it("erases a whole stroke from a press on any part of it", async function () {
        this.timeout(30000);
        const stroke = Random.id();
        const segments = [Random.id(), Random.id()];
        const base = { x: 20000, y: 20000 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: segments.map((_id, i) => ({
            _id,
            type: "ink" as const,
            position: { x: base.x + i * 200, y: base.y },
            width: 200,
            height: 20,
            // Sampled every few units, as a drawn stroke is
            points: Array.from(
              { length: 41 },
              (_, j): [number, number, number] => [j * 5, 10, 0.5],
            ),
            strokeWidth: "medium" as const,
            color: "black" as const,
            stroke,
          })),
        });
        const screenAt = lookAt(base);
        try {
          await openBoard();
          await nodeShown(segments[0]!);
          await act(async () => {
            fireEvent.click(
              screen.getByRole("button", { name: "Erase strokes" }),
            );
            await stabilize();
          });
          const at = {
            button: 0,
            buttons: 1,
            pointerId: 1,
            ...screenAt(base.x + 100, base.y + 10),
          };
          await act(async () => {
            fireEvent.pointerDown(pane(), at);
            await stabilize();
          });
          await act(async () => {
            fireEvent.pointerUp(pane(), { ...at, buttons: 0 });
            await stabilize();
          });
          await waitFor(
            async () =>
              assert.equal(
                await WhiteboardNodes.find({
                  _id: { $in: segments },
                }).countAsync(),
                0,
              ),
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await removeNodes(segments);
        }
      });

      it("makes a frame the size it's dragged out to", async function () {
        this.timeout(30000);
        const base = { x: 21000, y: 21000 };
        const screenAt = lookAt(base);
        const made = () =>
          WhiteboardNodes.find({
            board: boardId,
            type: "frame",
            "position.x": { $gte: base.x - 1, $lte: base.x + 1 },
            "position.y": { $gte: base.y - 1, $lte: base.y + 1 },
          }).fetchAsync();
        try {
          await openBoard();
          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Frame:/ }));
            await stabilize();
          });
          const from = { button: 0, buttons: 1, pointerId: 1 };
          await act(async () => {
            fireEvent.pointerDown(pane(), {
              ...from,
              ...screenAt(base.x, base.y),
            });
            await stabilize();
          });
          await act(async () => {
            fireEvent.pointerMove(pane(), {
              ...from,
              ...screenAt(base.x + 400, base.y + 300),
            });
            await stabilize();
          });
          await act(async () => {
            fireEvent.pointerUp(pane(), {
              ...from,
              buttons: 0,
              ...screenAt(base.x + 400, base.y + 300),
            });
            await stabilize();
          });
          const frame = await waitFor(
            async () => {
              const [found] = await made();
              assert.ok(found);
              return found;
            },
            { timeout: 10000 },
          );
          assert.equal(frame.frameKind, "user");
          assert.closeTo(frame.width ?? 0, 400, 1);
          assert.closeTo(frame.height ?? 0, 300, 1);
        } finally {
          forgetView();
          await removeNodes((await made()).map((f) => f._id));
        }
      });

      it("keeps a frame's contents still when it's resized from the top left or deleted", async function () {
        this.timeout(30000);
        const frame = Random.id();
        const sticky = Random.id();
        const base = { x: 22000, y: 22000 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: frame,
              type: "frame",
              position: base,
              width: 600,
              height: 400,
              label: "Resize me",
            },
            {
              _id: sticky,
              type: "sticky",
              parent: frame,
              position: { x: 100, y: 100 },
              width: 200,
              height: 160,
            },
          ],
        });
        lookAt({ x: base.x - 200, y: base.y - 100 });
        try {
          await openBoard();
          await nodeShown(sticky);
          await select(frame);
          const corner = await waitFor(() => {
            const found = nodeElement(frame)?.querySelector(
              ".react-flow__resize-control.handle.top.left",
            );
            assert.exists(found);
            return found;
          });
          const box = corner.getBoundingClientRect();
          const start = {
            clientX: box.left + box.width / 2,
            clientY: box.top + box.height / 2,
          };
          const mouse = { button: 0, view: window };
          await act(async () => {
            fireEvent.mouseDown(corner, { ...mouse, ...start });
            await stabilize();
          });
          await act(async () => {
            fireEvent.mouseMove(window, {
              ...mouse,
              clientX: start.clientX - 100,
              clientY: start.clientY - 50,
            });
            await stabilize();
          });
          await act(async () => {
            fireEvent.mouseUp(window, {
              ...mouse,
              clientX: start.clientX - 100,
              clientY: start.clientY - 50,
            });
            await stabilize();
          });
          await waitFor(
            async () => {
              const resized = await savedNode(frame);
              const child = await savedNode(sticky);
              assert.closeTo(resized?.position.x ?? 0, base.x - 100, 1);
              assert.closeTo(resized?.position.y ?? 0, base.y - 50, 1);
              assert.closeTo(resized?.width ?? 0, 700, 1);
              assert.closeTo(resized?.height ?? 0, 450, 1);
              // Where it was on the board
              assert.closeTo(
                (resized?.position.x ?? 0) + (child?.position.x ?? 0),
                base.x + 100,
                1,
              );
              assert.closeTo(
                (resized?.position.y ?? 0) + (child?.position.y ?? 0),
                base.y + 100,
                1,
              );
            },
            { timeout: 10000 },
          );

          await press(document.body, { key: "Delete" });
          await waitFor(
            async () => {
              assert.isUndefined(await savedNode(frame));
              const child = await savedNode(sticky);
              assert.isUndefined(child?.parent);
              assert.closeTo(child?.position.x ?? 0, base.x + 100, 1);
              assert.closeTo(child?.position.y ?? 0, base.y + 100, 1);
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await removeNodes([sticky, frame]);
        }
      });

      it("saves edits and colour changes to notes and text", async function () {
        this.timeout(30000);
        const sticky = Random.id();
        const text = Random.id();
        const base = { x: 23000, y: 23000 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: sticky,
              type: "sticky",
              position: base,
              width: 200,
              height: 160,
              text: "Before",
            },
            {
              _id: text,
              type: "text",
              position: { x: base.x + 300, y: base.y },
              width: 240,
              height: 48,
              text: "Words",
            },
          ],
        });
        lookAt(base);
        const edit = async (id: string, from: string, to: string) => {
          const node = await nodeShown(id);
          await act(async () => {
            fireEvent.doubleClick(within(node).getByText(from));
            await stabilize();
          });
          const editor = within(node).getByRole("textbox");
          await act(async () => {
            fireEvent.change(editor, { target: { value: to } });
            fireEvent.blur(editor);
            await stabilize();
          });
        };
        const recolour = async (id: string, colour: string) => {
          await select(id);
          // The colour picker's, not Duplicate's
          const toolbar = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              `.react-flow__node-toolbar:has([aria-label="${colour}"])`,
            );
            assert.exists(found);
            return found;
          });
          await act(async () => {
            fireEvent.click(
              within(toolbar).getByRole("button", { name: colour }),
            );
            await stabilize();
          });
        };
        try {
          await openBoard();
          await edit(sticky, "Before", "After");
          await edit(text, "Words", "Other words");
          await recolour(sticky, "Blue");
          await recolour(text, "Red");
          await waitFor(
            async () => {
              const note = await savedNode(sticky);
              const words = await savedNode(text);
              assert.equal(note?.text, "After");
              assert.equal(note?.color, "blue");
              assert.equal(words?.text, "Other words");
              assert.equal(words?.color, "red");
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await removeNodes([sticky, text]);
        }
      });

      it("spaces out and lines up a selection", async function () {
        this.timeout(30000);
        const ids = [Random.id(), Random.id(), Random.id()];
        const base = { x: 24000, y: 24000 };
        const xs = [0, 150, 500];
        const ys = [0, 60, 120];
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: ids.map((_id, i) => ({
            _id,
            type: "sticky" as const,
            position: { x: base.x + xs[i]!, y: base.y + ys[i]! },
            width: 100,
            height: 80,
          })),
        });
        lookAt(base);
        try {
          await openBoard();
          await select(ids[0]!);
          // React Flow adds to the selection while Control is held
          await act(async () => {
            fireEvent.keyDown(document, {
              key: "Control",
              code: "ControlLeft",
            });
            await stabilize();
          });
          await select(ids[1]!);
          await select(ids[2]!);
          await act(async () => {
            fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });
            await stabilize();
          });
          const arrange = async (name: string) => {
            const button = await screen.findByRole("button", { name });
            await act(async () => {
              fireEvent.click(button);
              await stabilize();
            });
          };
          // The gaps even out with the ends kept still
          await arrange("Space evenly left to right");
          await waitFor(
            async () => {
              const saved = await Promise.all(ids.map(savedNode));
              assert.deepEqual(
                saved.map((n) => Math.round(n?.position.x ?? 0)),
                [base.x, base.x + 250, base.x + 500],
              );
            },
            { timeout: 10000 },
          );
          await arrange("Align top edges");
          await waitFor(
            async () => {
              const saved = await Promise.all(ids.map(savedNode));
              assert.deepEqual(
                saved.map((n) => Math.round(n?.position.y ?? 0)),
                [base.y, base.y, base.y],
              );
              // Only along the one axis
              assert.deepEqual(
                saved.map((n) => Math.round(n?.position.x ?? 0)),
                [base.x, base.x + 250, base.x + 500],
              );
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await removeNodes(ids);
        }
      });

      it("shows resolved pins only while the resolved toggle is on", async function () {
        this.timeout(30000);
        const board = await ensureBoard();
        localStorage.setItem("whiteboard:showResolvedComments", "false");
        lookAt({ x: 25000, y: 25000 });
        let thread: string | undefined;
        const pin = () =>
          document.querySelector(`.jr-comment-pin[data-thread="${thread}"]`);
        const toggle = async () => {
          await act(async () => {
            fireEvent.click(
              screen.getByRole("button", { name: /^Show resolved comments/ }),
            );
            await stabilize();
          });
        };
        try {
          await openBoard();
          await sendChatMessage.callPromise({
            puzzleId: board.puzzle,
            content: JSON.stringify({
              type: "message",
              children: [{ text: "All sorted" }],
            }),
            comment: { x: 25000, y: 25000 },
          });
          thread = await waitFor(
            async () => {
              const found = await ChatMessages.findOneAsync({
                "comment.x": 25000,
              });
              assert.ok(found);
              return found._id;
            },
            { timeout: 10000 },
          );
          await waitFor(() => assert.isNotNull(pin()), { timeout: 10000 });
          await setWhiteboardCommentResolved.callPromise({
            messageId: thread,
            resolved: true,
          });
          await waitFor(() => assert.isNull(pin()), { timeout: 10000 });
          await toggle();
          await waitFor(() => assert.isNotNull(pin()));
          await toggle();
          await waitFor(() => assert.isNull(pin()));
        } finally {
          forgetView();
          localStorage.removeItem("whiteboard:showResolvedComments");
          if (thread) {
            await deleteWhiteboardComment.callPromise({ messageId: thread });
          }
        }
      });

      it("shows less on cards as the board zooms out", async function () {
        this.timeout(60000);
        // The board's cards and puzzles reach this client with the page
        await openBoard();
        await waitFor(
          () =>
            assert.isNotNull(
              document.querySelector(".react-flow__node-puzzle"),
            ),
          { timeout: 20000 },
        );
        const card = await WhiteboardNodes.findOneAsync({
          board: boardId,
          type: "puzzle",
          hidden: { $ne: true },
        });
        assert.ok(card);
        const puzzle = await Puzzles.findOneAsync(card.puzzle ?? "");
        assert.ok(puzzle);
        let absolute = { ...card.position };
        let parent = card.parent;
        while (parent) {
          const frame = await WhiteboardNodes.findOneAsync(parent);
          assert.ok(frame);
          absolute = {
            x: absolute.x + frame.position.x,
            y: absolute.y + frame.position.y,
          };
          parent = frame.parent;
        }
        const openAt = async (zoom: number) => {
          cleanup();
          lookAt(absolute, zoom);
          await openBoard();
          return nodeShown(card._id);
        };
        const answers = puzzle.answers;
        try {
          // Unsolved to start with, so the far view shows the title's first
          // word, then solved, when it shows the answer instead
          await setPuzzleAnswers.callPromise({
            puzzleId: puzzle._id,
            answers: [],
          });
          const full = await openAt(1);
          await waitFor(() => {
            assert.exists(full.querySelector('a[title="Open puzzle"]'));
            assert.include(full.textContent ?? "", puzzle.title);
            assert.include(full.textContent ?? "", "Answer");
          });

          const mid = await openAt(0.45);
          await waitFor(() => {
            assert.isNull(mid.querySelector('a[title="Open puzzle"]'));
            assert.include(mid.textContent ?? "", puzzle.title);
            assert.notInclude(mid.textContent ?? "", "Answer");
          });

          const far = await openAt(0.2);
          await waitFor(() => {
            assert.isNull(far.querySelector('a[title="Open puzzle"]'));
            assert.exists(
              far.querySelector(`[title="${CSS.escape(puzzle.title)}"]`),
            );
            assert.equal(far.textContent?.trim(), puzzle.title.split(/\s+/)[0]);
          });
          await setPuzzleAnswers.callPromise({
            puzzleId: puzzle._id,
            answers: ["SKYLARK", "SECOND"],
          });
          await waitFor(
            () => assert.equal(far.textContent?.trim(), "SKYLARK"),
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await setPuzzleAnswers.callPromise({ puzzleId: puzzle._id, answers });
        }
      });

      it("keeps each viewer's view of the board for next time", async function () {
        this.timeout(30000);
        const key = `whiteboard:viewport:${boardId}`;
        localStorage.setItem(
          key,
          JSON.stringify({ x: -100, y: -50, zoom: 0.9 }),
        );
        const scale = () =>
          document.querySelector<HTMLElement>(".react-flow__viewport")?.style
            .transform ?? "";
        try {
          await openBoard();
          await waitFor(() => assert.include(scale(), "scale(0.9)"));
          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
            await stabilize();
          });
          const saved = await waitFor(
            () => {
              const viewport = JSON.parse(localStorage.getItem(key) ?? "{}");
              assert.isAbove(viewport.zoom, 0.9);
              return viewport as { zoom: number };
            },
            { timeout: 5000 },
          );

          cleanup();
          await openBoard();
          await waitFor(() => assert.include(scale(), `scale(${saved.zoom})`));
        } finally {
          forgetView();
        }
      });

      it("moves a node into and out of a frame with the arrow keys", async function () {
        this.timeout(30000);
        const frame = Random.id();
        const sticky = Random.id();
        const base = { x: 26000, y: 26000 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: frame,
              type: "frame",
              position: base,
              width: 400,
              height: 300,
            },
            {
              _id: sticky,
              type: "sticky",
              // Its middle is 20 past the frame's right edge
              position: { x: base.x + 420, y: base.y + 100 },
              width: 100,
              height: 80,
            },
          ],
        });
        lookAt(base);
        const nudge = async (key: string, times: number) => {
          const node = await nodeShown(sticky);
          for (let i = 0; i < times; i++) {
            await press(node, { key, shiftKey: true });
          }
        };
        try {
          await openBoard();
          await select(sticky);
          await nudge("ArrowLeft", 4);
          await waitFor(
            async () => {
              const moved = await savedNode(sticky);
              assert.equal(moved?.parent, frame);
              assert.deepEqual(moved?.position, { x: 340, y: 100 });
              // It overhangs the frame's right edge by 40, so that grows
              assert.equal(
                (await savedNode(frame))?.width,
                440 + FRAME_PADDING,
              );
            },
            { timeout: 10000 },
          );
          await nudge("ArrowRight", 4);
          await waitFor(
            async () => {
              const moved = await savedNode(sticky);
              assert.isUndefined(moved?.parent);
              assert.deepEqual(moved?.position, {
                x: base.x + 420,
                y: base.y + 100,
              });
              // and doesn't shrink again
              assert.equal(
                (await savedNode(frame))?.width,
                440 + FRAME_PADDING,
              );
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await removeNodes([sticky, frame]);
        }
      });

      describe("frame tools", function () {
        const click = async (element: Element) => {
          await act(async () => {
            fireEvent.click(element);
            await stabilize();
          });
        };
        const clickButton = async (name: string) =>
          click(await screen.findByRole("button", { name }));
        const onScreen = async (id: string) => {
          const box = (await nodeShown(id)).getBoundingClientRect();
          return { left: box.left, top: box.top };
        };
        // A frame of our own at `base`, with notes inside it where given.
        const frameWith = async (
          base: { x: number; y: number },
          size: { width: number; height: number },
          notes: { x: number; y: number }[],
        ) => {
          const frame = Random.id();
          const ids = notes.map(() => Random.id());
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              { _id: frame, type: "frame", position: base, ...size },
              ...ids.map((_id, i) => ({
                _id,
                type: "sticky" as const,
                parent: frame,
                position: notes[i]!,
                width: 160,
                height: 120,
              })),
            ],
          });
          return { frame, notes: ids };
        };

        it("fits a frame round what's in it without moving anything on screen", async function () {
          this.timeout(30000);
          const base = { x: 35000, y: 35000 };
          const { frame, notes } = await frameWith(
            base,
            { width: 1200, height: 900 },
            [
              { x: 200, y: 200 },
              { x: 500, y: 300 },
            ],
          );
          lookAt(base);
          try {
            await openBoard();
            const before = await onScreen(notes[1]!);
            await select(frame);
            await clickButton("Fit to contents");
            await waitFor(
              async () => {
                const fitted = await savedNode(frame);
                assert.deepEqual(fitted?.position, {
                  x: base.x + 200 - FRAME_PADDING,
                  y: base.y + 200 - FRAME_HEADER,
                });
                assert.equal(fitted?.width, 660 - 200 + FRAME_PADDING * 2);
                assert.equal(
                  fitted?.height,
                  420 - 200 + FRAME_HEADER + FRAME_PADDING,
                );
                assert.deepEqual((await savedNode(notes[0]!))?.position, {
                  x: FRAME_PADDING,
                  y: FRAME_HEADER,
                });
                assert.deepEqual((await savedNode(notes[1]!))?.position, {
                  x: 300 + FRAME_PADDING,
                  y: 100 + FRAME_HEADER,
                });
              },
              { timeout: 10000 },
            );
            const after = await onScreen(notes[1]!);
            assert.closeTo(after.left, before.left, 1);
            assert.closeTo(after.top, before.top, 1);
          } finally {
            forgetView();
            await removeNodes([...notes, frame]);
          }
        });

        it("grows a frame when a note is dropped past its edge", async function () {
          this.timeout(30000);
          const base = { x: 36000, y: 35000 };
          const { frame } = await frameWith(
            base,
            { width: 400, height: 300 },
            [],
          );
          const note = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: note,
                type: "sticky",
                position: { x: base.x + 600, y: base.y + 100 },
                width: 100,
                height: 80,
              },
            ],
          });
          lookAt(base);
          try {
            await openBoard();
            const element = await nodeShown(note);
            const box = element.getBoundingClientRect();
            const start = {
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
            };
            const mouse = { button: 0, view: window };
            const at = (dx: number) => ({
              ...mouse,
              clientX: start.clientX - dx,
              clientY: start.clientY,
            });
            await act(async () => {
              fireEvent.mouseDown(element, { ...mouse, ...start });
              await stabilize();
            });
            // The first move starts the drag, and the node moves as far as
            // the pointer moves from there. Its middle ends up 10 inside the
            // frame's right edge, so it overhangs by 40.
            const to = at(262);
            for (const point of [at(2), to]) {
              await act(async () => {
                fireEvent.mouseMove(window, point);
                await stabilize();
              });
            }
            await act(async () => {
              fireEvent.mouseUp(window, to);
              await stabilize();
            });
            await waitFor(
              async () => {
                const dropped = await savedNode(note);
                assert.equal(dropped?.parent, frame);
                assert.deepEqual(dropped?.position, { x: 340, y: 100 });
                const grown = await savedNode(frame);
                assert.equal(grown?.width, 440 + FRAME_PADDING);
                assert.equal(grown?.height, 300);
                assert.deepEqual(grown?.position, base);
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeNodes([note, frame]);
          }
        });

        it("tidies a round's cards round a note, and undoes it as one step", async function () {
          this.timeout(30000);
          const { a, frame } = await sideBySideCards(boardId);
          const note = Random.id();
          const notePosition = {
            x: cardSlot(3).x + CARD_WIDTH + 40,
            y: FRAME_HEADER,
          };
          const away = { x: cardSlot(3).x + CARD_WIDTH + 240, y: FRAME_HEADER };
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: note,
                type: "sticky",
                parent: frame._id,
                position: notePosition,
                width: 160,
                height: 120,
              },
              { _id: a._id, position: away },
            ],
          });
          const slots = new Set(
            Array.from({ length: 64 }, (_, i) => JSON.stringify(cardSlot(i))),
          );
          try {
            await openBoard();
            await select(frame._id);
            await clickButton("Tidy");
            await waitFor(
              async () => {
                const cards = await WhiteboardNodes.find({
                  board: boardId,
                  parent: frame._id,
                  type: "puzzle",
                  hidden: { $ne: true },
                }).fetchAsync();
                const taken = cards.map((c) => JSON.stringify(c.position));
                taken.forEach((at) => assert.isTrue(slots.has(at), at));
                assert.equal(new Set(taken).size, taken.length);
                assert.notDeepEqual(
                  cards.find((c) => c._id === a._id)?.position,
                  away,
                );
              },
              { timeout: 10000 },
            );
            assert.deepEqual((await savedNode(note))?.position, notePosition);
            await waitFor(
              () =>
                assert.isFalse(
                  screen.getByRole<HTMLButtonElement>("button", {
                    name: "Undo",
                  }).disabled,
                ),
              { timeout: 10000 },
            );

            await pressBoard();
            await press(pane(), { key: "z", ctrlKey: true });
            await waitFor(
              async () =>
                assert.deepEqual((await savedNode(a._id))?.position, away),
              { timeout: 10000 },
            );
            assert.deepEqual((await savedNode(note))?.position, notePosition);
          } finally {
            forgetView();
            await removeNodes([note]);
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: a._id, parent: a.parent, position: a.position }],
            });
          }
        });

        it("refuses to fit a frame when something locked in it would have to move", async function () {
          this.timeout(30000);
          const base = { x: 37000, y: 35000 };
          const { frame, notes } = await frameWith(
            base,
            { width: 1200, height: 900 },
            [{ x: 200, y: 200 }],
          );
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [{ _id: notes[0]!, locked: true }],
          });
          lookAt(base);
          try {
            await openBoard();
            await select(frame);
            await clickButton("Fit to contents");
            await screen.findByText("That's locked");
            const held = await savedNode(frame);
            assert.deepEqual(held?.position, base);
            assert.equal(held?.width, 1200);
            assert.deepEqual((await savedNode(notes[0]!))?.position, {
              x: 200,
              y: 200,
            });
          } finally {
            forgetView();
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: notes[0]!, locked: false }],
            });
            await removeNodes([...notes, frame]);
          }
        });

        it("tidies a locked frame only when it needn't grow, and never offers to fit it", async function () {
          this.timeout(30000);
          const { a, frame } = await sideBySideCards(boardId);
          const away = { x: cardSlot(3).x + CARD_WIDTH + 240, y: FRAME_HEADER };
          // Sizes are set before the board opens, so it never draws the
          // frame changing size under it
          const lockedAt = async (size: { width: number; height: number }) => {
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [
                { _id: frame._id, locked: false, ...size },
                { _id: a._id, position: away },
              ],
            });
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: frame._id, locked: true }],
            });
          };
          const tidy = async () => {
            await openBoard();
            await select(frame._id);
            await screen.findByRole("button", { name: "Tidy" });
            assert.isNull(
              screen.queryByRole("button", { name: "Fit to contents" }),
            );
            await clickButton("Tidy");
          };
          lookAt(frame.position);
          try {
            // Big enough for the cards already
            await lockedAt({ width: 4000, height: 4000 });
            await tidy();
            await waitFor(
              async () =>
                assert.notDeepEqual((await savedNode(a._id))?.position, away),
              { timeout: 10000 },
            );
            const tidied = await savedNode(frame._id);
            assert.equal(tidied?.width, 4000);
            assert.equal(tidied?.height, 4000);
            cleanup();

            // Too small for them, so it would have to grow
            await lockedAt({ width: 200, height: 200 });
            await tidy();
            await screen.findByText("That's locked");
            assert.deepEqual((await savedNode(a._id))?.position, away);
            assert.equal((await savedNode(frame._id))?.width, 200);
          } finally {
            forgetView();
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [
                {
                  _id: frame._id,
                  locked: false,
                  width: frame.width,
                  height: frame.height,
                },
              ],
            });
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: a._id, parent: a.parent, position: a.position }],
            });
          }
        });

        it("grows a frame for a nudge past its edge from inside it", async function () {
          this.timeout(30000);
          const base = { x: 38000, y: 35000 };
          const { frame } = await frameWith(
            base,
            { width: 400, height: 300 },
            [],
          );
          const note = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: note,
                type: "sticky",
                parent: frame,
                position: { x: 280, y: 100 },
                width: 100,
                height: 80,
              },
            ],
          });
          lookAt(base);
          try {
            await openBoard();
            await select(note);
            const node = await nodeShown(note);
            // Two steps of 20 take its right edge 20 past the frame's
            await press(node, { key: "ArrowRight", shiftKey: true });
            await press(node, { key: "ArrowRight", shiftKey: true });
            await waitFor(
              async () => {
                const moved = await savedNode(note);
                assert.equal(moved?.parent, frame);
                assert.deepEqual(moved?.position, { x: 320, y: 100 });
                assert.equal(
                  (await savedNode(frame))?.width,
                  420 + FRAME_PADDING,
                );
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeNodes([note, frame]);
          }
        });

        // Errors the page reports from now until stopped, such as React
        // Flow's ResizeObserver reporting a loop.
        const collectPageErrors = () => {
          const errors: string[] = [];
          const onError = (event: ErrorEvent) => {
            errors.push(event.message);
          };
          window.addEventListener("error", onError);
          return {
            errors,
            stop: () => window.removeEventListener("error", onError),
          };
        };
        // Every value an element's style property takes from now until
        // stopped, starting with the one it has.
        const watchStyle = (
          element: HTMLElement,
          property: "width" | "transform",
        ) => {
          const seen = [element.style[property]];
          const observer = new MutationObserver(() => {
            const value = element.style[property];
            if (value !== seen.at(-1)) seen.push(value);
          });
          observer.observe(element, {
            attributes: true,
            attributeFilter: ["style"],
          });
          return { seen, stop: () => observer.disconnect() };
        };

        it("snaps to a size changed elsewhere, keeping what's in it still", async function () {
          this.timeout(30000);
          const base = { x: 39000, y: 35000 };
          const {
            frame,
            notes: [note],
          } = await frameWith(base, { width: 400, height: 300 }, [
            { x: 40, y: 80 },
          ]);
          lookAt(base);
          const page = collectPageErrors();
          try {
            await openBoard();
            const frameNode = await nodeShown(frame);
            const noteNode = await nodeShown(note!);
            const widths = watchStyle(frameNode, "width");
            const notePlaces = watchStyle(noteNode, "transform");
            // Grown from the top left, as Fit to contents might: the frame
            // moves and its note moves the other way within it
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [
                {
                  _id: frame,
                  position: { x: base.x - 100, y: base.y - 50 },
                  width: 600,
                  height: 450,
                },
                { _id: note!, position: { x: 140, y: 130 } },
              ],
            });
            await waitFor(() => assert.equal(frameNode.style.width, "600px"), {
              timeout: 10000,
            });
            // Long enough for a glide, and for React Flow to measure it
            await new Promise((resolve) => {
              setTimeout(resolve, 500);
            });
            widths.stop();
            notePlaces.stop();
            assert.deepEqual(widths.seen, ["400px", "600px"]);
            assert.lengthOf(notePlaces.seen, 1);
            assert.deepEqual(
              page.errors.filter((e) => e.includes("ResizeObserver")),
              [],
            );
          } finally {
            page.stop();
            forgetView();
            await removeNodes([note!, frame]);
          }
        });

        it("shrinks a frame back when the nudge that grew it is undone", async function () {
          this.timeout(30000);
          const base = { x: 40000, y: 35000 };
          const { frame } = await frameWith(
            base,
            { width: 400, height: 300 },
            [],
          );
          const note = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: note,
                type: "sticky",
                parent: frame,
                position: { x: 280, y: 100 },
                width: 100,
                height: 80,
              },
            ],
          });
          lookAt(base);
          const page = collectPageErrors();
          try {
            await openBoard();
            await select(note);
            const node = await nodeShown(note);
            await press(node, { key: "ArrowRight", shiftKey: true });
            await press(node, { key: "ArrowRight", shiftKey: true });
            await waitFor(
              async () =>
                assert.equal(
                  (await savedNode(frame))?.width,
                  420 + FRAME_PADDING,
                ),
              { timeout: 10000 },
            );
            const undo = screen.getByRole<HTMLButtonElement>("button", {
              name: "Undo",
            });
            await waitFor(() => assert.isFalse(undo.disabled), {
              timeout: 10000,
            });
            await click(undo);
            await waitFor(
              async () => {
                const moved = await savedNode(note);
                assert.deepEqual(moved?.position, { x: 280, y: 100 });
                assert.equal((await savedNode(frame))?.width, 400);
                assert.equal((await nodeShown(frame)).style.width, "400px");
              },
              { timeout: 10000 },
            );
            await new Promise((resolve) => {
              setTimeout(resolve, 500);
            });
            assert.deepEqual(
              page.errors.filter((e) => e.includes("ResizeObserver")),
              [],
            );
          } finally {
            page.stop();
            forgetView();
            await removeNodes([note, frame]);
          }
        });

        it("doesn't grow a locked frame for a note nudged into it", async function () {
          this.timeout(30000);
          const base = { x: 39000, y: 35000 };
          const { frame } = await frameWith(
            base,
            { width: 400, height: 300 },
            [],
          );
          const note = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              { _id: frame, locked: true },
              {
                _id: note,
                type: "sticky",
                // Its middle is 20 past the frame's right edge
                position: { x: base.x + 420, y: base.y + 100 },
                width: 100,
                height: 80,
              },
            ],
          });
          lookAt(base);
          try {
            await openBoard();
            await select(note);
            const node = await nodeShown(note);
            for (let i = 0; i < 4; i++) {
              await press(node, { key: "ArrowLeft", shiftKey: true });
            }
            await waitFor(
              async () => {
                const moved = await savedNode(note);
                assert.equal(moved?.parent, frame);
                assert.deepEqual(moved?.position, { x: 340, y: 100 });
              },
              { timeout: 10000 },
            );
            const held = await savedNode(frame);
            assert.equal(held?.width, 400);
            assert.equal(held?.height, 300);
          } finally {
            forgetView();
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: frame, locked: false }],
            });
            await removeNodes([note, frame]);
          }
        });
      });

      describe("undo and redo", function () {
        const undoButton = () =>
          screen.getByRole<HTMLButtonElement>("button", { name: "Undo" });
        const redoButton = () =>
          screen.getByRole<HTMLButtonElement>("button", { name: "Redo" });
        const undoKey = () => press(pane(), { key: "z", ctrlKey: true });
        const redoKey = () =>
          press(pane(), { key: "Z", ctrlKey: true, shiftKey: true });
        // Anything a key sent is back once a later call is, as the server
        // runs one client's calls in order.
        const serverCaughtUp = () =>
          clearPuzzleSubscribers.callPromise({ userIds: [] });
        const STALE_NOTICE =
          "Changed by someone else since, so it wasn't undone";
        // An edit is on the undo stack once its save is back.
        const canUndo = () =>
          waitFor(() => assert.isFalse(undoButton().disabled), {
            timeout: 10000,
          });
        const canRedo = () =>
          waitFor(() => assert.isFalse(redoButton().disabled), {
            timeout: 10000,
          });
        const sticky = async (
          base: { x: number; y: number },
          text?: string,
        ) => {
          const _id = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id,
                type: "sticky",
                position: base,
                width: 160,
                height: 120,
                text,
              },
            ],
          });
          return _id;
        };
        const nudgeRight = async (id: string) => {
          await select(id);
          const node = await nodeShown(id);
          await press(node, { key: "ArrowRight", shiftKey: true });
          await press(node, { key: "ArrowRight", shiftKey: true });
        };
        const positionOf = async (id: string) =>
          (await savedNode(id))?.position;

        it("undoes a move and redoes it", async function () {
          this.timeout(30000);
          const base = { x: 27000, y: 27000 };
          const id = await sticky(base);
          lookAt(base);
          try {
            await openBoard();
            assert.isTrue(undoButton().disabled);
            assert.isTrue(redoButton().disabled);
            assert.include(undoButton().title, "Ctrl/⌘+Z");
            await nudgeRight(id);
            await waitFor(
              async () => assert.notDeepEqual(await positionOf(id), base),
              { timeout: 10000 },
            );
            const moved = await positionOf(id);
            await canUndo();

            await pressBoard();
            await undoKey();
            await waitFor(
              async () => {
                const node = await savedNode(id);
                assert.deepEqual(node?.position, base);
                assert.isTrue(node?.manual);
              },
              { timeout: 10000 },
            );
            await canRedo();
            assert.isTrue(undoButton().disabled);

            await redoKey();
            await waitFor(
              async () => assert.deepEqual(await positionOf(id), moved),
              { timeout: 10000 },
            );
            await canUndo();
            assert.isTrue(redoButton().disabled);
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });

        it("puts a deleted sticky back, and undoes and redoes a text edit", async function () {
          this.timeout(30000);
          const base = { x: 27500, y: 27000 };
          const id = await sticky(base, "Before");
          lookAt(base);
          try {
            await openBoard();
            await select(id);
            await press(document.body, { key: "Delete" });
            await waitFor(async () => assert.isUndefined(await savedNode(id)), {
              timeout: 10000,
            });
            await canUndo();
            await pressBoard();
            await undoKey();
            await waitFor(
              async () => {
                const node = await savedNode(id);
                assert.equal(node?.text, "Before");
                assert.deepEqual(node?.position, base);
              },
              { timeout: 10000 },
            );
            await canRedo();

            const node = await nodeShown(id);
            await act(async () => {
              fireEvent.doubleClick(within(node).getByText("Before"));
              await stabilize();
            });
            const editor = within(node).getByRole("textbox");
            await act(async () => {
              fireEvent.change(editor, { target: { value: "After" } });
              fireEvent.blur(editor);
              await stabilize();
            });
            await waitFor(
              async () => assert.equal((await savedNode(id))?.text, "After"),
              { timeout: 10000 },
            );
            // A new edit leaves nothing to redo
            await waitFor(() => assert.isTrue(redoButton().disabled), {
              timeout: 10000,
            });

            await pressBoard();
            await undoKey();
            await waitFor(
              async () => assert.equal((await savedNode(id))?.text, "Before"),
              { timeout: 10000 },
            );
            await canRedo();
            await redoKey();
            await waitFor(
              async () => assert.equal((await savedNode(id))?.text, "After"),
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });

        it("undoes collapsing a frame", async function () {
          this.timeout(30000);
          const base = { x: 28000, y: 27000 };
          const frame = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: frame,
                type: "frame",
                position: base,
                width: 400,
                height: 300,
                label: "Fold me",
              },
            ],
          });
          lookAt(base);
          const collapsed = async () => !!(await savedNode(frame))?.collapsed;
          try {
            await openBoard();
            const node = await nodeShown(frame);
            await act(async () => {
              fireEvent.click(
                within(node).getByRole("button", {
                  name: "Collapse for everyone",
                }),
              );
              await stabilize();
            });
            await waitFor(async () => assert.isTrue(await collapsed()), {
              timeout: 10000,
            });
            await canUndo();
            await pressBoard();
            await undoKey();
            await waitFor(async () => assert.isFalse(await collapsed()), {
              timeout: 10000,
            });
            await canRedo();
            await press(pane(), { key: "y", ctrlKey: true });
            await waitFor(async () => assert.isTrue(await collapsed()), {
              timeout: 10000,
            });
          } finally {
            forgetView();
            await removeNodes([frame]);
          }
        });

        it("undoes a drawn stroke and redoes it", async function () {
          this.timeout(30000);
          const base = { x: 28500, y: 27000 };
          const screenAt = lookAt(base);
          const before = new Set(
            (
              await WhiteboardNodes.find({
                board: boardId,
                type: "ink",
              }).fetchAsync()
            ).map((n) => n._id),
          );
          const drawn = async () =>
            (
              await WhiteboardNodes.find({
                board: boardId,
                type: "ink",
              }).fetchAsync()
            ).filter((n) => !before.has(n._id));
          let ids: string[] = [];
          try {
            await openBoard();
            await act(async () => {
              fireEvent.click(screen.getByRole("button", { name: /^Draw/ }));
              await stabilize();
            });
            const point = (dx: number) => ({
              button: 0,
              buttons: 1,
              pointerId: 1,
              ...screenAt(base.x + dx, base.y + dx / 2),
            });
            await act(async () => {
              fireEvent.pointerDown(pane(), point(0));
              await stabilize();
            });
            for (const dx of [20, 40, 60, 80]) {
              await act(async () => {
                fireEvent.pointerMove(pane(), point(dx));
                await stabilize();
              });
            }
            await act(async () => {
              fireEvent.pointerUp(pane(), { ...point(80), buttons: 0 });
              await stabilize();
            });
            ids = await waitFor(
              async () => {
                const segments = await drawn();
                assert.isNotEmpty(segments);
                return segments.map((n) => n._id);
              },
              { timeout: 10000 },
            );
            await canUndo();

            await undoKey();
            await waitFor(async () => assert.isEmpty(await drawn()), {
              timeout: 10000,
            });
            await canRedo();
            await redoKey();
            await waitFor(
              async () =>
                assert.sameMembers(
                  (await drawn()).map((n) => n._id),
                  ids,
                ),
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            ids = [...ids, ...(await drawn()).map((n) => n._id)];
            if (ids.length > 0) await removeNodes(ids);
          }
        });

        it("won't undo a move someone else has changed since", async function () {
          this.timeout(30000);
          const base = { x: 29000, y: 27000 };
          const id = await sticky(base);
          lookAt(base);
          const elsewhere = { x: base.x + 500, y: base.y + 500 };
          try {
            await openBoard();
            await nudgeRight(id);
            await canUndo();
            // Moved from outside this board's own edits, as by someone else
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: id, position: elsewhere }],
            });
            await waitFor(
              async () => assert.deepEqual(await positionOf(id), elsewhere),
              { timeout: 10000 },
            );

            await pressBoard();
            await undoKey();
            await screen.findByText(STALE_NOTICE);
            assert.deepEqual(await positionOf(id), elsewhere);
            assert.isTrue(undoButton().disabled);
            assert.isTrue(redoButton().disabled);
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });

        it("forgets what could be undone once the layout is reset", async function () {
          this.timeout(30000);
          const base = { x: 29500, y: 27000 };
          const id = await sticky(base);
          lookAt(base);
          try {
            await openBoard();
            await nudgeRight(id);
            await canUndo();
            const moved = await positionOf(id);
            await resetWhiteboardLayout.callPromise({
              boardId,
              putBack: false,
            });
            await waitFor(() => assert.isTrue(undoButton().disabled), {
              timeout: 10000,
            });

            await pressBoard();
            await undoKey();
            await serverCaughtUp();
            assert.deepEqual(await positionOf(id), moved);
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });

        it("forgets what could be undone when edit access goes", async function () {
          this.timeout(30000);
          const base = { x: 30000, y: 27000 };
          const id = await sticky(base);
          lookAt(base);
          try {
            await openBoard();
            await nudgeRight(id);
            await canUndo();
            await setHuntArchived.callPromise({ huntId, isArchived: true });
            try {
              await waitFor(
                () =>
                  assert.isNull(screen.queryByRole("button", { name: "Undo" })),
                { timeout: 10000 },
              );
            } finally {
              await setHuntArchived.callPromise({ huntId, isArchived: false });
            }
            await waitFor(() => assert.isTrue(undoButton().disabled), {
              timeout: 10000,
            });
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });

        it("leaves Ctrl+Z to the text being typed", async function () {
          this.timeout(30000);
          const base = { x: 30500, y: 27000 };
          const id = await sticky(base, "Words");
          lookAt(base);
          try {
            await openBoard();
            await nudgeRight(id);
            await waitFor(
              async () => assert.notDeepEqual(await positionOf(id), base),
              { timeout: 10000 },
            );
            const moved = await positionOf(id);
            await canUndo();

            const node = await nodeShown(id);
            await act(async () => {
              fireEvent.doubleClick(within(node).getByText("Words"));
              await stabilize();
            });
            await press(within(node).getByRole("textbox"), {
              key: "z",
              ctrlKey: true,
            });
            await serverCaughtUp();
            assert.deepEqual(await positionOf(id), moved);
            assert.isFalse(undoButton().disabled);
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });

        it("undoes colour changes made before the first is saved as one step", async function () {
          this.timeout(30000);
          const base = { x: 31000, y: 27000 };
          const id = await sticky(base);
          lookAt(base);
          try {
            await openBoard();
            await select(id);
            // The colour picker's, not Duplicate's
            const toolbar = await waitFor(() => {
              const found = document.querySelector<HTMLElement>(
                '.react-flow__node-toolbar:has([aria-label="Red"])',
              );
              assert.exists(found);
              return found;
            });
            const red = within(toolbar).getByRole("button", { name: "Red" });
            const blue = within(toolbar).getByRole("button", { name: "Blue" });
            // Both are sent before either save is back
            await act(async () => {
              fireEvent.click(red);
              fireEvent.click(blue);
              await stabilize();
            });
            await waitFor(
              async () => assert.equal((await savedNode(id))?.color, "blue"),
              { timeout: 10000 },
            );
            await canUndo();

            await pressBoard();
            await undoKey();
            await waitFor(
              async () => assert.isUndefined((await savedNode(id))?.color),
              { timeout: 10000 },
            );
            await canRedo();
            assert.isTrue(undoButton().disabled);
            assert.isNull(screen.queryByText(STALE_NOTICE));

            await redoKey();
            await waitFor(
              async () => assert.equal((await savedNode(id))?.color, "blue"),
              { timeout: 10000 },
            );
            await canUndo();
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });
      });

      describe("copy, paste and duplicate", function () {
        // Sends the board (or target) a copy or paste as the browser would,
        // with a clipboard of its own.
        const clipboard = async (
          type: "copy" | "paste",
          text?: string,
          target: Element = pane(),
        ) => {
          const data = new DataTransfer();
          if (text !== undefined) data.setData("text/plain", text);
          const event = new ClipboardEvent(type, {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          });
          await act(async () => {
            target.dispatchEvent(event);
            await stabilize();
          });
          return { text: data.getData("text/plain"), event };
        };
        // The middle of the view, on the board, when lookAt(base) opened it.
        const viewCentre = (base: { x: number; y: number }) => {
          const box = pane().getBoundingClientRect();
          return {
            x: base.x - 150 + box.width / 2,
            y: base.y - 150 + box.height / 2,
          };
        };
        const undoButton = () =>
          screen.getByRole<HTMLButtonElement>("button", { name: "Undo" });
        const stickyAt = async (
          position: { x: number; y: number },
          text: string,
        ) => {
          const _id = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              { _id, type: "sticky", position, width: 160, height: 120, text },
            ],
          });
          return _id;
        };
        const withText = (texts: string[]) =>
          WhiteboardNodes.find({ board: boardId, text: { $in: texts } });

        it("copies notes with the line between them and pastes them in the middle of the view, undone as one", async function () {
          this.timeout(30000);
          const base = { x: 32000, y: 32000 };
          const texts = [`A ${Random.id()}`, `B ${Random.id()}`];
          const a = await stickyAt(base, texts[0]!);
          const b = await stickyAt(
            { x: base.x + 300, y: base.y + 40 },
            texts[1]!,
          );
          await upsertWhiteboardEdges.callPromise({
            boardId,
            edges: [
              {
                _id: Random.id(),
                source: a,
                target: b,
                label: "then",
                dashed: true,
              },
            ],
          });
          const copies = () =>
            withText(texts)
              .fetchAsync()
              .then((found) => found.filter((n) => n._id !== a && n._id !== b));
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            await select(a);
            await act(async () => {
              fireEvent.keyDown(document, {
                key: "Control",
                code: "ControlLeft",
              });
              await stabilize();
            });
            await select(b);
            await act(async () => {
              fireEvent.keyUp(document, {
                key: "Control",
                code: "ControlLeft",
              });
              await stabilize();
            });

            const copied = await clipboard("copy");
            assert.isTrue(copied.event.defaultPrevented);
            assert.isTrue(copied.text.startsWith("jolly-roger-whiteboard/1\n"));
            const json = JSON.parse(
              copied.text.slice(copied.text.indexOf("\n")),
            );
            assert.lengthOf(json.nodes, 2);
            assert.lengthOf(json.edges, 1);

            const pasted = await clipboard("paste", copied.text);
            assert.isTrue(pasted.event.defaultPrevented);
            const centre = viewCentre(base);
            await waitFor(
              async () => {
                const found = await copies();
                assert.lengthOf(found, 2);
                const [a2, b2] = texts.map(
                  (text) => found.find((n) => n.text === text)!,
                );
                // The same shape, its middle in the middle of the view
                assert.equal(b2!.position.x - a2!.position.x, 300);
                assert.equal(b2!.position.y - a2!.position.y, 40);
                assert.closeTo(a2!.position.x + 230, centre.x, 1);
                assert.closeTo(a2!.position.y + 80, centre.y, 1);
                found.forEach((n) => {
                  assert.isUndefined(n.parent);
                  assert.isUndefined(n.locked);
                  assert.equal(n.contributors[0]?.user, Meteor.userId());
                });
                const joined = await WhiteboardEdges.findOneAsync({
                  source: a2!._id,
                  target: b2!._id,
                });
                assert.equal(joined?.label, "then");
                assert.isTrue(joined?.dashed);
              },
              { timeout: 10000 },
            );
            const pastedIds = (await copies()).map((n) => n._id);

            await waitFor(() => assert.isFalse(undoButton().disabled), {
              timeout: 10000,
            });
            await pressBoard();
            await press(pane(), { key: "z", ctrlKey: true });
            await waitFor(
              async () => {
                assert.isEmpty(await copies());
                assert.equal(
                  await WhiteboardEdges.find({
                    board: boardId,
                    $or: [
                      { source: { $in: pastedIds } },
                      { target: { $in: pastedIds } },
                    ],
                  }).countAsync(),
                  0,
                );
              },
              { timeout: 10000 },
            );
            assert.exists(await savedNode(a));
            assert.exists(await savedNode(b));
          } finally {
            forgetView();
            const left = await withText(texts).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });

        it("duplicates the selection a little down and to the right on Ctrl+D and from its button", async function () {
          this.timeout(30000);
          const base = { x: 33000, y: 32000 };
          const text = `D ${Random.id()}`;
          const id = await stickyAt(base, text);
          const copies = async () =>
            (await withText([text]).fetchAsync()).filter((n) => n._id !== id);
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            await select(id);
            const button = await screen.findByRole("button", {
              name: "Duplicate",
            });
            assert.include(button.title, "Ctrl/⌘+D");
            assert.equal(
              button.getAttribute("aria-keyshortcuts"),
              "Control+D Meta+D",
            );
            await press(pane(), { key: "d", ctrlKey: true });
            await waitFor(
              async () => {
                const [copy, ...more] = await copies();
                assert.isEmpty(more);
                assert.deepEqual(copy?.position, {
                  x: base.x + 24,
                  y: base.y + 24,
                });
                assert.isUndefined(copy?.parent);
              },
              { timeout: 10000 },
            );

            // The copy is what's selected now, so the next one fans out
            // from it
            const first = (await copies())[0]!;
            await waitFor(() =>
              assert.isTrue(
                nodeElement(first._id)?.classList.contains("selected"),
              ),
            );
            assert.isFalse(nodeElement(id)?.classList.contains("selected"));
            await act(async () => {
              fireEvent.click(
                screen.getByRole("button", { name: "Duplicate" }),
              );
              await stabilize();
            });
            await waitFor(
              async () => {
                const found = await copies();
                assert.lengthOf(found, 2);
                assert.sameDeepMembers(
                  found.map((copy) => copy.position),
                  [
                    { x: base.x + 24, y: base.y + 24 },
                    { x: base.x + 48, y: base.y + 48 },
                  ],
                );
                found.forEach((copy) => assert.isUndefined(copy.parent));
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            const left = await withText([text]).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });

        it("pastes text as a sticky note and a web address as a linked text box", async function () {
          this.timeout(30000);
          const base = { x: 34000, y: 32000 };
          const note = `Legend ${Random.id()}`;
          const url = `https://example.com/${Random.id()}`;
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            const centre = viewCentre(base);

            await clipboard("paste", `  ${note}\n`);
            await waitFor(
              async () => {
                const sticky = await WhiteboardNodes.findOneAsync({
                  board: boardId,
                  text: note,
                });
                assert.equal(sticky?.type, "sticky");
                assert.closeTo(sticky!.position.x + 100, centre.x, 1);
                assert.closeTo(sticky!.position.y + 80, centre.y, 1);
              },
              { timeout: 10000 },
            );

            await clipboard("paste", url);
            const link = await waitFor(
              async () => {
                const found = await WhiteboardNodes.findOneAsync({
                  board: boardId,
                  text: url,
                });
                assert.equal(found?.type, "text");
                return found!;
              },
              { timeout: 10000 },
            );
            const shown = await nodeShown(link._id);
            await waitFor(() =>
              assert.exists(shown.querySelector(`a[href="${url}"]`)),
            );
          } finally {
            forgetView();
            const left = await withText([note, url]).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });

        it("says puzzle cards can't be copied when they're all that's selected", async function () {
          this.timeout(30000);
          const nodes = await WhiteboardNodes.find({
            board: boardId,
          }).fetchAsync();
          const docs = new Map(nodes.map((n) => [n._id, n]));
          const shownCard = nodes.find((n) => {
            if (n.type !== "puzzle" || n.hidden) return false;
            for (let p = n.parent; p; p = docs.get(p)?.parent) {
              const frame = docs.get(p);
              if (!frame || frame.hidden || frame.collapsed) return false;
            }
            return true;
          });
          assert.exists(shownCard);
          const card = shownCard;
          const at = { ...card.position };
          for (let p = card.parent; p; p = docs.get(p)?.parent) {
            at.x += docs.get(p)!.position.x;
            at.y += docs.get(p)!.position.y;
          }
          lookAt(at);
          try {
            await openBoard();
            await pressBoard();
            await select(card._id);
            assert.isNull(screen.queryByRole("button", { name: "Duplicate" }));
            const copied = await clipboard("copy");
            assert.isFalse(copied.event.defaultPrevented);
            assert.equal(copied.text, "");
            await screen.findByText("Puzzle cards can't be copied");
          } finally {
            forgetView();
          }
        });

        it("duplicates the rest of a selection with a card in it, and says the card was left out", async function () {
          this.timeout(30000);
          const nodes = await WhiteboardNodes.find({
            board: boardId,
          }).fetchAsync();
          const docs = new Map(nodes.map((n) => [n._id, n]));
          const card = nodes.find((n) => {
            if (n.type !== "puzzle" || n.hidden) return false;
            for (let p = n.parent; p; p = docs.get(p)?.parent) {
              const frame = docs.get(p);
              if (!frame || frame.hidden || frame.collapsed) return false;
            }
            return true;
          });
          assert.exists(card);
          const at = { ...card.position };
          for (let p = card.parent; p; p = docs.get(p)?.parent) {
            at.x += docs.get(p)!.position.x;
            at.y += docs.get(p)!.position.y;
          }
          const text = `Mixed ${Random.id()}`;
          const note = await stickyAt({ x: at.x, y: at.y + 300 }, text);
          lookAt(at);
          try {
            await openBoard();
            await pressBoard();
            await select(card._id);
            await act(async () => {
              fireEvent.keyDown(document, {
                key: "Control",
                code: "ControlLeft",
              });
              await stabilize();
            });
            await select(note);
            await act(async () => {
              fireEvent.keyUp(document, {
                key: "Control",
                code: "ControlLeft",
              });
              await stabilize();
            });
            await press(pane(), { key: "d", ctrlKey: true });
            await screen.findByText("Puzzle cards were left out");
            await waitFor(
              async () => {
                const copies = (await withText([text]).fetchAsync()).filter(
                  (n) => n._id !== note,
                );
                assert.lengthOf(copies, 1);
              },
              { timeout: 10000 },
            );
            assert.equal(
              await WhiteboardNodes.find({
                board: boardId,
                puzzle: card.puzzle,
              }).countAsync(),
              1,
            );
          } finally {
            forgetView();
            const left = await withText([text]).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });

        it("duplicates a frame beside the original, not inside it", async function () {
          this.timeout(30000);
          const base = { x: 35000, y: 30000 };
          const label = `Frame ${Random.id()}`;
          const text = `Inside ${Random.id()}`;
          const frame = Random.id();
          const inside = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: frame,
                type: "frame",
                position: base,
                width: 400,
                height: 300,
                label,
              },
              {
                _id: inside,
                type: "sticky",
                parent: frame,
                position: { x: 40, y: 60 },
                width: 160,
                height: 120,
                text,
              },
            ],
          });
          const copyOf = async (id: string, query: object) =>
            (
              await WhiteboardNodes.find({
                board: boardId,
                ...query,
              }).fetchAsync()
            ).find((n) => n._id !== id);
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            await select(frame);
            await press(pane(), { key: "d", ctrlKey: true });
            await waitFor(
              async () => {
                const frameCopy = await copyOf(frame, { label });
                assert.exists(frameCopy);
                assert.isUndefined(frameCopy.parent);
                assert.deepEqual(frameCopy.position, {
                  x: base.x + 24,
                  y: base.y + 24,
                });
                const insideCopy = await copyOf(inside, { text });
                assert.equal(insideCopy?.parent, frameCopy._id);
                assert.deepEqual(insideCopy?.position, { x: 40, y: 60 });
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            const left = await WhiteboardNodes.find({
              board: boardId,
              $or: [{ label }, { text }],
            }).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });

        it("fans out duplicates of a collapsed frame with a line inside it", async function () {
          this.timeout(30000);
          const base = { x: 35500, y: 30000 };
          const label = `Folded ${Random.id()}`;
          const frame = Random.id();
          const [a, b] = [Random.id(), Random.id()];
          const inside = (_id: string, x: number) => ({
            _id,
            type: "sticky" as const,
            parent: frame,
            position: { x, y: 60 },
            width: 120,
            height: 100,
            text: `In ${label}`,
          });
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: frame,
                type: "frame",
                position: base,
                width: 400,
                height: 300,
                label,
                collapsed: true,
              },
              inside(a, 20),
              inside(b, 220),
            ],
          });
          await upsertWhiteboardEdges.callPromise({
            boardId,
            edges: [{ _id: Random.id(), source: a, target: b }],
          });
          const frameCopies = async () =>
            (await WhiteboardNodes.find({ board: boardId, label }).fetchAsync())
              .filter((n) => n._id !== frame)
              .map((n) => n.position);
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            await select(frame);
            await press(pane(), { key: "d", ctrlKey: true });
            const first = await waitFor(
              async () => {
                const copies = await WhiteboardNodes.find({
                  board: boardId,
                  label,
                  _id: { $ne: frame },
                }).fetchAsync();
                assert.lengthOf(copies, 1);
                return copies[0]!;
              },
              { timeout: 10000 },
            );
            // The copy's line, inside it, isn't drawn, which mustn't keep
            // the copy from being selected
            await waitFor(
              () =>
                assert.isTrue(
                  nodeElement(first._id)?.classList.contains("selected"),
                ),
              { timeout: 10000 },
            );
            await press(pane(), { key: "d", ctrlKey: true });
            await waitFor(
              async () =>
                assert.sameDeepMembers(await frameCopies(), [
                  { x: base.x + 24, y: base.y + 24 },
                  { x: base.x + 48, y: base.y + 48 },
                ]),
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            const left = await WhiteboardNodes.find({
              board: boardId,
              $or: [{ label }, { text: `In ${label}` }],
            }).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });

        it("pastes centred on the pointer, into the frame under it but not a locked one", async function () {
          this.timeout(30000);
          const base = { x: 36000, y: 30000 };
          const outer = Random.id();
          const locked = Random.id();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: outer,
                type: "frame",
                position: base,
                width: 600,
                height: 500,
              },
              {
                _id: locked,
                type: "frame",
                parent: outer,
                position: { x: 200, y: 150 },
                width: 300,
                height: 250,
              },
            ],
          });
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [{ _id: locked, locked: true }],
          });
          const note = `Pointed ${Random.id()}`;
          const screenAt = lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            // The middle of the locked frame
            const at = { x: base.x + 350, y: base.y + 275 };
            await act(async () => {
              fireEvent.pointerMove(pane(), {
                pointerId: 1,
                ...screenAt(at.x, at.y),
              });
              await stabilize();
            });
            await clipboard("paste", note);
            await waitFor(
              async () => {
                const sticky = await WhiteboardNodes.findOneAsync({
                  board: boardId,
                  text: note,
                });
                assert.exists(sticky);
                assert.equal(sticky.parent, outer);
                assert.closeTo(base.x + sticky.position.x + 100, at.x, 1);
                assert.closeTo(base.y + sticky.position.y + 80, at.y, 1);
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: locked, locked: false }],
            });
            const left = await WhiteboardNodes.find({
              board: boardId,
              text: note,
            }).fetchAsync();
            await removeNodes([locked, outer, ...left.map((n) => n._id)]);
          }
        });

        it("leaves a copy or paste in the search field to the field", async function () {
          this.timeout(30000);
          const base = { x: 38000, y: 30000 };
          const note = `Typed ${Random.id()}`;
          const selected = `Selected ${Random.id()}`;
          const id = await stickyAt(base, selected);
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            await select(id);
            const search = screen.getByRole("combobox", {
              name: "Search the board",
            });
            await act(async () => {
              search.focus();
              await stabilize();
            });
            const pasted = await clipboard("paste", note, search);
            assert.isFalse(pasted.event.defaultPrevented);
            const copied = await clipboard("copy", undefined, search);
            assert.isFalse(copied.event.defaultPrevented);
            assert.notExists(
              await WhiteboardNodes.findOneAsync({
                board: boardId,
                text: note,
              }),
            );
          } finally {
            forgetView();
            await removeNodes([id]);
          }
        });

        it("takes a refused paste off the board again and says so", async function () {
          this.timeout(30000);
          const base = { x: 37000, y: 30000 };
          const texts = [`R ${Random.id()}`, `S ${Random.id()}`];
          const a = await stickyAt(base, texts[0]!);
          const b = await stickyAt({ x: base.x + 300, y: base.y }, texts[1]!);
          await upsertWhiteboardEdges.callPromise({
            boardId,
            edges: [{ _id: Random.id(), source: a, target: b }],
          });
          const copies = () =>
            withText(texts)
              .fetchAsync()
              .then((found) => found.filter((n) => n._id !== a && n._id !== b));
          lookAt(base);
          let refuse: sinon.SinonStub | undefined;
          try {
            await openBoard();
            await pressBoard();
            await select(a);
            await act(async () => {
              fireEvent.keyDown(document, {
                key: "Control",
                code: "ControlLeft",
              });
              await stabilize();
            });
            await select(b);
            await act(async () => {
              fireEvent.keyUp(document, {
                key: "Control",
                code: "ControlLeft",
              });
              await stabilize();
            });
            const copied = await clipboard("copy");
            assert.lengthOf(
              JSON.parse(copied.text.slice(copied.text.indexOf("\n"))).edges,
              1,
            );

            refuse = refuseCalls(upsertWhiteboardEdges);
            await clipboard("paste", copied.text);
            await screen.findByText("Couldn't save: Refused for the test");
            assert.isTrue(refuse.calledOnce);
            await waitFor(async () => assert.isEmpty(await copies()), {
              timeout: 10000,
            });
            assert.isTrue(undoButton().disabled);
            assert.exists(await savedNode(a));
            assert.exists(await savedNode(b));
          } finally {
            refuse?.restore();
            forgetView();
            const left = await withText(texts).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });
      });

      describe("images", function () {
        const UPLOAD_URL = "https://upload.example.com/";
        let backing: string;

        before(async function () {
          backing = (await ensureBoard()).puzzle;
        });

        afterEach(async function () {
          await setImageBucket.callPromise({ on: false });
        });

        // A PNG of a solid colour, width by height pixels.
        const pngFile = async (width: number, height: number) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d")!.fillRect(0, 0, width, height);
          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), "image/png");
          });
          return new File([blob], "picture.png", { type: "image/png" });
        };

        // Stands in for createChatImageUpload and the upload to the bucket,
        // handing out an address in the test bucket for each image. With
        // hold, nothing is handed out until release is called.
        const stubUploads = ({ hold = false } = {}) => {
          const urls: string[] = [];
          const held: (() => void)[] = [];
          const upload = sinon
            .stub(createChatImageUpload, "call")
            .callsFake((...args: unknown[]) => {
              const callback = args.at(-1);
              if (typeof callback !== "function") return;
              const publicUrl = `https://s3.${TEST_BUCKET.bucketRegion}.amazonaws.com/${TEST_BUCKET.bucketName}/${huntId}/${backing}/${Random.id()}`;
              urls.push(publicUrl);
              const answer = () =>
                callback(undefined, {
                  publicUrl,
                  uploadUrl: UPLOAD_URL,
                  fields: { key: "upload" },
                });
              if (hold) {
                held.push(answer);
              } else {
                Meteor.defer(answer);
              }
            });
          const realFetch = window.fetch.bind(window);
          const fetch = sinon
            .stub(window, "fetch")
            .callsFake((input, init) =>
              input === UPLOAD_URL
                ? Promise.resolve(new Response(null))
                : realFetch(input, init),
            );
          return {
            urls,
            upload,
            release: () => held.splice(0).forEach((answer) => answer()),
            restore: () => {
              fetch.restore();
              upload.restore();
            },
          };
        };

        const imageButton = () =>
          screen.getByRole<HTMLButtonElement>("button", { name: "Image" });
        const openWithImages = async () => {
          await setImageBucket.callPromise({ on: true });
          await openBoard();
          await waitFor(() => assert.isFalse(imageButton().disabled), {
            timeout: 10000,
          });
        };
        const images = () =>
          WhiteboardNodes.find({ board: boardId, type: "image" }).fetchAsync();
        const removeImages = async () => {
          const left = await images();
          if (left.length > 0) await removeNodes(left.map((n) => n._id));
        };
        // Board point (x, y) on screen, for a view opened by lookAt(base).
        const onScreen = (
          base: { x: number; y: number },
          x: number,
          y: number,
        ) => {
          const box = pane().getBoundingClientRect();
          return {
            clientX: box.left + 150 - base.x + x,
            clientY: box.top + 150 - base.y + y,
          };
        };

        it("adds an image from the Image tool in the middle of the view, no wider than 480", async function () {
          this.timeout(30000);
          const base = { x: 50000, y: 50000 };
          const stubs = stubUploads({ hold: true });
          lookAt(base);
          try {
            await openWithImages();
            const input = document.querySelector<HTMLInputElement>(
              ".jr-image-tool-input",
            )!;
            assert.exists(input);
            const picker = sinon.stub(input, "click");
            try {
              await act(async () => {
                fireEvent.click(imageButton());
                await stabilize();
              });
              sinon.assert.calledOnce(picker);
            } finally {
              picker.restore();
            }

            const file = await pngFile(960, 480);
            await act(async () => {
              fireEvent.change(input, { target: { files: [file] } });
              await stabilize();
            });
            const box = pane().getBoundingClientRect();
            const centre = {
              x: base.x - 150 + box.width / 2,
              y: base.y - 150 + box.height / 2,
            };
            // While it uploads, a placeholder the size it will be stands
            // where it will land, and nothing is saved
            const placeholder = await waitFor(
              () => {
                const found = document.querySelector<HTMLElement>(
                  ".jr-image-uploading",
                );
                assert.exists(found);
                return found;
              },
              { timeout: 10000 },
            );
            assert.equal(placeholder.style.width, "480px");
            assert.equal(placeholder.style.height, "240px");
            const [, left, top] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/
              .exec(placeholder.style.transform)!
              .map(Number);
            assert.closeTo(left!, centre.x - 240, 1);
            assert.closeTo(top!, centre.y - 120, 1);
            sinon.assert.calledOnce(stubs.upload);
            assert.isEmpty(await images());
            stubs.release();

            const node = await waitFor(
              async () => {
                const [found, ...more] = await images();
                assert.isEmpty(more);
                assert.exists(found);
                return found;
              },
              { timeout: 10000 },
            );
            sinon.assert.calledWith(stubs.upload, {
              puzzleId: backing,
              mimeType: "image/png",
            });
            assert.deepEqual(node.image, {
              url: stubs.urls[0]!,
              width: 960,
              height: 480,
            });
            assert.equal(node.width, 480);
            assert.equal(node.height, 240);
            assert.closeTo(node.position.x + 240, centre.x, 1);
            assert.closeTo(node.position.y + 120, centre.y, 1);
            assert.isUndefined(node.parent);
            const shown = await nodeShown(node._id);
            await waitFor(() => {
              const img = shown.querySelector("img");
              assert.equal(img?.getAttribute("src"), stubs.urls[0]);
              assert.equal(img?.getAttribute("draggable"), "false");
            });
            assert.isFalse(placeholder.isConnected);
          } finally {
            stubs.restore();
            forgetView();
            await removeImages();
          }
        });

        it("pastes an image at the pointer, at its own size", async function () {
          this.timeout(30000);
          const base = { x: 51000, y: 50000 };
          const stubs = stubUploads();
          lookAt(base);
          try {
            await openWithImages();
            await pressBoard();
            const at = { x: base.x + 300, y: base.y + 200 };
            await act(async () => {
              fireEvent.pointerMove(pane(), {
                pointerId: 1,
                ...onScreen(base, at.x, at.y),
              });
              await stabilize();
            });
            const data = new DataTransfer();
            data.items.add(await pngFile(200, 100));
            const event = new ClipboardEvent("paste", {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            });
            await act(async () => {
              pane().dispatchEvent(event);
              await stabilize();
            });
            assert.isTrue(event.defaultPrevented);
            const node = await waitFor(
              async () => {
                const [found] = await images();
                assert.exists(found);
                return found;
              },
              { timeout: 10000 },
            );
            assert.deepEqual(node.image, {
              url: stubs.urls[0]!,
              width: 200,
              height: 100,
            });
            assert.equal(node.width, 200);
            assert.equal(node.height, 100);
            assert.closeTo(node.position.x + 100, at.x, 1);
            assert.closeTo(node.position.y + 50, at.y, 1);
          } finally {
            stubs.restore();
            forgetView();
            await removeImages();
          }
        });

        it("adds an image file dropped on the board where it's dropped", async function () {
          this.timeout(30000);
          const base = { x: 52000, y: 50000 };
          const stubs = stubUploads();
          lookAt(base);
          try {
            await openWithImages();
            const at = { x: base.x + 250, y: base.y + 150 };
            const data = new DataTransfer();
            data.items.add(await pngFile(120, 80));
            const init = {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
              ...onScreen(base, at.x, at.y),
            };
            const over = new DragEvent("dragover", init);
            const drop = new DragEvent("drop", init);
            await act(async () => {
              pane().dispatchEvent(over);
              pane().dispatchEvent(drop);
              await stabilize();
            });
            assert.isTrue(over.defaultPrevented);
            assert.isTrue(drop.defaultPrevented);
            const node = await waitFor(
              async () => {
                const [found] = await images();
                assert.exists(found);
                return found;
              },
              { timeout: 10000 },
            );
            assert.equal(node.image?.url, stubs.urls[0]);
            assert.equal(node.width, 120);
            assert.equal(node.height, 80);
            assert.closeTo(node.position.x + 60, at.x, 1);
            assert.closeTo(node.position.y + 40, at.y, 1);
          } finally {
            stubs.restore();
            forgetView();
            await removeImages();
          }
        });

        it("leaves an image dropped into a comment to the comment", async function () {
          this.timeout(30000);
          const stubs = stubUploads();
          try {
            await openWithImages();
            await act(async () => {
              fireEvent.click(
                screen.getByRole("button", { name: /^Comment:/ }),
              );
              await stabilize();
            });
            const at = paneAt(0.6, 0.6);
            await act(async () => {
              fireEvent.pointerDown(pane(), at);
              fireEvent.pointerUp(pane(), at);
              await stabilize();
            });
            const editor = await waitFor(() => {
              const found = document.querySelector<HTMLElement>(
                "dialog[open] [data-slate-editor]",
              );
              assert.ok(found);
              return found;
            });
            await typeInto(editor, "See");
            const text = editor
              .querySelector("[data-slate-string]")!
              .getBoundingClientRect();
            const data = new DataTransfer();
            data.items.add(await pngFile(40, 40));
            const init = {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
              clientX: text.right - 1,
              clientY: text.top + text.height / 2,
            };
            const drop = new DragEvent("drop", init);
            await act(async () => {
              editor.dispatchEvent(new DragEvent("dragover", init));
              editor.dispatchEvent(drop);
              await stabilize();
            });
            assert.isTrue(drop.defaultPrevented);
            await waitFor(
              () =>
                assert.exists(
                  editor.querySelector(`img[src="${stubs.urls[0]}"]`),
                ),
              { timeout: 10000 },
            );
            // Time for a board image to have started, were one coming
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 500);
            });
            sinon.assert.calledOnce(stubs.upload);
            assert.isNull(document.querySelector(".jr-image-uploading"));
            assert.isEmpty(await images());
          } finally {
            stubs.restore();
            await removeImages();
          }
        });

        // An image on the board as the Image tool would leave it
        const placeImage = async (position: { x: number; y: number }) => {
          const _id = Random.id();
          const image = {
            url: `https://s3.${TEST_BUCKET.bucketRegion}.amazonaws.com/${TEST_BUCKET.bucketName}/${huntId}/${backing}/${Random.id()}`,
            width: 600,
            height: 300,
          };
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id,
                type: "image",
                position,
                width: 300,
                height: 150,
                image,
              },
            ],
          });
          return { _id, image };
        };

        it("puts a deleted image back on undo, with the same upload", async function () {
          this.timeout(30000);
          const base = { x: 52500, y: 50000 };
          await setImageBucket.callPromise({ on: true });
          const { _id: id, image } = await placeImage(base);
          lookAt(base);
          try {
            await openWithImages();
            await select(id);
            await press(document.body, { key: "Delete" });
            await waitFor(async () => assert.isUndefined(await savedNode(id)), {
              timeout: 10000,
            });
            await pressBoard();
            await press(pane(), { key: "z", ctrlKey: true });
            await waitFor(
              async () => {
                const node = await savedNode(id);
                assert.equal(node?.type, "image");
                assert.deepEqual(node?.image, image);
                assert.equal(node?.width, 300);
                assert.equal(node?.height, 150);
                assert.deepEqual(node?.position, base);
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeImages();
          }
        });

        it("keeps an image's shape as it's resized", async function () {
          this.timeout(30000);
          const base = { x: 53000, y: 50000 };
          await setImageBucket.callPromise({ on: true });
          const { _id: id } = await placeImage(base);
          lookAt(base);
          try {
            await openWithImages();
            await select(id);
            const corner = await waitFor(() => {
              const found = nodeElement(id)?.querySelector(
                ".react-flow__resize-control.handle.bottom.right",
              );
              assert.exists(found);
              return found;
            });
            const box = corner.getBoundingClientRect();
            const start = {
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
            };
            const end = {
              clientX: start.clientX + 100,
              clientY: start.clientY,
            };
            const mouse = { button: 0, view: window };
            await act(async () => {
              fireEvent.mouseDown(corner, { ...mouse, ...start });
              await stabilize();
            });
            await act(async () => {
              fireEvent.mouseMove(window, { ...mouse, ...end });
              await stabilize();
            });
            await act(async () => {
              fireEvent.mouseUp(window, { ...mouse, ...end });
              await stabilize();
            });
            await waitFor(
              async () => {
                const resized = await savedNode(id);
                assert.closeTo(resized?.width ?? 0, 400, 1);
                assert.closeTo(resized?.height ?? 0, 200, 1);
                assert.deepEqual(resized?.position, base);
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeImages();
          }
        });

        it("fans out duplicates of an image on Ctrl+D, selecting each new one", async function () {
          this.timeout(30000);
          const base = { x: 54000, y: 50000 };
          await setImageBucket.callPromise({ on: true });
          const { _id: id, image } = await placeImage(base);
          lookAt(base);
          try {
            await openWithImages();
            await pressBoard();
            await select(id);
            await press(pane(), { key: "d", ctrlKey: true });
            const first = await waitFor(
              async () => {
                const copies = (await images()).filter((n) => n._id !== id);
                assert.lengthOf(copies, 1);
                return copies[0]!;
              },
              { timeout: 10000 },
            );
            await waitFor(() =>
              assert.isTrue(
                nodeElement(first._id)?.classList.contains("selected"),
              ),
            );
            await press(pane(), { key: "d", ctrlKey: true });
            await waitFor(
              async () => {
                const copies = (await images()).filter((n) => n._id !== id);
                assert.lengthOf(copies, 2);
                assert.sameDeepMembers(
                  copies.map((n) => n.position),
                  [
                    { x: base.x + 24, y: base.y + 24 },
                    { x: base.x + 48, y: base.y + 48 },
                  ],
                );
                copies.forEach((n) => {
                  assert.deepEqual(n.image, image);
                  assert.equal(n.width, 300);
                  assert.equal(n.height, 150);
                });
              },
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeImages();
          }
        });

        it("says why an upload failed, and leaves nothing on the board", async function () {
          this.timeout(30000);
          const upload = refuseCalls(createChatImageUpload);
          try {
            await openWithImages();
            const input = document.querySelector<HTMLInputElement>(
              ".jr-image-tool-input",
            )!;
            await act(async () => {
              fireEvent.change(input, {
                target: { files: [await pngFile(40, 40)] },
              });
              await stabilize();
            });
            await screen.findByText(
              "Couldn't save: Refused for the test",
              {},
              { timeout: 10000 },
            );
            sinon.assert.calledOnce(upload);
            assert.isNull(document.querySelector(".jr-image-uploading"));
            assert.isEmpty(await images());
          } finally {
            upload.restore();
          }
        });

        it("turns the Image tool, pasting and dropping off when there's nowhere to store images", async function () {
          this.timeout(30000);
          const upload = sinon.spy(createChatImageUpload, "call");
          const off =
            "Images can't be added here: this server has nowhere to store them.";
          try {
            await openBoard();
            const button = imageButton();
            assert.isTrue(button.disabled);
            assert.equal(button.closest("span")?.title, off);
            await pressBoard();
            const data = new DataTransfer();
            data.items.add(await pngFile(40, 40));
            const drop = new DragEvent("drop", {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
              ...paneAt(0.5, 0.5),
            });
            await act(async () => {
              pane().dispatchEvent(drop);
              await stabilize();
            });
            assert.isTrue(drop.defaultPrevented);
            await screen.findByText(off);
            sinon.assert.notCalled(upload);
            await act(async () => {
              pane().dispatchEvent(
                new ClipboardEvent("paste", {
                  clipboardData: data,
                  bubbles: true,
                  cancelable: true,
                }),
              );
              await stabilize();
            });
            await screen.findByText(off);
            sinon.assert.notCalled(upload);
            assert.isEmpty(await images());
          } finally {
            upload.restore();
          }
        });
      });

      it("switches between the board and chat on a narrow screen", async function () {
        this.timeout(30000);
        const phone = simulatePhone();
        try {
          render(<TestApp />);
          await goTo(boardPath);
          const boardButton = await screen.findByRole(
            "button",
            { name: "Board" },
            { timeout: 20000 },
          );
          const chatButton = screen.getByRole("button", { name: "Chat" });
          await waitFor(
            () => assert.isNotNull(document.querySelector(".react-flow")),
            { timeout: 20000 },
          );
          await act(async () => {
            fireEvent.click(chatButton);
            await stabilize();
          });
          await waitFor(() => {
            assert.isNull(document.querySelector(".react-flow"));
            assert.isNotNull(document.querySelector("[data-slate-editor]"));
          });
          await act(async () => {
            fireEvent.click(boardButton);
            await stabilize();
          });
          await waitFor(() =>
            assert.isNotNull(document.querySelector(".react-flow")),
          );
          // Narrow screens can comment but not edit
          await screen.findByText(
            "Editing needs a wider screen. You can still comment.",
          );
        } finally {
          phone.restore();
        }
      });

      describe("on a phone", function () {
        let phone: ReturnType<typeof simulatePhone>;
        beforeEach(function () {
          phone = simulatePhone();
        });
        afterEach(function () {
          phone.restore();
        });

        // Threads made by each test, deleted afterwards.
        const threads: string[] = [];
        afterEach(async function () {
          for (const messageId of threads.splice(0)) {
            await deleteWhiteboardComment.callPromise({ messageId });
          }
        });

        const openPhoneBoard = async () => {
          render(<TestApp />);
          await goTo(boardPath);
          await screen.findByText(
            "Editing needs a wider screen. You can still comment.",
            {},
            { timeout: 20000 },
          );
          await waitFor(
            () =>
              assert.isNotNull(
                document.querySelector(".react-flow__node-puzzle"),
              ),
            { timeout: 20000 },
          );
          // Lets the canvas's effects run
          await act(async () => {
            await stabilize();
          });
        };
        const armComment = async () => {
          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Comment:/ }));
            await stabilize();
          });
          screen.getByText("Tap where your comment goes");
        };
        const touch = (at: { x: number; y: number }, pointerId: number) => ({
          button: 0,
          pointerId,
          pointerType: "touch",
          isPrimary: pointerId === 1,
          clientX: at.x,
          clientY: at.y,
        });
        const sheet = () =>
          document.querySelector<HTMLElement>(
            ".react-flow__panel.jr-comment-sheet",
          );
        const draftPin = () =>
          document.querySelector('.jr-comment-pin[data-thread="draft"]');
        const middleOf = (element: Element) => {
          const box = element.getBoundingClientRect();
          return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        };
        // A comment of this test's own, found once it reaches this client,
        // which needs the board open.
        const leaveComment = async (
          text: string,
          comment: { node?: string; x: number; y: number },
        ) => {
          await sendChatMessage.callPromise({
            puzzleId: boardPuzzle,
            content: JSON.stringify({
              type: "message",
              children: [{ text }],
            }),
            comment,
          });
          const id = await waitFor(
            async () => {
              const found = await ChatMessages.findOneAsync({
                "comment.x": comment.x,
                "comment.y": comment.y,
              });
              assert.ok(found);
              return found._id;
            },
            { timeout: 10000 },
          );
          threads.push(id);
          return id;
        };
        let boardPuzzle: string;
        before(async function () {
          this.timeout(10000);
          boardPuzzle = (await ensureBoard()).puzzle;
        });

        it("places a comment on a card from a phone with a tap", async function () {
          this.timeout(30000);
          const { a } = await sideBySideCards(boardId);
          await openPhoneBoard();
          const card = await waitFor(() => {
            const found = nodeElement(a._id);
            assert.exists(found);
            return found;
          });
          await armComment();
          // The board still pans under a finger while the tool is out
          assert.isTrue(pane().classList.contains("draggable"));
          // A tap on the card's link, which the browser follows with a
          // mousedown and a click
          const link = within(card as HTMLElement).getByRole("link", {
            name: "Open puzzle",
          });
          const at = middleOf(link);
          const mouse = {
            view: window,
            button: 0,
            clientX: at.x,
            clientY: at.y,
          };
          await act(async () => {
            fireEvent.pointerDown(link, touch(at, 1));
            fireEvent.pointerUp(link, touch(at, 1));
            fireEvent.mouseDown(link, mouse);
            fireEvent.mouseUp(link, mouse);
            fireEvent.click(link, mouse);
            await stabilize();
          });
          // which places the comment without opening the puzzle
          assert.equal(location.current?.pathname, boardPath);
          const panel = await waitFor(() => {
            const found = sheet()?.querySelector<HTMLElement>("dialog[open]");
            assert.exists(found);
            assert.include(found.textContent ?? "", "New comment on");
            return found;
          });
          assert.isNull(screen.queryByText("Tap where your comment goes"));
          // The sheet runs the width of the board, along its bottom
          const board = document
            .querySelector(".react-flow")!
            .getBoundingClientRect();
          const box = sheet()!.getBoundingClientRect();
          assert.closeTo(box.width, board.width, 1);
          assert.closeTo(box.bottom, board.bottom, 1);
          assert.isAtMost(box.height, board.height * 0.6 + 1);
          // A new comment's composer takes focus
          const editor = await waitFor(() => {
            const found = panel.querySelector<HTMLElement>(
              "[data-slate-editor]",
            );
            assert.exists(found);
            assert.isTrue(found.contains(document.activeElement));
            return found;
          });
          await typeInto(editor, "Tapped on from a phone");
          await act(async () => {
            fireEvent.click(
              within(panel).getByRole("button", { name: "Send" }),
            );
            await stabilize();
          });
          const sent = await waitFor(
            async () => {
              const found = await ChatMessages.findOneAsync({
                "comment.node": a._id,
                sender: Meteor.userId()!,
              });
              assert.exists(found);
              return found;
            },
            { timeout: 10000 },
          );
          threads.push(sent._id);
        });

        it("doesn't place one when the press turns into a pan", async function () {
          // A real finger pans the board through React Flow's touch events,
          // which a PointerEvent doesn't make, so whether the board pans is
          // a check on a device. This checks the press drafts nothing.
          this.timeout(30000);
          await openPhoneBoard();
          await armComment();
          const at = middleOf(pane());
          const moved = { x: at.x + 30, y: at.y + 20 };
          await act(async () => {
            fireEvent.pointerDown(pane(), touch(at, 1));
            fireEvent.pointerMove(pane(), touch(moved, 1));
            fireEvent.pointerUp(pane(), touch(moved, 1));
            await stabilize();
          });
          assert.isNull(sheet());
          assert.isNull(draftPin());
          // nor does a pinch, whichever finger lifts first
          const other = { x: at.x + 80, y: at.y };
          await act(async () => {
            fireEvent.pointerDown(pane(), touch(at, 1));
            fireEvent.pointerDown(pane(), touch(other, 2));
            fireEvent.pointerUp(pane(), touch(at, 1));
            fireEvent.pointerUp(pane(), touch(other, 2));
            await stabilize();
          });
          assert.isNull(sheet());
          assert.isNull(draftPin());
          // and the tool is still out for the next tap
          screen.getByText("Tap where your comment goes");
        });

        it("counts a touch that wobbles a few pixels as a tap", async function () {
          this.timeout(30000);
          await openPhoneBoard();
          await armComment();
          const at = middleOf(pane());
          // Further than a mouse may move for a click, but not a pan
          const wobbled = { x: at.x + 6, y: at.y + 5 };
          await act(async () => {
            fireEvent.pointerDown(pane(), touch(at, 1));
            fireEvent.pointerMove(pane(), touch(wobbled, 1));
            fireEvent.pointerUp(pane(), touch(wobbled, 1));
            await stabilize();
          });
          await waitFor(() => {
            assert.exists(draftPin());
            assert.include(
              sheet()?.querySelector("dialog[open]")?.textContent ?? "",
              "New comment",
            );
          });
        });

        it("pans a new comment placed low on the board up above the sheet", async function () {
          this.timeout(30000);
          await openPhoneBoard();
          await armComment();
          const box = pane().getBoundingClientRect();
          const at = {
            x: box.left + box.width / 2,
            y: box.top + box.height * 0.8,
          };
          await act(async () => {
            fireEvent.pointerDown(pane(), touch(at, 1));
            fireEvent.pointerUp(pane(), touch(at, 1));
            await stabilize();
          });
          const panel = await waitFor(() => {
            const found = sheet()?.querySelector<HTMLElement>("dialog[open]");
            assert.exists(found);
            return found;
          });
          await waitFor(
            () => {
              const pin = draftPin()!.getBoundingClientRect();
              assert.isBelow(pin.bottom, panel.getBoundingClientRect().top);
              assert.closeTo(pin.bottom, box.top + box.height * 0.2, 4);
            },
            { timeout: 5000 },
          );
        });

        it("doesn't leave a draft after a cancelled touch", async function () {
          this.timeout(30000);
          await openPhoneBoard();
          await armComment();
          const at = middleOf(pane());
          await act(async () => {
            fireEvent.pointerDown(pane(), touch(at, 1));
            fireEvent.pointerCancel(pane(), touch(at, 1));
            await stabilize();
          });
          assert.isNull(sheet());
          assert.isNull(draftPin());
          // Cancel puts the tool away
          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
            await stabilize();
          });
          assert.isNull(screen.queryByText("Tap where your comment goes"));
          assert.equal(
            screen
              .getByRole("button", { name: /^Comment:/ })
              .getAttribute("aria-pressed"),
            "false",
          );
        });

        it("replies to, reacts to and resolves a comment from a phone", async function () {
          this.timeout(30000);
          await openPhoneBoard();
          const id = await leaveComment("Reply from your phone", {
            x: 5100,
            y: 5100,
          });
          await goTo(`${boardPath}?comment=${id}`);
          const panel = await waitFor(
            () => {
              const found = sheet()?.querySelector<HTMLElement>("dialog[open]");
              assert.exists(found);
              assert.include(found.textContent ?? "", "Reply from your phone");
              return found;
            },
            { timeout: 20000 },
          );
          // An existing thread leaves the keyboard down
          const editor = panel.querySelector<HTMLElement>(
            "[data-slate-editor]",
          )!;
          await waitFor(() => assert.equal(document.activeElement, panel));
          assert.isFalse(editor.contains(document.activeElement));

          await typeInto(editor, "Replied from a phone");
          await act(async () => {
            fireEvent.click(
              within(panel).getByRole("button", { name: "Send" }),
            );
            await stabilize();
          });
          await waitFor(
            async () => {
              assert.exists(
                await ChatMessages.findOneAsync({
                  parentId: id,
                  "content.children.text": "Replied from a phone",
                }),
              );
            },
            { timeout: 10000 },
          );

          await act(async () => {
            fireEvent.click(
              within(panel).getAllByRole("button", { name: "React" })[0]!,
            );
            await stabilize();
          });
          const tick = await waitFor(
            () => {
              const found = document.querySelector('[data-unified="2705"]');
              assert.exists(found);
              return found;
            },
            { timeout: 10000 },
          );
          await act(async () => {
            fireEvent.click(tick);
            await stabilize();
          });
          await waitFor(
            async () => {
              assert.exists(
                await ChatMessages.findOneAsync({
                  parentId: id,
                  "content.children.text": "✅",
                }),
              );
            },
            { timeout: 10000 },
          );

          await act(async () => {
            fireEvent.click(
              within(panel).getByRole("button", { name: "Resolve" }),
            );
            await stabilize();
          });
          await waitFor(
            async () => {
              const root = await ChatMessages.findOneAsync(id);
              assert.exists(root?.comment?.resolvedAt);
            },
            { timeout: 10000 },
          );
          const reopen = await within(panel).findByRole("button", {
            name: "Reopen",
          });
          await act(async () => {
            fireEvent.click(reopen);
            await stabilize();
          });
          await waitFor(
            async () => {
              const root = await ChatMessages.findOneAsync(id);
              assert.notExists(root?.comment?.resolvedAt);
            },
            { timeout: 10000 },
          );
        });

        it("doesn't let anything be moved on a phone", async function () {
          this.timeout(30000);
          // The board opens fitted to everything, so there's a card to try
          localStorage.removeItem(`whiteboard:viewport:${boardId}`);
          const save = sinon.spy(upsertWhiteboardNodes, "call");
          const remove = sinon.spy(deleteWhiteboardNodes, "call");
          try {
            await openPhoneBoard();
            assert.isNull(screen.queryByRole("button", { name: /^Select/ }));
            assert.isNull(screen.queryByLabelText("Who can edit"));
            const card = document.querySelector<HTMLElement>(
              ".react-flow__node-puzzle",
            )!;
            assert.isFalse(card.classList.contains("draggable"));
            assert.isFalse(card.classList.contains("selectable"));
            // Where the card is on the board; a drag may still pan the board
            const before = card.style.transform;
            const from = middleOf(card);
            const to = { x: from.x + 120, y: from.y + 60 };
            await act(async () => {
              fireEvent.mouseDown(card, {
                view: window,
                button: 0,
                clientX: from.x,
                clientY: from.y,
              });
              fireEvent.mouseMove(document, {
                view: window,
                clientX: to.x,
                clientY: to.y,
              });
              fireEvent.mouseUp(document, {
                view: window,
                clientX: to.x,
                clientY: to.y,
              });
              await stabilize();
            });
            await press(card, { key: "ArrowRight" });
            await press(card, { key: "Delete" });
            assert.equal(
              document.querySelector<HTMLElement>(
                `.react-flow__node[data-id="${card.dataset.id}"]`,
              )?.style.transform,
              before,
            );
            assert.isTrue(save.notCalled);
            assert.isTrue(remove.notCalled);
          } finally {
            remove.restore();
            save.restore();
          }
        });

        it("shows a comment from chat on a phone, above the sheet", async function () {
          this.timeout(30000);
          await openPhoneBoard();
          const id = await leaveComment("Shown from chat on a phone", {
            x: 5200,
            y: 5200,
          });
          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Chat" }));
            await stabilize();
          });
          const text = await screen.findByText(
            "Shown from chat on a phone",
            {},
            { timeout: 20000 },
          );
          let message: HTMLElement | null = text;
          let show: HTMLElement | undefined;
          while (message && !show) {
            show = within(message)
              .queryAllByText("Show on board", { selector: "button" })
              .at(0);
            message = message.parentElement;
          }
          assert.exists(show);
          await act(async () => {
            fireEvent.click(show);
            await stabilize();
          });
          const panel = await waitFor(
            () => {
              const found = sheet()?.querySelector<HTMLElement>("dialog[open]");
              assert.exists(found);
              assert.include(
                found.textContent ?? "",
                "Shown from chat on a phone",
              );
              return found;
            },
            { timeout: 20000 },
          );
          await waitFor(
            () => {
              const pin = document.querySelector(
                `.jr-comment-pin[data-thread="${id}"]`,
              );
              assert.exists(pin);
              const top = panel.getBoundingClientRect().top;
              const board = document
                .querySelector(".react-flow")!
                .getBoundingClientRect();
              const box = pin.getBoundingClientRect();
              assert.isAbove(box.top, board.top);
              assert.isBelow(box.bottom, top);
              // The board centres a little below the pin, which ends up a
              // fifth of the way down, clear of a sheet up to 60% tall
              assert.closeTo(box.bottom, board.top + board.height * 0.2, 4);
            },
            { timeout: 5000 },
          );
        });

        it("pans a pin tapped low on the board up above the sheet", async function () {
          this.timeout(30000);
          await openPhoneBoard();
          // The board point 80% of the way down the pane
          const pane = document
            .querySelector(".react-flow__pane")!
            .getBoundingClientRect();
          const { a, e, f } = new DOMMatrix(
            getComputedStyle(
              document.querySelector<HTMLElement>(".react-flow__viewport")!,
            ).transform,
          );
          const id = await leaveComment("Tapped low on a phone", {
            x: Math.round((pane.width / 2 - e) / a),
            y: Math.round((pane.height * 0.8 - f) / a),
          });
          const pin = await waitFor(
            () => {
              const found = document.querySelector<HTMLElement>(
                `.jr-comment-pin[data-thread="${id}"]`,
              );
              assert.exists(found);
              return found;
            },
            { timeout: 10000 },
          );
          assert.closeTo(
            pin.getBoundingClientRect().bottom,
            pane.top + pane.height * 0.8,
            4,
          );
          await act(async () => {
            fireEvent.click(pin);
            await stabilize();
          });
          const panel = await waitFor(() => {
            const found = sheet()?.querySelector<HTMLElement>("dialog[open]");
            assert.exists(found);
            assert.include(found.textContent ?? "", "Tapped low on a phone");
            return found;
          });
          await waitFor(
            () => {
              const box = pin.getBoundingClientRect();
              assert.isBelow(box.bottom, panel.getBoundingClientRect().top);
              assert.closeTo(box.bottom, pane.top + pane.height * 0.2, 4);
            },
            { timeout: 5000 },
          );
        });

        it("keeps what's written when the screen stops being compact", async function () {
          this.timeout(30000);
          await openPhoneBoard();
          await armComment();
          const at = middleOf(pane());
          await act(async () => {
            fireEvent.pointerDown(pane(), touch(at, 1));
            fireEvent.pointerUp(pane(), touch(at, 1));
            await stabilize();
          });
          const editor = await waitFor(() => {
            const found = sheet()?.querySelector<HTMLElement>(
              "dialog[open] [data-slate-editor]",
            );
            assert.exists(found);
            return found;
          });
          await typeInto(editor, "Half a thought");
          // Say, a landscape tablet whose keyboard went away
          await act(async () => {
            phone.setPhone(false);
            await stabilize();
          });
          await waitFor(() => {
            assert.isNull(sheet());
            assert.isNotNull(
              document.querySelector(
                ".react-flow__panel.top.right dialog[open]",
              ),
            );
          });
          assert.isTrue(editor.isConnected);
          assert.include(editor.textContent ?? "", "Half a thought");
        });
      });

      describe("with someone else on the board", function () {
        const OTHER_EMAIL = "second-member@example.com";
        const OTHER_PASSWORD = "password";
        const OTHER_NAME = "Second Member";
        let other: ReturnType<typeof DDP.connect>;
        // Presence as their connection sees it, this page's included
        let theirPresence: Mongo.Collection<{
          _id: string;
          board: string;
          user: string;
          selection?: string[] | null;
          editing?: string | null;
        }>;
        let puzzleId: string;

        before(async function () {
          this.timeout(20000);
          puzzleId = (await ensureBoard()).puzzle;
          await createTestUser.callPromise({
            email: OTHER_EMAIL,
            password: OTHER_PASSWORD,
            displayName: OTHER_NAME,
          });
          await addHuntUser.callPromise({ huntId, email: OTHER_EMAIL });
          // Their own connection, as a second browser would have
          other = DDP.connect(Meteor.absoluteUrl());
          theirPresence = new Mongo.Collection("jr_whiteboard_presence", {
            connection: other,
          });
          await other.callAsync("login", {
            user: { email: OTHER_EMAIL },
            password: (
              Accounts as unknown as {
                _hashPassword: (password: string) => unknown;
              }
            )._hashPassword(OTHER_PASSWORD),
          });
        });

        after(function () {
          other.disconnect();
        });

        // Their threads from each test, which they delete afterwards so later
        // tests (and later runs) start with nothing unread from them.
        const theirThreads: string[] = [];
        afterEach(async function () {
          for (const messageId of theirThreads.splice(0)) {
            await other.callAsync(deleteWhiteboardComment.name, { messageId });
          }
        });

        // A comment from them, found once it reaches this client.
        const theyComment = async (text: string, x: number) => {
          await other.callAsync(sendChatMessage.name, {
            puzzleId,
            content: JSON.stringify({
              type: "message",
              children: [{ text }],
            }),
            comment: { x, y: x },
          });
          const thread = await waitFor(
            async () => {
              const found = await ChatMessages.findOneAsync({
                "comment.x": x,
              });
              assert.ok(found);
              return found._id;
            },
            { timeout: 10000 },
          );
          theirThreads.push(thread);
          return thread;
        };
        const commentTool = () =>
          screen.getByRole("button", { name: /^Comment:/ });
        const unread = () =>
          Number(
            commentTool().querySelector(".jr-unread-comments")?.textContent ??
              0,
          );
        const pinFor = (thread: string) =>
          document.querySelector<HTMLElement>(
            `.jr-comment-pin[data-thread="${thread}"]`,
          );

        it("counts their new comment as unread until it's opened", async function () {
          this.timeout(30000);
          await openBoard();
          await act(async () => {
            await stabilize();
          });
          const before = unread();
          const thread = await theyComment("Unread for now", 27000);
          await waitFor(() => assert.equal(unread(), before + 1), {
            timeout: 10000,
          });
          await act(async () => {
            fireEvent.click(pinFor(thread)!);
            await stabilize();
          });
          await waitFor(() => {
            assert.include(panelText(), "Unread for now");
            assert.equal(unread(), before);
          });
        });

        it("lists comments newest first and shows the one picked", async function () {
          this.timeout(30000);
          await openBoard();
          const older = await theyComment("Older thread", 27100);
          const newer = await theyComment("Newer thread", 27200);
          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Comments" }));
            await stabilize();
          });
          const rows = () =>
            [
              ...document.querySelectorAll<HTMLElement>(
                ".react-flow__panel.top.right button[data-thread]",
              ),
            ].map((row) => row.dataset.thread);
          await waitFor(() =>
            assert.deepEqual(rows().slice(0, 2), [newer, older]),
          );
          const row = document.querySelector<HTMLElement>(
            `.react-flow__panel.top.right button[data-thread="${older}"]`,
          )!;
          assert.include(row.textContent ?? "", "Older thread");
          assert.include(row.textContent ?? "", "0 replies");
          await act(async () => {
            fireEvent.click(row);
            await stabilize();
          });
          const listButton = screen.getByRole("button", { name: "Comments" });
          await waitFor(() => {
            assert.include(panelText(), "Older thread");
            assert.equal(pinFor(older)?.getAttribute("aria-expanded"), "true");
            // The thread has the list's place, so the button isn't pressed
            assert.equal(listButton.getAttribute("aria-pressed"), "false");
          });
          // and takes the viewer back to the list rather than closing both
          await act(async () => {
            fireEvent.click(listButton);
            await stabilize();
          });
          await waitFor(() => {
            assert.equal(pinFor(older)?.getAttribute("aria-expanded"), "false");
            assert.deepEqual(rows().slice(0, 2), [newer, older]);
            assert.equal(listButton.getAttribute("aria-pressed"), "true");
          });
        });

        it("closes the Comments list on Escape", async function () {
          this.timeout(30000);
          await openBoard();
          await theyComment("Listed, then put away", 27250);
          const listButton = screen.getByRole("button", { name: "Comments" });
          await act(async () => {
            fireEvent.click(listButton);
            await stabilize();
          });
          await waitFor(() =>
            assert.include(panelText(), "Listed, then put away"),
          );
          await press(listButton, { key: "Escape" });
          assert.equal(listButton.getAttribute("aria-pressed"), "false");
          assert.isNull(document.querySelector(".react-flow__panel.top.right"));
        });

        it("goes to the next unread comment on N, and on from there", async function () {
          this.timeout(30000);
          await openBoard();
          const older = await theyComment("Jump here second", 27300);
          const newer = await theyComment("Jump here first", 27400);
          await pressBoard();
          await press(pane(), { key: "n" });
          await waitFor(() => {
            assert.include(panelText(), "Jump here first");
            assert.equal(pinFor(newer)?.getAttribute("aria-expanded"), "true");
          });
          // Focus stays out of the reply box, so the next N isn't typed there
          const focused = await waitFor(() => {
            const active = document.activeElement;
            assert.instanceOf(active, HTMLDialogElement);
            return active;
          });
          await press(focused, { key: "n" });
          await waitFor(() => {
            assert.include(panelText(), "Jump here second");
            assert.equal(pinFor(older)?.getAttribute("aria-expanded"), "true");
          });
        });

        it("lists comments and goes to them on N on a board that can only be viewed", async function () {
          this.timeout(30000);
          const thread = await theyComment("Seen by a viewer", 27500);
          await setHuntArchived.callPromise({ huntId, isArchived: true });
          try {
            render(<TestApp />);
            await goTo(boardPath);
            await screen.findByText("Viewing only", {}, { timeout: 20000 });
            await act(async () => {
              await stabilize();
            });
            assert.isNull(screen.queryByRole("button", { name: /^Comment:/ }));
            const list = await waitFor(
              () => {
                const button = screen.getByRole("button", {
                  name: /^Comments \(1 unread\)$/,
                });
                assert.equal(
                  button.querySelector(".jr-unread-comments")?.textContent,
                  "1",
                );
                return button;
              },
              { timeout: 10000 },
            );
            await act(async () => {
              fireEvent.click(list);
              await stabilize();
            });
            const row = await waitFor(() => {
              const found = document.querySelector<HTMLElement>(
                `.react-flow__panel.top.right button[data-thread="${thread}"]`,
              );
              assert.ok(found);
              return found;
            });
            assert.include(row.textContent ?? "", "Seen by a viewer");
            await act(async () => {
              fireEvent.click(list);
              await stabilize();
            });
            assert.isNull(
              document.querySelector(
                `.react-flow__panel.top.right button[data-thread="${thread}"]`,
              ),
            );
            await pressBoard();
            await press(pane(), { key: "n" });
            await waitFor(() => {
              assert.include(panelText(), "Seen by a viewer");
              assert.equal(
                pinFor(thread)?.getAttribute("aria-expanded"),
                "true",
              );
            });
          } finally {
            await setHuntArchived.callPromise({ huntId, isArchived: false });
          }
        });

        it("shows their cursor and what they drag", async function () {
          this.timeout(30000);
          const sticky = Random.id();
          const base = { x: 28000, y: 28000 };
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: sticky,
                type: "sticky",
                position: base,
                width: 200,
                height: 160,
              },
            ],
          });
          lookAt(base);
          try {
            await openBoard();
            const node = await nodeShown(sticky);
            await other.callAsync(setWhiteboardLive.name, {
              boardId,
              cursor: { x: base.x + 50, y: base.y + 60 },
              drag: [
                { node: sticky, x: base.x + 300, y: base.y, parent: null },
              ],
              stroke: null,
            });
            await waitFor(
              () => {
                const cursor = [
                  ...document.querySelectorAll<HTMLElement>(
                    ".react-flow__viewport-portal div",
                  ),
                ].find((el) =>
                  el.style.transform.startsWith(
                    `translate(${base.x + 50}px, ${base.y + 60}px)`,
                  ),
                );
                assert.exists(cursor);
                assert.include(cursor?.textContent ?? "", OTHER_NAME);
                assert.include(
                  node.style.transform,
                  `translate(${base.x + 300}px`,
                );
              },
              { timeout: 1500 },
            );
          } finally {
            await other.callAsync(setWhiteboardLive.name, {
              boardId,
              cursor: null,
              drag: null,
              stroke: null,
            });
            forgetView();
            await removeNodes([sticky]);
          }
        });

        // Their live state, with nothing in it but what's given
        const theirLive = (fields: Record<string, unknown> = {}) =>
          other.callAsync(setWhiteboardLive.name, {
            boardId,
            cursor: null,
            drag: null,
            stroke: null,
            selection: null,
            editing: null,
            ...fields,
          });
        const remoteOutline = (id: string) =>
          document.querySelector<HTMLElement>(
            `.jr-remote-selection[data-node="${id}"]`,
          );
        const remoteTag = (id: string) =>
          document.querySelector<HTMLElement>(
            `[data-node="${id}"] .jr-remote-tag`,
          );

        it("outlines what they select, with their name, until they let it go", async function () {
          this.timeout(30000);
          const sticky = Random.id();
          const base = { x: 28500, y: 28000 };
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: sticky,
                type: "sticky",
                position: base,
                width: 200,
                height: 160,
              },
            ],
          });
          lookAt(base);
          try {
            await openBoard();
            await nodeShown(sticky);
            const cursorAt = { x: base.x + 50, y: base.y + 60 };
            await theirLive({ cursor: cursorAt, selection: [sticky] });
            const pill = await waitFor(
              () => {
                assert.exists(remoteOutline(sticky));
                const tag = remoteTag(sticky)?.textContent ?? "";
                assert.include(tag, OTHER_NAME);
                assert.notInclude(tag, "is editing");
                const cursor = [
                  ...document.querySelectorAll<HTMLElement>(
                    ".react-flow__viewport-portal div",
                  ),
                ].find((el) =>
                  el.style.transform.startsWith(
                    `translate(${cursorAt.x}px, ${cursorAt.y}px)`,
                  ),
                );
                const namePill = cursor?.lastElementChild;
                assert.exists(namePill);
                return namePill;
              },
              { timeout: 5000 },
            );
            // In the colour their cursor has
            assert.include(
              remoteOutline(sticky)!.style.boxShadow,
              getComputedStyle(pill).backgroundColor,
            );

            await theirLive({ cursor: cursorAt });
            await waitFor(
              () => {
                assert.notExists(remoteOutline(sticky));
                assert.notExists(remoteTag(sticky));
              },
              { timeout: 5000 },
            );
          } finally {
            await theirLive();
            forgetView();
            await removeNodes([sticky]);
          }
        });

        it("won't open a note they're typing in until they stop", async function () {
          this.timeout(30000);
          const sticky = Random.id();
          const base = { x: 28500, y: 28500 };
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: sticky,
                type: "sticky",
                position: base,
                width: 200,
                height: 160,
                text: "Theirs",
              },
            ],
          });
          lookAt(base);
          try {
            await openBoard();
            const node = await nodeShown(sticky);
            await theirLive({ selection: [sticky], editing: sticky });
            await waitFor(
              () =>
                assert.include(
                  remoteTag(sticky)?.textContent ?? "",
                  `${OTHER_NAME} is editing`,
                ),
              { timeout: 5000 },
            );
            const shown = within(node).getByText("Theirs");
            assert.equal(getComputedStyle(shown).cursor, "default");
            await act(async () => {
              fireEvent.doubleClick(shown);
              await stabilize();
            });
            assert.isNull(within(node).queryByRole("textbox"));
            await press(node, { key: "Enter" });
            assert.isNull(within(node).queryByRole("textbox"));

            await theirLive();
            await waitFor(() => assert.notExists(remoteTag(sticky)), {
              timeout: 5000,
            });
            // The Enter pressed while it was taken was dropped, not kept
            await stabilize();
            assert.isNull(within(node).queryByRole("textbox"));
            await press(node, { key: "Enter" });
            const editor = await waitFor(() =>
              within(node).getByRole("textbox"),
            );
            await act(async () => {
              fireEvent.keyDown(editor, { key: "Escape" });
              fireEvent.blur(editor);
              await stabilize();
            });
          } finally {
            await theirLive();
            forgetView();
            await removeNodes([sticky]);
          }
        });

        it("sends what's selected and typed in, and holds them back while away", async function () {
          this.timeout(60000);
          await clearWhiteboardVersions.callPromise({ boardId });
          const sticky = Random.id();
          const end = Random.id();
          const line = Random.id();
          const base = { x: 28500, y: 29000 };
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: sticky,
                type: "sticky",
                position: base,
                width: 200,
                height: 160,
                text: "Mine",
              },
              {
                _id: end,
                type: "point",
                position: { x: base.x + 400, y: base.y + 80 },
              },
            ],
          });
          await upsertWhiteboardEdges.callPromise({
            boardId,
            edges: [{ _id: line, source: sticky, target: end }],
          });
          lookAt(base);
          const subscription = other.subscribe(whiteboardPresence.name, {
            boardId,
          });
          const sent = (expected: {
            selection?: string[] | null;
            editing?: string | null;
          }) =>
            waitFor(
              async () => {
                const mine = await theirPresence.findOneAsync({
                  board: boardId,
                  user: Meteor.userId()!,
                });
                assert.exists(mine);
                if ("selection" in expected) {
                  assert.deepEqual(mine.selection, expected.selection);
                }
                if ("editing" in expected) {
                  assert.equal(mine.editing, expected.editing);
                }
              },
              { timeout: 5000 },
            );
          try {
            await openBoard();
            const node = await nodeShown(sticky);
            await select(sticky);
            await sent({ selection: [sticky], editing: null });

            await press(node, { key: "Enter" });
            const editor = await waitFor(() =>
              within(node).getByRole("textbox"),
            );
            await sent({ selection: [sticky], editing: sticky });

            // Nothing while the window is in the background, and both back
            // once it isn't
            await act(async () => {
              window.dispatchEvent(new Event("blur"));
              await stabilize();
            });
            await sent({ selection: null, editing: null });
            await act(async () => {
              window.dispatchEvent(new Event("focus"));
              await stabilize();
            });
            await sent({ selection: [sticky], editing: sticky });

            // Nor while the tab is hidden
            Object.defineProperty(document, "visibilityState", {
              configurable: true,
              get: () => "hidden",
            });
            try {
              await act(async () => {
                document.dispatchEvent(new Event("visibilitychange"));
                await stabilize();
              });
              await sent({ selection: null, editing: null });
            } finally {
              delete (document as { visibilityState?: unknown })
                .visibilityState;
            }
            await act(async () => {
              document.dispatchEvent(new Event("visibilitychange"));
              await stabilize();
            });
            await sent({ selection: [sticky], editing: sticky });

            await act(async () => {
              fireEvent.keyDown(editor, { key: "Escape" });
              fireEvent.blur(editor);
              await stabilize();
            });
            await sent({ selection: [sticky], editing: null });

            // Everything is selected here, the line's end included, but
            // only nodes are sent
            await pressBoard();
            await press(pane(), { key: "a", ctrlKey: true });
            await waitFor(() =>
              assert.isTrue(nodeElement(end)?.classList.contains("selected")),
            );
            await waitFor(
              async () => {
                const selection =
                  (
                    await theirPresence.findOneAsync({
                      board: boardId,
                      user: Meteor.userId()!,
                    })
                  )?.selection ?? [];
                assert.isAbove(selection.length, 1);
                assert.isAtMost(selection.length, MAX_LIVE_SELECTION);
                assert.notInclude(selection, end);
              },
              { timeout: 5000 },
            );

            // Nor anything from a preview
            await act(async () => {
              fireEvent.click(screen.getByRole("button", { name: "History" }));
              await stabilize();
            });
            const row = await waitFor(
              () => {
                const found = [
                  ...document.querySelectorAll<HTMLElement>(
                    ".react-flow__panel.top.right button",
                  ),
                ].find((b) => b.textContent?.startsWith("Before edits"));
                assert.exists(found);
                return found;
              },
              { timeout: 10000 },
            );
            await act(async () => {
              fireEvent.click(row);
              await stabilize();
            });
            await screen.findByText(
              /^Viewing the board as it was at /,
              {},
              { timeout: 10000 },
            );
            await sent({ selection: null, editing: null });
          } finally {
            subscription.stop();
            forgetView();
            await deleteWhiteboardEdges.callPromise({
              boardId,
              edgeIds: [line],
            });
            await removeNodes([sticky, end]);
          }
        });

        const EnabledChatImage: typeof import("../../imports/client/EnabledChatImage").default =
          require("../../imports/client/EnabledChatImage").default;
        const imagesEnabled = (enabled: boolean) =>
          sinon
            .stub(EnabledChatImage, "findOne")
            .returns({ _id: "enabledChatImage", enabled });

        // Starts a comment and pastes a PNG into it, giving back its editor.
        const pasteImageIntoComment = async () => {
          await openBoard();
          await act(async () => {
            fireEvent.click(commentTool());
            await stabilize();
          });
          const at = paneAt(0.6, 0.6);
          await act(async () => {
            fireEvent.pointerDown(pane(), at);
            fireEvent.pointerUp(pane(), at);
            await stabilize();
          });
          const editor = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              "dialog[open] [data-slate-editor]",
            );
            assert.ok(found);
            return found;
          });
          await act(async () => {
            editor.focus();
            await stabilize();
          });
          const pasted = new DataTransfer();
          pasted.items.add(
            new File([new Uint8Array([137, 80, 78, 71])], "pasted.png", {
              type: "image/png",
            }),
          );
          await act(async () => {
            editor.dispatchEvent(
              new InputEvent("beforeinput", {
                inputType: "insertFromPaste",
                dataTransfer: pasted,
                bubbles: true,
                cancelable: true,
              }),
            );
            await stabilize();
          });
          return editor;
        };

        it("uploads an image pasted into a comment and puts it in", async function () {
          this.timeout(30000);
          const enabled = imagesEnabled(true);
          const publicUrl = "https://images.example.com/pasted.png";
          const uploadUrl = "https://upload.example.com/";
          const upload = sinon
            .stub(createChatImageUpload, "call")
            .callsFake((...args: unknown[]) => {
              const callback = args.at(-1);
              if (typeof callback === "function") {
                Meteor.defer(() =>
                  callback(undefined, { publicUrl, uploadUrl, fields: {} }),
                );
              }
            });
          const realFetch = window.fetch.bind(window);
          const fetch = sinon
            .stub(window, "fetch")
            .callsFake((input, init) =>
              input === uploadUrl
                ? Promise.resolve(new Response(null))
                : realFetch(input, init),
            );
          try {
            const editor = await pasteImageIntoComment();
            await waitFor(() => {
              assert.isTrue(upload.calledOnce);
              assert.deepEqual(upload.firstCall.args[0], {
                puzzleId,
                mimeType: "image/png",
              });
              assert.exists(editor.querySelector(`img[src="${publicUrl}"]`));
            });
          } finally {
            fetch.restore();
            upload.restore();
            enabled.restore();
          }
        });

        it("says why an image upload failed, and won't send the failed image", async function () {
          this.timeout(30000);
          const enabled = imagesEnabled(true);
          const upload = refuseCalls(createChatImageUpload);
          try {
            const editor = await pasteImageIntoComment();
            await waitFor(() => {
              const note = document.querySelector("dialog[open] output");
              assert.equal(
                note?.textContent,
                "Couldn't add the image: Refused for the test",
              );
            });
            assert.isTrue(upload.calledOnce);
            const send = within(
              editor.closest<HTMLElement>("dialog")!,
            ).getByRole("button", { name: "Send" });
            assert.isTrue((send as HTMLButtonElement).disabled);
          } finally {
            upload.restore();
            enabled.restore();
          }
        });

        it("says so, and uploads nothing, when the server has nowhere for images", async function () {
          this.timeout(30000);
          const enabled = imagesEnabled(false);
          const upload = sinon.spy(createChatImageUpload, "call");
          try {
            const editor = await pasteImageIntoComment();
            await waitFor(() => {
              const note = document.querySelector("dialog[open] output");
              assert.equal(
                note?.textContent,
                "Images can't be added here: this server has nowhere to store them.",
              );
            });
            assert.isTrue(upload.notCalled);
            assert.isNull(editor.querySelector("img"));
            const send = within(
              editor.closest<HTMLElement>("dialog")!,
            ).getByRole("button", { name: "Send" });
            assert.isTrue((send as HTMLButtonElement).disabled);
          } finally {
            upload.restore();
            enabled.restore();
          }
        });

        it("history lists a version after an edit and restores it", async function () {
          this.timeout(30000);
          await clearWhiteboardVersions.callPromise({ boardId });
          const note = Random.id();
          const base = { x: 29000, y: 29000 };
          // Two edits by two people, a few seconds apart, share a version
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [
              {
                _id: note,
                type: "sticky",
                position: base,
                width: 200,
                height: 160,
                text: "Added before the history was read",
              },
            ],
          });
          await other.callAsync(upsertWhiteboardNodes.name, {
            boardId,
            nodes: [{ _id: note, text: "Edited by them" }],
          });
          lookAt(base);
          await openBoard();
          await nodeShown(note);

          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "History" }));
            await stabilize();
          });
          const row = await waitFor(
            () => {
              const found = [
                ...document.querySelectorAll<HTMLElement>(
                  ".react-flow__panel.top.right button",
                ),
              ].find((b) => b.textContent?.includes(OTHER_NAME));
              assert.exists(found);
              return found;
            },
            { timeout: 10000 },
          );
          assert.match(
            row.textContent ?? "",
            /^Before edits by .* and Second Member, .* \(2 changes\)$/,
          );
          assert.exists(
            screen.getByRole("button", { name: "Now", pressed: true }),
          );

          // Escape leaves a preview and leaves History open
          await act(async () => {
            fireEvent.click(row);
            await stabilize();
          });
          await screen.findByText(
            /^Viewing the board as it was at /,
            {},
            { timeout: 10000 },
          );
          await press(document.body, { key: "Escape" });
          assert.isNull(screen.queryByText(/^Viewing the board as it was at /));
          assert.exists(
            screen.getByRole("button", { name: "Now", pressed: true }),
          );

          await act(async () => {
            fireEvent.click(row);
            await stabilize();
          });
          // The board as it was, before the note, and nothing can be edited
          const banner = await screen.findByText(
            /^Viewing the board as it was at /,
            {},
            { timeout: 10000 },
          );
          await waitFor(() => assert.isNull(nodeElement(note)));
          assert.equal(row.getAttribute("aria-pressed"), "true");
          assert.isNull(
            screen.queryByRole("button", { name: /^Select and move/ }),
          );

          await act(async () => {
            fireEvent.click(
              within(banner.parentElement!).getByRole("button", {
                name: "Restore this version",
              }),
            );
            await stabilize();
          });
          const dialog = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              ".modal.show .modal-content",
            );
            assert.exists(found);
            return found;
          });
          assert.include(
            dialog.textContent ?? "",
            "Changes since then, by anyone, are undone.",
          );
          await act(async () => {
            fireEvent.click(
              within(dialog).getByRole("button", {
                name: "Restore this version",
              }),
            );
            await stabilize();
          });

          await waitFor(
            async () => {
              assert.notOk(await WhiteboardNodes.findOneAsync(note));
              assert.isNull(
                screen.queryByText(/^Viewing the board as it was at /),
              );
            },
            { timeout: 10000 },
          );
          await screen.findByText(/^Board restored to /);
          await screen.findByRole("button", { name: /^Select and move/ });
          assert.isNull(nodeElement(note));
          await waitFor(() =>
            assert.isNull(document.querySelector(".modal.show")),
          );

          // With no preview, Escape closes History
          await press(document.body, { key: "Escape" });
          assert.isNull(screen.queryByRole("button", { name: "Now" }));
        });

        describe("locks", function () {
          const stickies = async (
            base: { x: number; y: number },
            n: number,
          ) => {
            const ids = Array.from({ length: n }, () => Random.id());
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: ids.map((_id, i) => ({
                _id,
                type: "sticky" as const,
                position: { x: base.x + i * 200, y: base.y },
                width: 160,
                height: 120,
                text: `Note ${i}`,
              })),
            });
            return ids;
          };
          const badge = (id: string) =>
            nodeElement(id)?.querySelector<HTMLElement>(".jr-lock-badge");
          const lockButton = () =>
            screen.getByRole<HTMLButtonElement>("button", {
              name: /^(Lock|Unlock)$/,
            });
          const click = async (element: Element) => {
            await act(async () => {
              fireEvent.click(element);
              await stabilize();
            });
          };
          const theyMove = (id: string) =>
            other.callAsync(upsertWhiteboardNodes.name, {
              boardId,
              nodes: [{ _id: id, position: { x: 1, y: 1 } }],
            });

          it("locks a sticky so they can't move it, and Ctrl+L unlocks it", async function () {
            this.timeout(30000);
            const base = { x: 31000, y: 31000 };
            const [note] = await stickies(base, 1);
            lookAt(base);
            try {
              await openBoard();
              assert.isTrue(lockButton().disabled);
              // A disabled button gets no hover, so its wrapper says why
              assert.include(
                lockButton().parentElement!.title,
                "select something to lock it",
              );
              await select(note!);
              assert.equal(lockButton().getAttribute("aria-label"), "Lock");
              assert.include(lockButton().title, "Ctrl/⌘+L");
              await click(lockButton());
              await waitFor(
                async () => {
                  const saved = await savedNode(note!);
                  assert.isTrue(saved?.locked);
                  assert.equal(saved?.lockedBy, Meteor.userId());
                },
                { timeout: 10000 },
              );
              await waitFor(() => {
                assert.match(badge(note!)?.title ?? "", /^Locked/);
                assert.equal(lockButton().getAttribute("aria-label"), "Unlock");
              });
              // A locked node can't be picked up or resized
              assert.isFalse(
                nodeElement(note!)!.classList.contains("draggable"),
              );
              assert.isNull(
                document.querySelector(".react-flow__resize-control"),
              );

              await assert.isRejected(theyMove(note!), /That's locked/);

              const node = await nodeShown(note!);
              await act(async () => {
                node.focus();
                await stabilize();
              });
              await press(node, { key: "l", ctrlKey: true });
              await waitFor(
                async () => assert.notOk((await savedNode(note!))?.locked),
                { timeout: 10000 },
              );
              await waitFor(() => assert.notOk(badge(note!)));
              await theyMove(note!);
            } finally {
              forgetView();
              await upsertWhiteboardNodes.callPromise({
                boardId,
                nodes: [{ _id: note!, locked: false }],
              });
              await removeNodes([note!]);
            }
          });

          it("shows who locked what they lock", async function () {
            this.timeout(30000);
            const base = { x: 31500, y: 31000 };
            const [note] = await stickies(base, 1);
            await other.callAsync(upsertWhiteboardNodes.name, {
              boardId,
              nodes: [{ _id: note, locked: true }],
            });
            lookAt(base);
            try {
              await openBoard();
              await nodeShown(note!);
              await waitFor(() =>
                assert.equal(badge(note!)?.title, `Locked by ${OTHER_NAME}`),
              );
            } finally {
              forgetView();
              await upsertWhiteboardNodes.callPromise({
                boardId,
                nodes: [{ _id: note!, locked: false }],
              });
              await removeNodes([note!]);
            }
          });

          it("leaves a locked note out of Delete and says so", async function () {
            this.timeout(30000);
            const base = { x: 32000, y: 31000 };
            const [held, free] = await stickies(base, 2);
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: held!, locked: true }],
            });
            lookAt(base);
            try {
              await openBoard();
              await select(held!);
              await press(document.body, { key: "Delete" });
              await screen.findByText("That's locked");
              // React Flow only acts on a fresh press of the key
              await act(async () => {
                fireEvent.keyUp(document.body, { key: "Delete" });
                await stabilize();
              });
              await act(async () => {
                fireEvent.keyDown(document, {
                  key: "Control",
                  code: "ControlLeft",
                });
                await stabilize();
              });
              await select(free!);
              await act(async () => {
                fireEvent.keyUp(document, {
                  key: "Control",
                  code: "ControlLeft",
                });
                await stabilize();
              });
              await press(document.body, { key: "Delete" });
              await screen.findByText("Some of those are locked");
              await waitFor(
                async () => assert.isUndefined(await savedNode(free!)),
                { timeout: 10000 },
              );
              assert.ok(await savedNode(held!));
            } finally {
              forgetView();
              await upsertWhiteboardNodes.callPromise({
                boardId,
                nodes: [{ _id: held!, locked: false }],
              });
              await removeNodes([held!, free!]);
            }
          });

          it("leaves a locked note where it is when the rest are aligned", async function () {
            this.timeout(30000);
            const base = { x: 33000, y: 31000 };
            const ids = [Random.id(), Random.id(), Random.id()];
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: ids.map((_id, i) => ({
                _id,
                type: "sticky" as const,
                position: { x: base.x + i * 200, y: base.y + i * 60 },
                width: 100,
                height: 80,
              })),
            });
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: ids[1]!, locked: true }],
            });
            lookAt(base);
            try {
              await openBoard();
              await select(ids[0]!);
              await act(async () => {
                fireEvent.keyDown(document, {
                  key: "Control",
                  code: "ControlLeft",
                });
                await stabilize();
              });
              await select(ids[1]!);
              await select(ids[2]!);
              await act(async () => {
                fireEvent.keyUp(document, {
                  key: "Control",
                  code: "ControlLeft",
                });
                await stabilize();
              });
              await click(
                await screen.findByRole("button", { name: "Align top edges" }),
              );
              await waitFor(
                async () =>
                  assert.equal(
                    Math.round((await savedNode(ids[2]!))?.position.y ?? 0),
                    base.y,
                  ),
                { timeout: 10000 },
              );
              assert.equal((await savedNode(ids[1]!))?.position.y, base.y + 60);
            } finally {
              forgetView();
              await upsertWhiteboardNodes.callPromise({
                boardId,
                nodes: [{ _id: ids[1]!, locked: false }],
              });
              await removeNodes(ids);
            }
          });

          it("erases unlocked ink and passes over locked ink", async function () {
            this.timeout(30000);
            const base = { x: 34000, y: 31000 };
            const [held, free] = [Random.id(), Random.id()];
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [held, free].map((_id, i) => ({
                _id,
                type: "ink" as const,
                position: { x: base.x, y: base.y + i * 200 },
                width: 200,
                height: 20,
                points: Array.from(
                  { length: 41 },
                  (_, j): [number, number, number] => [j * 5, 10, 0.5],
                ),
                strokeWidth: "medium" as const,
                color: "black" as const,
                stroke: _id,
              })),
            });
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: held, locked: true }],
            });
            const screenAt = lookAt(base);
            try {
              await openBoard();
              await nodeShown(held);
              await waitFor(() => assert.ok(badge(held)));
              await click(
                screen.getByRole("button", { name: "Erase strokes" }),
              );
              for (const y of [base.y + 10, base.y + 210]) {
                const at = {
                  button: 0,
                  buttons: 1,
                  pointerId: 1,
                  ...screenAt(base.x + 100, y),
                };
                await act(async () => {
                  fireEvent.pointerDown(pane(), at);
                  await stabilize();
                });
                await act(async () => {
                  fireEvent.pointerUp(pane(), { ...at, buttons: 0 });
                  await stabilize();
                });
              }
              await waitFor(
                async () => assert.isUndefined(await savedNode(free)),
                { timeout: 10000 },
              );
              assert.ok(await savedNode(held));
            } finally {
              forgetView();
              await upsertWhiteboardNodes.callPromise({
                boardId,
                nodes: [{ _id: held, locked: false }],
              });
              await removeNodes([held, free]);
            }
          });

          it("undoes a lock", async function () {
            this.timeout(30000);
            const base = { x: 32500, y: 31000 };
            const [note] = await stickies(base, 1);
            lookAt(base);
            try {
              await openBoard();
              await select(note!);
              await click(lockButton());
              await waitFor(
                async () => assert.isTrue((await savedNode(note!))?.locked),
                { timeout: 10000 },
              );
              const undo = screen.getByRole<HTMLButtonElement>("button", {
                name: "Undo",
              });
              await waitFor(() => assert.isFalse(undo.disabled), {
                timeout: 10000,
              });
              await click(undo);
              await waitFor(
                async () => assert.notOk((await savedNode(note!))?.locked),
                { timeout: 10000 },
              );
            } finally {
              forgetView();
              await upsertWhiteboardNodes.callPromise({
                boardId,
                nodes: [{ _id: note!, locked: false }],
              });
              await removeNodes([note!]);
            }
          });

          it("locks every frame with Lock layout, and Unlock layout frees them", async function () {
            this.timeout(30000);
            // Frames taken off the board are left unlocked
            const frames = () =>
              WhiteboardNodes.find({
                board: boardId,
                type: "frame",
                hidden: { $ne: true },
              }).fetchAsync();
            const frame = (await frames())[0]!;
            try {
              await openBoard();
              await click(screen.getByRole("button", { name: "Lock layout" }));
              await waitFor(
                async () =>
                  (await frames()).forEach((f) => assert.isTrue(f.locked)),
                { timeout: 10000 },
              );
              // In a frame's header, or on its label zoomed right out
              const frameLock = () =>
                document.querySelector(
                  ".react-flow__node-frame .jr-lock-badge, .jr-frame-lock",
                );
              await waitFor(() => assert.isNotNull(frameLock()));
              await assert.isRejected(theyMove(frame._id), /That's locked/);

              await click(
                screen.getByRole("button", { name: "Unlock layout" }),
              );
              await waitFor(
                async () =>
                  (await frames()).forEach((f) => assert.notOk(f.locked)),
                { timeout: 10000 },
              );
              await waitFor(() => assert.isNull(frameLock()));
            } finally {
              await setWhiteboardLayoutLocked.callPromise({
                boardId,
                locked: false,
              });
            }
          });
        });
      });

      it("resets the layout and undoes it from history", async function () {
        this.timeout(60000);
        await clearWhiteboardVersions.callPromise({ boardId });
        const { a } = await sideBySideCards(boardId);
        const dragged = { x: 26000, y: 26000 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [{ _id: a._id, parent: null, position: dragged }],
        });
        lookAt(dragged);
        try {
          await openBoard();
          await nodeShown(a._id);
          await act(async () => {
            fireEvent.click(
              screen.getByRole("button", { name: "Reset layout…" }),
            );
            await stabilize();
          });
          const dialog = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              ".modal.show .modal-content",
            );
            assert.exists(found);
            return found;
          });
          assert.include(
            dialog.textContent ?? "",
            "Every card and round frame goes back to where the puzzle list puts it.",
          );
          assert.isFalse(
            within(dialog).getByRole<HTMLInputElement>("checkbox", {
              name: "Also put back cards and rounds taken off the board",
            }).checked,
          );
          await act(async () => {
            fireEvent.click(
              within(dialog).getByRole("button", { name: "Reset layout" }),
            );
            await stabilize();
          });
          await waitFor(
            async () => {
              const card = await WhiteboardNodes.findOneAsync(a._id);
              assert.equal(card?.parent, a.parent);
              assert.notOk(card?.manual);
            },
            { timeout: 10000 },
          );
          await screen.findByText("Layout reset. Undo it from History.");
          await waitFor(() =>
            assert.isNull(document.querySelector(".modal.show")),
          );

          await act(async () => {
            fireEvent.click(
              screen.getByRole("button", { name: "Open History" }),
            );
            await stabilize();
          });
          const row = await waitFor(
            () => {
              const found = [
                ...document.querySelectorAll<HTMLElement>(
                  ".react-flow__panel.top.right button",
                ),
              ].find((b) => b.textContent?.includes("reset the layout"));
              assert.exists(found);
              return found;
            },
            { timeout: 10000 },
          );
          await act(async () => {
            fireEvent.click(row);
            await stabilize();
          });
          const banner = await screen.findByText(
            /^Viewing the board as it was at /,
            {},
            { timeout: 10000 },
          );
          await act(async () => {
            fireEvent.click(
              within(banner.parentElement!).getByRole("button", {
                name: "Restore this version",
              }),
            );
            await stabilize();
          });
          const confirm = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              ".modal.show .modal-content",
            );
            assert.exists(found);
            return found;
          });
          await act(async () => {
            fireEvent.click(
              within(confirm).getByRole("button", {
                name: "Restore this version",
              }),
            );
            await stabilize();
          });
          await waitFor(
            async () => {
              const card = await WhiteboardNodes.findOneAsync(a._id);
              assert.deepEqual(card?.position, dragged);
              assert.notOk(card?.parent);
              assert.isTrue(card?.manual);
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [{ _id: a._id, parent: a.parent, position: a.position }],
          });
        }
      });

      it("restores one item from a preview", async function () {
        this.timeout(60000);
        const note = Random.id();
        const base = { x: 31000, y: 31000 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: note,
              type: "sticky",
              position: base,
              width: 200,
              height: 160,
              text: "Deleted by mistake",
            },
          ],
        });
        // The deletion is then the first edit, so the version it records
        // has the note on it
        await clearWhiteboardVersions.callPromise({ boardId });
        await removeNodes([note]);
        lookAt(base);
        try {
          await openBoard();
          await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "History" }));
            await stabilize();
          });
          const row = await waitFor(
            () => {
              const found = [
                ...document.querySelectorAll<HTMLElement>(
                  ".react-flow__panel.top.right button",
                ),
              ].find((b) => b.textContent?.startsWith("Before edits by"));
              assert.exists(found);
              return found;
            },
            { timeout: 10000 },
          );
          await act(async () => {
            fireEvent.click(row);
            await stabilize();
          });
          await screen.findByText(
            /^Viewing the board as it was at /,
            {},
            { timeout: 10000 },
          );
          const shown = await nodeShown(note);
          await waitFor(() =>
            assert.isTrue(shown.classList.contains("jr-changed")),
          );

          await select(note);
          const button = await screen.findByRole("button", {
            name: "Restore this item",
          });
          await act(async () => {
            fireEvent.click(button);
            await stabilize();
          });
          await waitFor(
            async () => {
              const restored = await savedNode(note);
              assert.equal(restored?.text, "Deleted by mistake");
              assert.deepEqual(restored?.position, base);
            },
            { timeout: 10000 },
          );
          await screen.findByText(/^Put back as it was at /);
          // Still previewing, and the note now matches the board
          screen.getByText(/^Viewing the board as it was at /);
          await waitFor(() =>
            assert.isFalse(nodeElement(note)?.classList.contains("jr-changed")),
          );

          // What was picked in the preview isn't selected on the board
          assert.isTrue(nodeElement(note)?.classList.contains("selected"));
          await act(async () => {
            fireEvent.click(
              screen.getByRole("button", { name: "Back to now" }),
            );
            await stabilize();
          });
          await waitFor(() =>
            assert.isNull(
              screen.queryByText(/^Viewing the board as it was at /),
            ),
          );
          const live = await nodeShown(note);
          assert.isFalse(live.classList.contains("selected"));
          assert.isNull(
            screen.queryByRole("button", { name: "Restore this item" }),
          );
        } finally {
          forgetView();
          await removeNodes([note]);
        }
      });

      it("keeps the reset question up while it runs and shows a refusal in it", async function () {
        this.timeout(30000);
        await ensureBoard();
        let answer: ((error: Meteor.Error) => void) | undefined;
        const refuse = sinon
          .stub(resetWhiteboardLayout, "call")
          .callsFake((...args: unknown[]) => {
            const callback = args.at(-1);
            if (typeof callback === "function") {
              answer = callback as (error: Meteor.Error) => void;
            }
          });
        try {
          await openBoard();
          await act(async () => {
            fireEvent.click(
              await screen.findByRole(
                "button",
                { name: "Reset layout…" },
                { timeout: 10000 },
              ),
            );
            await stabilize();
          });
          const dialog = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              ".modal.show .modal-content",
            );
            assert.exists(found);
            return found;
          });
          await act(async () => {
            fireEvent.click(
              within(dialog).getByRole("button", { name: "Reset layout" }),
            );
            await stabilize();
          });
          assert.ok(answer);
          assert.isTrue(
            within(dialog).getByRole<HTMLButtonElement>("button", {
              name: "Resetting…",
            }).disabled,
          );
          assert.isTrue(
            within(dialog).getByRole<HTMLButtonElement>("button", {
              name: "Cancel",
            }).disabled,
          );
          assert.isTrue(
            within(dialog).getByRole<HTMLInputElement>("checkbox").disabled,
          );

          await act(async () => {
            answer!(
              new Meteor.Error(403, "Only operators can edit this whiteboard"),
            );
            await stabilize();
          });
          const shown = document.querySelector<HTMLElement>(
            ".modal.show .modal-content",
          );
          assert.exists(shown);
          within(shown).getByText(
            "Couldn't reset the layout: Only operators can edit this whiteboard",
          );
          assert.isFalse(
            within(shown).getByRole<HTMLButtonElement>("button", {
              name: "Reset layout",
            }).disabled,
          );
          await act(async () => {
            fireEvent.click(
              within(shown).getByRole("button", { name: "Cancel" }),
            );
            await stabilize();
          });
          await waitFor(() =>
            assert.isNull(document.querySelector(".modal.show")),
          );
        } finally {
          refuse.restore();
        }
      });

      it("places a dragged card by tags", async function () {
        this.timeout(30000);
        await ensureBoard();
        const { a } = await sideBySideCards(boardId);
        const dragged = { x: 27000, y: 27000 };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [{ _id: a._id, parent: null, position: dragged }],
        });
        lookAt(dragged);
        try {
          await openBoard();
          await select(a._id);
          const place = await screen.findByRole(
            "button",
            { name: "Place by tags" },
            { timeout: 10000 },
          );
          assert.equal(
            place.title,
            "Move back to where its tags put it, and keep it in step from now on",
          );
          await act(async () => {
            fireEvent.click(place);
            await stabilize();
          });
          await waitFor(
            async () => {
              const card = await WhiteboardNodes.findOneAsync(a._id);
              assert.equal(card?.parent, a.parent);
              assert.notOk(card?.manual);
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [{ _id: a._id, parent: a.parent, position: a.position }],
          });
        }
      });
    });
    describe("collapsed rounds", function () {
      // From the fixture hunt: The Robber is the meta of the Games Island
      // round
      const gamesIsland = "nPbTi6DPvjAkot94n";
      const robber = "3zTi6pDY9mHJSbLoS";
      let board: Awaited<ReturnType<typeof ensureBoard>>;
      let boardId: string;

      before(async function () {
        this.timeout(10000);
        board = await ensureBoard();
        boardId = board._id;
        subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
      });

      const pane = () => document.querySelector(".react-flow__pane")!;
      const lookAt = (at: { x: number; y: number }) =>
        localStorage.setItem(
          `whiteboard:viewport:${boardId}`,
          JSON.stringify({ x: 150 - at.x, y: 150 - at.y, zoom: 1 }),
        );
      const forgetView = () =>
        localStorage.removeItem(`whiteboard:viewport:${boardId}`);
      const removeNodes = (nodeIds: string[]) =>
        deleteWhiteboardNodes.callPromise({ boardId, nodeIds });
      const nodeShown = (id: string) =>
        waitFor(
          () => {
            const found = nodeElement(id);
            assert.isNotNull(found);
            return found as HTMLElement;
          },
          { timeout: 20000 },
        );
      const openBoard = async (search = "") => {
        render(<TestApp />);
        await goTo(`${boardPath}${search}`);
        await waitFor(() => assert.isNotNull(pane()), { timeout: 20000 });
        await act(async () => {
          await stabilize();
        });
      };
      const click = async (element: Element) => {
        await act(async () => {
          fireEvent.click(element);
          await stabilize();
        });
      };
      const isCollapsed = async (id: string) =>
        !!(await WhiteboardNodes.findOneAsync(id))?.collapsed;

      // A collapsed frame of our own at `base` with two notes in it, and a
      // note outside it.
      const collapsedFrame = async (base: { x: number; y: number }) => {
        const ids = {
          frame: Random.id(),
          inside: Random.id(),
          alsoInside: Random.id(),
          outside: Random.id(),
        };
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: ids.frame,
              type: "frame",
              position: base,
              width: 600,
              height: 400,
              label: "Folded round",
            },
            {
              _id: ids.inside,
              type: "sticky",
              parent: ids.frame,
              position: { x: 40, y: 100 },
              width: 120,
              height: 80,
              text: "Inside",
            },
            {
              _id: ids.alsoInside,
              type: "sticky",
              parent: ids.frame,
              position: { x: 300, y: 100 },
              width: 120,
              height: 80,
            },
            {
              _id: ids.outside,
              type: "sticky",
              position: { x: base.x + 800, y: base.y },
              width: 120,
              height: 80,
            },
          ],
        });
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [{ _id: ids.frame, collapsed: true }],
        });
        return ids;
      };

      it("folds a frame's contents and moves its lines to the frame", async function () {
        this.timeout(30000);
        const base = { x: 40000, y: 40000 };
        const ids = await collapsedFrame(base);
        const out = Random.id();
        const inside = Random.id();
        await upsertWhiteboardEdges.callPromise({
          boardId,
          edges: [
            { _id: out, source: ids.inside, target: ids.outside },
            { _id: inside, source: ids.inside, target: ids.alsoInside },
          ],
        });
        lookAt(base);
        const drawnLine = (id: string) =>
          document.querySelector(
            `.react-flow__edge[data-id="${id}"] .react-flow__edge-path`,
          );
        try {
          await openBoard();
          const frame = await nodeShown(ids.frame);
          await waitFor(
            () => {
              assert.equal(frame.style.height, "56px");
              assert.isNull(nodeElement(ids.inside));
              assert.isNull(nodeElement(ids.alsoInside));
              assert.isNotNull(nodeElement(ids.outside));
              assert.include(frame.textContent ?? "", "2 items");
              // The line out of the frame now starts at it; the one inside
              // isn't drawn
              assert.isNotNull(drawnLine(out));
              assert.isNull(drawnLine(inside));
            },
            { timeout: 10000 },
          );

          await click(
            within(frame).getByRole("button", { name: "Expand for everyone" }),
          );
          await waitFor(
            async () => {
              assert.isFalse(await isCollapsed(ids.frame));
              assert.isNotNull(nodeElement(ids.inside));
              assert.isNotNull(drawnLine(inside));
            },
            { timeout: 10000 },
          );
          assert.equal(
            within(nodeElement(ids.frame) as HTMLElement)
              .getByRole("button", { name: "Collapse for everyone" })
              .getAttribute("aria-expanded"),
            "true",
          );
        } finally {
          forgetView();
          await removeNodes(Object.values(ids));
        }
      });

      it("finds a line inside a collapsed frame and opens the frame for this viewer", async function () {
        this.timeout(30000);
        const base = { x: 42000, y: 42000 };
        const ids = await collapsedFrame(base);
        const line = Random.id();
        await upsertWhiteboardEdges.callPromise({
          boardId,
          edges: [
            {
              _id: line,
              source: ids.inside,
              target: ids.alsoInside,
              label: "Zebra crossing",
            },
          ],
        });
        lookAt({ x: base.x + 3000, y: base.y + 3000 });
        try {
          await openBoard();
          const search = await screen.findByRole(
            "combobox",
            { name: "Search the board" },
            { timeout: 20000 },
          );
          await act(async () => {
            fireEvent.focus(search);
            fireEvent.change(search, { target: { value: "zebra" } });
            await stabilize();
          });
          await click(
            await screen.findByRole(
              "option",
              { name: /^Zebra crossing/ },
              { timeout: 10000 },
            ),
          );
          await waitFor(
            () => {
              assert.isNotNull(nodeElement(ids.inside));
              assert.isNotNull(
                document.querySelector(
                  `.react-flow__edge[data-id="${line}"] .react-flow__edge-path`,
                ),
              );
              // The mark at the line's middle, rather than at a node
              assert.isNotNull(
                document.querySelector(".jr-node-pulse:not([data-node])"),
              );
            },
            { timeout: 10000 },
          );
          assert.isTrue(await isCollapsed(ids.frame));
        } finally {
          forgetView();
          await removeNodes(Object.values(ids));
        }
      });

      it("collapses finished rounds from the toolbar", async function () {
        this.timeout(30000);
        const frameId = (await WhiteboardNodes.findOneAsync({
          board: boardId,
          tag: gamesIsland,
        }))!._id;
        try {
          await setPuzzleAnswers.callPromise({
            puzzleId: robber,
            answers: ["MONEY"],
          });
          await openBoard(`?node=${frameId}`);
          await waitFor(
            () => assert.include(nodeElement(frameId)?.textContent, "Finished"),
            { timeout: 20000 },
          );
          const button = await screen.findByRole(
            "button",
            { name: "Collapse finished rounds" },
            { timeout: 10000 },
          );
          assert.equal(button.title, "Fold every round whose metas are solved");
          await click(button);
          await waitFor(
            async () => {
              assert.isTrue(await isCollapsed(frameId));
              assert.isNull(
                screen.queryByRole("button", {
                  name: "Collapse finished rounds",
                }),
              );
            },
            { timeout: 10000 },
          );
        } finally {
          await setPuzzleAnswers.callPromise({ puzzleId: robber, answers: [] });
          const collapsed = await WhiteboardNodes.find({
            board: boardId,
            collapsed: true,
          }).fetchAsync();
          if (collapsed.length > 0) {
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: collapsed.map((n) => ({ _id: n._id, collapsed: false })),
            });
          }
        }
      });

      it("doesn't drop a card into a collapsed frame", async function () {
        this.timeout(30000);
        const base = { x: 44000, y: 44000 };
        const ids = await collapsedFrame(base);
        const { a } = await sideBySideCards(boardId);
        // The card's middle is 20 past the frame's right edge, level with
        // the middle of the strip, so the nudges below take it over the strip
        await upsertWhiteboardNodes.callPromise({
          boardId,
          nodes: [
            {
              _id: a._id,
              parent: null,
              position: {
                x: base.x + 620 - CARD_WIDTH / 2,
                y: base.y + COLLAPSED_FRAME_HEIGHT / 2 - CARD_HEIGHT / 2,
              },
            },
          ],
        });
        lookAt(base);
        try {
          await openBoard();
          const card = await nodeShown(a._id);
          await click(card);
          for (let i = 0; i < 4; i++) {
            await act(async () => {
              fireEvent.keyDown(card, { key: "ArrowLeft", shiftKey: true });
              await stabilize();
            });
          }
          await waitFor(
            async () => {
              const moved = await WhiteboardNodes.findOneAsync(a._id);
              assert.equal(moved?.position.x, base.x + 540 - CARD_WIDTH / 2);
              assert.isUndefined(moved?.parent);
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await removeNodes(Object.values(ids));
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [{ _id: a._id, parent: a.parent, position: a.position }],
          });
        }
      });

      it("lets a viewer peek without changing the board", async function () {
        this.timeout(30000);
        const base = { x: 48000, y: 48000 };
        const ids = await collapsedFrame(base);
        lookAt(base);
        await setHuntArchived.callPromise({ huntId, isArchived: true });
        try {
          await openBoard();
          const frame = await nodeShown(ids.frame);
          // Viewing only, so there's no folding it for everyone
          assert.isNull(
            within(frame).queryByRole("button", {
              name: "Expand for everyone",
            }),
          );
          const show = await within(frame).findByRole(
            "button",
            { name: "Show (only for you)" },
            { timeout: 10000 },
          );
          assert.equal(show.getAttribute("aria-expanded"), "false");
          await click(show);
          await nodeShown(ids.inside);
          assert.isTrue(await isCollapsed(ids.frame));

          await click(
            within(nodeElement(ids.frame) as HTMLElement).getByRole("button", {
              name: "Hide again",
            }),
          );
          await waitFor(() => assert.isNull(nodeElement(ids.inside)), {
            timeout: 10000,
          });
          assert.isTrue(await isCollapsed(ids.frame));
        } finally {
          forgetView();
          await setHuntArchived.callPromise({ huntId, isArchived: false });
          await removeNodes(Object.values(ids));
        }
      });

      it("shows a comment inside a collapsed frame from a ?comment= link", async function () {
        this.timeout(30000);
        const base = { x: 52000, y: 52000 };
        const ids = await collapsedFrame(base);
        await sendChatMessage.callPromise({
          puzzleId: board.puzzle,
          content: JSON.stringify({
            type: "message",
            children: [{ text: "Is this inside?" }],
          }),
          comment: { node: ids.inside, x: 10, y: 10 },
        });
        let commentId: string | undefined;
        try {
          await openBoard();
          commentId = await waitFor(
            async () => {
              const found = await ChatMessages.findOneAsync({
                "comment.node": ids.inside,
              });
              assert.ok(found);
              return found._id;
            },
            { timeout: 20000 },
          );
          assert.isNull(nodeElement(ids.inside));
          await goTo(`${boardPath}?comment=${commentId}`);
          await waitFor(
            () => {
              assert.isNotNull(nodeElement(ids.inside));
              assert.isNotNull(
                document.querySelector(
                  `.jr-comment-pin[data-thread="${commentId}"]`,
                ),
              );
              assert.include(
                document.querySelector(".react-flow__panel.top.right")
                  ?.textContent ?? "",
                "Is this inside?",
              );
              assert.equal(location.current?.search, "");
            },
            { timeout: 20000 },
          );
          assert.isTrue(await isCollapsed(ids.frame));
        } finally {
          if (commentId) {
            await deleteWhiteboardComment.callPromise({ messageId: commentId });
          }
          await removeNodes(Object.values(ids));
        }
      });
    });
  });
}
