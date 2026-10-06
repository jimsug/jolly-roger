import { promisify } from "node:util";
import { Accounts } from "meteor/accounts-base";
import { check } from "meteor/check";
import { DDP } from "meteor/ddp";
import { EJSON } from "meteor/ejson";
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
import type { ChatMessageType } from "../../imports/lib/models/ChatMessages";
import ChatMessages from "../../imports/lib/models/ChatMessages";
import Hunts from "../../imports/lib/models/Hunts";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";
import Puzzles from "../../imports/lib/models/Puzzles";
import Tags from "../../imports/lib/models/Tags";
import WhiteboardEdges from "../../imports/lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../imports/lib/models/WhiteboardNodes";
import type { WhiteboardEditPolicy } from "../../imports/lib/models/Whiteboards";
import Whiteboards from "../../imports/lib/models/Whiteboards";
import chatMessagesForPuzzle from "../../imports/lib/publications/chatMessagesForPuzzle";
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
import {
  MAX_INK_POINTS_PER_BOARD,
  MAX_LIVE_SELECTION,
} from "../../imports/lib/whiteboard/limits";
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
import dismissChatNotification from "../../imports/methods/dismissChatNotification";
import exportWhiteboard from "../../imports/methods/exportWhiteboard";
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
import updateProfile from "../../imports/methods/updateProfile";
import upsertWhiteboardEdges from "../../imports/methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../imports/methods/upsertWhiteboardNodes";
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

// Unsets the caller's board comment setting, and their display name too if
// asked, putting a profile back as it was before a test filled them in.
const unsetProfileSettings = new TypedMethod<{ displayName: boolean }, void>(
  "test.methods.whiteboard.unsetProfileSettings",
);

// The image bucket uploads are checked against: configured as TEST_BUCKET,
// or not at all.
const TEST_BUCKET = { bucketName: "jr-test-images", bucketRegion: "us-east-1" };
const setImageBucket = new TypedMethod<{ on: boolean }, void>(
  "test.methods.whiteboard.setImageBucket",
);

// Adds one ink segment out of the way, with as many points as leave the
// board `spare` points short of its ink budget, and returns its id.
const fillInk = new TypedMethod<{ boardId: string; spare: number }, string>(
  "test.methods.whiteboard.fillInk",
);

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;
  const {
    inkPointsOnBoard,
  }: typeof import("../../imports/server/whiteboardShared") = require("../../imports/server/whiteboardShared");

  defineMethod(fillInk, {
    validate(arg: unknown) {
      check(arg, { boardId: String, spare: Number });
      return arg;
    },

    async run({ boardId, spare }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      check(this.userId, String);
      const board = (await Whiteboards.findOneAsync(boardId))!;
      const count =
        MAX_INK_POINTS_PER_BOARD - (await inkPointsOnBoard(boardId)) - spare;
      return WhiteboardNodes.insertAsync({
        hunt: board.hunt,
        board: boardId,
        type: "ink",
        position: { x: -90000, y: -90000 },
        width: 10,
        height: 10,
        strokeWidth: "thin",
        points: Array.from({ length: count }, (): [number, number, number] => [
          0, 0, 0.5,
        ]),
        createdBy: this.userId,
      });
    },
  });

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

  defineMethod(unsetProfileSettings, {
    validate(arg: unknown) {
      check(arg, { displayName: Boolean });
      return arg;
    },

    async run({ displayName }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      check(this.userId, String);
      await MeteorUsers.updateAsync(this.userId, {
        $unset: {
          boardCommentNotifications: 1,
          ...(displayName ? { displayName: 1 } : {}),
        },
      });
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
  const {
    LONG_PRESS_MS,
  }: typeof import("../../imports/client/components/whiteboard/touch") = require("../../imports/client/components/whiteboard/touch");

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

  // The hunt's one board and its backing puzzle, once ensureBoard has made
  // it. The first tests check there's no board yet, so the top-level before
  // can't.
  let boardId: string;
  let boardPuzzle: string;

  // Creating a board that exists returns it, so each test can start here.
  const ensureBoard = async () => {
    await createWhiteboard.callPromise({ huntId });
    subs.push(await typedSubscribe.async(whiteboardForHunt, { huntId }));
    const board = await Whiteboards.findOneAsync({ hunt: huntId });
    assert.ok(board);
    boardId = board._id;
    boardPuzzle = board.puzzle;
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

  // Stands in for a touch screen, a tablet say, until restore: the board's
  // "(pointer: coarse)" query answers yes, and anything else as it did
  // before, so it can go on top of simulatePhone.
  const simulateCoarse = () => {
    const previous = window.matchMedia;
    window.matchMedia = (query: string) =>
      query === "(pointer: coarse)"
        ? ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: sinon.fake(),
            removeEventListener: sinon.fake(),
            addListener: sinon.fake(),
            removeListener: sinon.fake(),
            dispatchEvent: () => false,
          } as unknown as MediaQueryList)
        : previous.call(window, query);
    return {
      restore: () => {
        window.matchMedia = previous;
      },
    };
  };

  // A finger at a point on screen, down or (with lift) let go.
  const finger = (at: { clientX: number; clientY: number }, pointerId = 1) => ({
    button: 0,
    buttons: 1,
    pointerId,
    pointerType: "touch",
    isPrimary: pointerId === 1,
    ...at,
  });
  const lift = (at: { clientX: number; clientY: number }, pointerId = 1) => ({
    ...finger(at, pointerId),
    buttons: 0,
  });
  // Waits `ms` for anything further to happen, such as a glide, or a save
  // that shouldn't.
  const settleFor = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  // The middle of `element` on screen.
  const middleOf = (element: Element) => {
    const box = element.getBoundingClientRect();
    return {
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    };
  };
  // A finger held on `element` until it's a long press, then let go, with
  // the click the browser makes unless `click` is off.
  const pressAndHold = async (
    element: Element,
    { click: clicks = true }: { click?: boolean } = {},
  ) => {
    const at = middleOf(element);
    await act(async () => {
      fireEvent.pointerDown(element, finger(at));
      await settleFor(LONG_PRESS_MS + 100);
      await stabilize();
    });
    await act(async () => {
      fireEvent.pointerUp(element, lift(at));
      if (clicks) fireEvent.click(element, { button: 0, ...at });
      await stabilize();
    });
  };
  // A finger's tap on `target` at `at`, with the click the browser makes
  // after unless `click` is off.
  const tap = async (
    target: Element,
    at: { clientX: number; clientY: number } = middleOf(target),
    { click: clicks = true }: { click?: boolean } = {},
  ) => {
    await act(async () => {
      fireEvent.pointerDown(target, finger(at));
      fireEvent.pointerUp(target, lift(at));
      if (clicks) fireEvent.click(target, { button: 0, ...at });
      await stabilize();
    });
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

  // Lets whatever React has queued, such as the canvas's effects, run.
  const settle = async () => {
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
  const clickButton = async (name: string) =>
    click(await screen.findByRole("button", { name }));
  const press = async (target: Element, init: KeyboardEventInit) => {
    await act(async () => {
      fireEvent.keyDown(target, init);
      await stabilize();
    });
  };

  const pane = () => document.querySelector(".react-flow__pane")!;
  // A pointer at a fraction of the way across and down the board.
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
  const pressed = (name: RegExp) =>
    screen.getByRole("button", { name }).getAttribute("aria-pressed");
  const panelText = () =>
    document.querySelector(".react-flow__panel.top.right")?.textContent ?? "";
  // The buttons of the open History or Comments panel, those `selector`
  // picks out.
  const panelButtons = (selector = "button") => [
    ...document.querySelectorAll<HTMLElement>(
      `.react-flow__panel.top.right ${selector}`,
    ),
  ];
  // The Comments panel's row for thread `id`, if it's listed.
  const threadRow = (id: string) =>
    document.querySelector<HTMLElement>(
      `.react-flow__panel.top.right button[data-thread="${id}"]`,
    );
  // The History panel's row whose text `matches`, once it's listed.
  const historyRow = (matches: (text: string) => boolean) =>
    waitFor(
      () => {
        const found = panelButtons().find((b) => matches(b.textContent ?? ""));
        assert.exists(found);
        return found;
      },
      { timeout: 10000 },
    );
  // Opens History and picks the row whose text `matches`.
  const openHistoryRow = async (matches: (text: string) => boolean) => {
    await click(screen.getByRole("button", { name: "History" }));
    const row = await historyRow(matches);
    await click(row);
    return row;
  };
  // What a confirming modal shows, and the same once it's up.
  const modalContent = () =>
    document.querySelector<HTMLElement>(".modal.show .modal-content");
  const modalShown = () =>
    waitFor(() => {
      const found = modalContent();
      assert.exists(found);
      return found;
    });
  // The comment thread's dialog, once it's open showing `text`.
  const threadOpen = (text: string, options?: { timeout: number }) =>
    waitFor(() => {
      const found = document.querySelector<HTMLElement>("dialog[open]");
      assert.ok(found);
      assert.include(found.textContent ?? "", text);
      return found;
    }, options);
  // Types `text` into the board's search box.
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

  const nodeShown = (id: string) =>
    waitFor(
      () => {
        const found = nodeElement(id);
        assert.isNotNull(found);
        return found as HTMLElement;
      },
      { timeout: 20000 },
    );
  const cardsShown = () =>
    waitFor(
      () =>
        assert.isNotNull(document.querySelector(".react-flow__node-puzzle")),
      { timeout: 20000 },
    );
  const select = async (id: string) => {
    await act(async () => {
      fireEvent.click(await nodeShown(id));
      await stabilize();
    });
  };
  // Adds `ids` to the selection: React Flow adds to it while Control is
  // held.
  const selectAlso = async (...ids: string[]) => {
    await act(async () => {
      fireEvent.keyDown(document, { key: "Control", code: "ControlLeft" });
      await stabilize();
    });
    for (const id of ids) {
      await select(id);
    }
    await act(async () => {
      fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });
      await stabilize();
    });
  };
  // Opens `node`'s text, reading `from`, with a double click, then replaces
  // it with `to` and leaves the editor.
  const editText = async (node: HTMLElement, from: string, to: string) => {
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
  // The swatch named `name` in the colour picker's toolbar (not
  // Duplicate's), once it shows.
  const colourSwatch = async (name: string) => {
    const toolbar = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        `.react-flow__node-toolbar:has([aria-label="${name}"])`,
      );
      assert.exists(found);
      return found;
    });
    return within(toolbar).getByRole("button", { name });
  };
  const savedNode = (id: string) => WhiteboardNodes.findOneAsync(id);
  const removeNodes = (nodeIds: string[]) =>
    deleteWhiteboardNodes.callPromise({ boardId, nodeIds });

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
  // Gives React Flow long enough to measure what's changed, then checks
  // its ResizeObserver didn't report a loop to `page`.
  const expectNoResizeLoop = async (page: { errors: string[] }) => {
    await settleFor(500);
    assert.deepEqual(
      page.errors.filter((e) => e.includes("ResizeObserver")),
      [],
    );
  };

  // What openBoard waits for once the page is up. The editing tests wait
  // for the toolbar, then let the canvas's effects, which listen for the
  // keys, run; viewers and phones get a banner instead of a toolbar.
  const editable = async () => {
    await screen.findByRole(
      "button",
      { name: /^Select and move/ },
      { timeout: 20000 },
    );
    await settle();
  };
  const canvasShown = async () => {
    await waitFor(() => assert.isNotNull(pane()), { timeout: 20000 });
    await settle();
  };
  const viewingOnly = () =>
    screen.findByText("Viewing only", {}, { timeout: 20000 });
  const phoneBanner = () =>
    screen.findByText(
      "Editing needs a wider screen. You can still comment.",
      {},
      { timeout: 20000 },
    );
  // Opens the board's page, with `search` on its address, and waits for
  // `until`.
  const openBoard = async ({
    search = "",
    until = editable,
  }: {
    search?: string;
    until?: () => Promise<unknown>;
  } = {}) => {
    render(<TestApp />);
    await goTo(`${boardPath}${search}`);
    await until();
  };

  type Point = { x: number; y: number };
  type Size = { width: number; height: number };
  // Nodes as upsertWhiteboardNodes takes them, at `position` and the size
  // given, with a fresh id unless `extra` brings one.
  const stickyNode = (
    position: Point,
    size: Size,
    extra: { _id?: string; parent?: string; text?: string } = {},
  ) => ({
    _id: Random.id(),
    type: "sticky" as const,
    position,
    ...size,
    ...extra,
  });
  const frameNode = (
    position: Point,
    size: Size,
    extra: {
      _id?: string;
      parent?: string;
      label?: string;
      collapsed?: boolean;
    } = {},
  ) => ({
    _id: Random.id(),
    type: "frame" as const,
    position,
    ...size,
    ...extra,
  });
  const inkNode = (
    position: Point,
    size: Size,
    points: [number, number, number][],
    {
      strokeWidth = "medium",
      color = "black",
      ...extra
    }: {
      _id?: string;
      parent?: string;
      stroke: string;
      strokeWidth?: WhiteboardNodeInput["strokeWidth"];
      color?: WhiteboardNodeInput["color"];
    },
  ) => ({
    _id: Random.id(),
    type: "ink" as const,
    position,
    ...size,
    points,
    strokeWidth,
    color,
    ...extra,
  });
  const shapeNode = (
    position: Point,
    size: Size,
    shape: WhiteboardNodeInput["shape"],
    extra: {
      _id?: string;
      parent?: string;
      color?: WhiteboardNodeInput["color"];
    } = {},
  ) => ({
    _id: Random.id(),
    type: "shape" as const,
    shape,
    position,
    ...size,
    ...extra,
  });
  // A stroke's points, sampled every few units, as a drawn stroke is.
  const sampledStroke = () =>
    Array.from({ length: 41 }, (_, j): [number, number, number] => [
      j * 5,
      10,
      0.5,
    ]);
  // `count` notes in a row from `base`, `gap` apart.
  const stickyRow = (
    base: Point,
    count: number,
    size: Size,
    gap: number,
    text?: (i: number) => string | undefined,
  ) =>
    Array.from({ length: count }, (_, i) =>
      stickyNode({ x: base.x + i * gap, y: base.y }, size, { text: text?.(i) }),
    );
  // Puts nodes on the board, and gives back their ids.
  const putNodes = async (nodes: WhiteboardNodeInput[]) => {
    await upsertWhiteboardNodes.callPromise({ boardId, nodes });
    return nodes.map((n) => n._id);
  };
  // A stroke of two ink segments side by side from `base`, on the board.
  const twoSegmentStroke = async (base: Point) => {
    const stroke = Random.id();
    const segments = [Random.id(), Random.id()];
    await putNodes(
      segments.map((_id, i) =>
        inkNode(
          { x: base.x + i * 200, y: base.y },
          { width: 200, height: 20 },
          sampledStroke(),
          { _id, stroke },
        ),
      ),
    );
    return { stroke, segments };
  };
  // A stroke of one ink segment at `base`, on the board.
  const oneSegmentStroke = async (base: Point) => {
    const stroke = Random.id();
    const segment = Random.id();
    await putNodes([
      inkNode(base, { width: 200, height: 20 }, sampledStroke(), {
        _id: segment,
        stroke,
      }),
    ]);
    return { stroke, segment };
  };
  // A sticky note on the board, by id.
  const addSticky = async (
    position: Point,
    size: Size,
    extra: { text?: string } = {},
  ) => {
    const note = stickyNode(position, size, extra);
    await putNodes([note]);
    return note._id;
  };
  // A frame of our own at `base`, with 160 by 120 notes inside it where
  // given.
  const frameWith = async (base: Point, size: Size, notes: Point[]) => {
    const frame = Random.id();
    const ids = notes.map(() => Random.id());
    await putNodes([
      frameNode(base, size, { _id: frame }),
      ...ids.map((_id, i) =>
        stickyNode(
          notes[i]!,
          { width: 160, height: 120 },
          {
            _id,
            parent: frame,
          },
        ),
      ),
    ]);
    return { frame, notes: ids };
  };

  // A comment on the board from this user, or over `via`, another
  // connection.
  const commentOn = (
    text: string,
    comment: { node?: string; x: number; y: number },
    { via }: { via?: ReturnType<typeof DDP.connect> } = {},
  ) => {
    const message = {
      puzzleId: boardPuzzle,
      content: JSON.stringify({
        type: "message",
        children: [{ text }],
      }),
      comment,
    };
    return via
      ? via.callAsync(sendChatMessage.name, message)
      : sendChatMessage.callPromise(message);
  };
  // The id of the comment `selector` finds, once it has reached this
  // client.
  const commentId = (
    selector: Mongo.Selector<ChatMessageType>,
    timeout: number,
  ) =>
    waitFor(
      async () => {
        const found = await ChatMessages.findOneAsync(selector);
        assert.ok(found);
        return found._id;
      },
      { timeout },
    );

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

    it("has the minimise chat toggle at the top of the board, as on a puzzle's page", async function () {
      this.timeout(30000);
      await ensureBoard();
      render(<TestApp />);
      // The toggle sits in the pane beside chat, whatever that pane shows
      const paneWithToggle = async () => {
        const toggle = await screen.findByRole(
          "button",
          { name: "Minimize chat" },
          { timeout: 20000 },
        );
        // The button, its hover target, then the pane
        return toggle.parentElement!.parentElement!;
      };

      await goTo(`/hunts/${huntId}/puzzles/${FixtureHunt.puzzles[0]!._id}`);
      assert.include(
        (await paneWithToggle()).textContent,
        "Attempting to load collaborative document",
      );
      await goTo(boardPath);
      await waitFor(
        () =>
          assert.isNotNull(document.querySelector(".react-flow__node-frame")),
        { timeout: 20000 },
      );
      const pane = await paneWithToggle();
      assert.isNotNull(pane.querySelector(".react-flow"));

      // Neither the toggle nor, once chat is minimised, its strip covers the
      // board's toolbar
      const toolbar = () =>
        pane
          .querySelector(".react-flow__panel.top.left")!
          .getBoundingClientRect();
      const clearOfToolbar = (chrome: Element, what: string) => {
        const box = chrome.getBoundingClientRect();
        assert.isAbove(box.width, 0, what);
        assert.isAtMost(box.right, toolbar().left, what);
      };
      const toggle = screen.getByRole("button", { name: "Minimize chat" });
      clearOfToolbar(toggle.parentElement!, "the toggle");
      fireEvent.click(toggle);
      await waitFor(() =>
        assert.isNull(screen.queryByRole("button", { name: "Minimize chat" })),
      );
      clearOfToolbar(pane.lastElementChild!, "the minimised chat");
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
      await click(lineTool);
      await waitFor(() => {
        assert.isNull(document.querySelector(".react-flow__node.draggable"));
        assert.isNull(document.querySelector(".react-flow__node.selectable"));
        assert.isNull(
          document.querySelector(".react-flow__handle.connectable"),
        );
      });
      await click(screen.getByTitle(/^Select and move/));
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
      const clickHandle = (handle: Element) => {
        const box = handle.getBoundingClientRect();
        fireEvent.click(handle, {
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        });
      };
      await act(async () => {
        clickHandle(from);
        clickHandle(to);
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
      await putNodes([
        inkNode(
          { x: a.position.x - 20, y: a.position.y - 20 },
          { width, height },
          [
            [0, 0, 0.5],
            [width, 0, 0.5],
            [width, height, 0.5],
            [0, height, 0.5],
          ],
          { _id: ink, parent: frame._id, stroke: Random.id() },
        ),
      ]);
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
        await openBoard({ until: viewingOnly });
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
      before(async function () {
        this.timeout(30000);
        await ensureBoard();
        await commentOn("Is this the meta?", { x: 40, y: -200 });
      });

      it("opens a comment from a ?comment= link, then drops the link", async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(boardPath);
        const thread = await commentId({ comment: { $exists: true } }, 20000);
        await goTo(`${boardPath}?comment=${thread}`);
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
        await click(show);
        await waitFor(() => {
          assert.include(panelText(), "Is this the meta?");
        });
      });
    });

    describe("finding things", function () {
      // Temperance, from the fixture hunt
      const puzzleId = "yZKtXk5oLJMGqwP6E";
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
        await ensureBoard();
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
        await searchFor("temperance");
        const option = await screen.findByRole("option", {
          name: /^Temperance/,
        });
        await click(option);
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
        await click(show);
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
          await click(within(option).getByRole("button", { name: "Put back" }));
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
        await click(within(option).getByRole("button", { name: "Put back" }));
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
          await openBoard({ until: viewingOnly });
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
        const sticky = await addSticky(
          { x: 3000, y: 3000 },
          { width: 160, height: 120 },
          { text: "Linked note" },
        );
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
        await settle();
        const at = paneAt(0.6, 0.6);
        await act(async () => {
          fireEvent.pointerDown(pane(), at);
          fireEvent.pointerUp(pane(), at);
          fireEvent.keyDown(pane(), { key: "/" });
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
        await ensureBoard();
        await commentOn("Soon gone", { x: 777, y: 777 });
        render(<TestApp />);
        await goTo(boardPath);
        const thread = await commentId({ "comment.x": 777 }, 20000);
        await deleteWhiteboardComment.callPromise({ messageId: thread });
        await waitFor(async () => {
          assert.isUndefined(await ChatMessages.findOneAsync(thread));
        });
        await goTo(`${boardPath}?comment=${thread}`);
        await screen.findByText(
          "That comment is gone.",
          {},
          { timeout: 20000 },
        );
        await waitFor(() => assert.equal(location.current?.search, ""));
      });

      describe("the outline", function () {
        // From the fixture hunt
        const gamesIsland = "nPbTi6DPvjAkot94n";
        let roundFrame: string;
        // A collapsed frame of the test's own, with one nested in it, well
        // away from the rounds.
        const outer = Random.id();
        const inner = Random.id();

        before(async function () {
          this.timeout(10000);
          const round = await WhiteboardNodes.findOneAsync({
            board: boardId,
            tag: gamesIsland,
          });
          assert.ok(round);
          roundFrame = round._id;
          await putNodes([
            frameNode(
              { x: 30000, y: 30000 },
              { width: 900, height: 700 },
              { _id: outer, label: "Outline outer" },
            ),
            frameNode(
              { x: 100, y: 120 },
              { width: 400, height: 300 },
              { _id: inner, parent: outer, label: "Outline inner" },
            ),
          ]);
          await putNodes([{ _id: outer, collapsed: true }]);
        });

        after(async function () {
          await deleteWhiteboardNodes.callPromise({
            boardId,
            nodeIds: [inner, outer],
          });
        });

        const openOutline = async () => {
          await screen.findByRole(
            "combobox",
            { name: "Search the board" },
            { timeout: 20000 },
          );
          await act(async () => {
            fireEvent.click(
              await screen.findByRole(
                "button",
                { name: "Outline" },
                { timeout: 20000 },
              ),
            );
            await stabilize();
          });
          return screen.findByRole("tree", { name: "Outline" });
        };
        const row = (name: RegExp) => screen.getByRole("treeitem", { name });

        // The frame is marked, and the view takes all of it in.
        const assertFitted = (frameId: string) => {
          assert.isNotNull(
            document.querySelector(`.jr-node-pulse[data-node="${frameId}"]`),
          );
          const frame = nodeElement(frameId);
          assert.isNotNull(frame);
          const box = frame.getBoundingClientRect();
          const pane = document
            .querySelector(".react-flow__pane")!
            .getBoundingClientRect();
          assert.isAtLeast(box.left, pane.left - 1);
          assert.isAtLeast(box.top, pane.top - 1);
          assert.isAtMost(box.right, pane.right + 1);
          assert.isAtMost(box.bottom, pane.bottom + 1);
        };

        it("lists the rounds with their counts and nesting, and fits the view to one", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          await openOutline();
          const round = await screen.findByRole(
            "treeitem",
            { name: /^games-island/ },
            { timeout: 10000 },
          );
          assert.match(round.textContent ?? "", /\d+\/\d+ solved/);
          assert.equal(round.getAttribute("aria-level"), "1");

          const outerRow = row(/^Outline outer/);
          assert.equal(outerRow.getAttribute("aria-expanded"), "true");
          within(outerRow).getByText("Collapsed on the board");
          const innerRow = row(/^Outline inner/);
          assert.equal(innerRow.getAttribute("aria-level"), "2");
          assert.isNull(innerRow.getAttribute("aria-expanded"));
          const rows = screen.getAllByRole("treeitem");
          assert.equal(rows.indexOf(innerRow), rows.indexOf(outerRow) + 1);

          await click(round);
          await waitFor(() => assertFitted(roundFrame), { timeout: 10000 });
          // The panel stays open beside a wide board, clear of the frame
          const panel = screen
            .getByRole("tree", { name: "Outline" })
            .closest("section")!;
          await waitFor(
            () =>
              assert.isAtMost(
                nodeElement(roundFrame)!.getBoundingClientRect().right,
                panel.getBoundingClientRect().left + 1,
              ),
            { timeout: 10000 },
          );
        });

        it("fits the whole board, follows the board live, and gives focus back on Escape", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          const tree = await openOutline();
          const round = await within(tree).findByRole(
            "treeitem",
            { name: /^games-island/ },
            { timeout: 10000 },
          );
          await click(round);
          await waitFor(() => assertFitted(roundFrame), { timeout: 10000 });
          const viewport = () =>
            document.querySelector<HTMLElement>(".react-flow__viewport")!.style
              .transform;
          // Once the board has stopped moving
          let before = viewport();
          await waitFor(
            () => {
              const now = viewport();
              const settled = now === before;
              before = now;
              assert.isTrue(settled);
            },
            { timeout: 10000, interval: 500 },
          );
          await click(screen.getByRole("button", { name: "Fit whole board" }));
          await waitFor(() => assert.notEqual(viewport(), before), {
            timeout: 10000,
          });

          // A frame added while the panel is open gets a row
          const added = Random.id();
          try {
            await putNodes([
              frameNode(
                { x: 32000, y: 30000 },
                { width: 400, height: 300 },
                { _id: added, label: "Outline added" },
              ),
            ]);
            const addedRow = await screen.findByRole(
              "treeitem",
              { name: /^Outline added/ },
              { timeout: 10000 },
            );

            // Escape from a row closes the panel and focus goes back to
            // its button
            act(() => addedRow.focus());
            await act(async () => {
              fireEvent.keyDown(addedRow, { key: "Escape" });
              await stabilize();
            });
            assert.isNull(screen.queryByRole("tree", { name: "Outline" }));
            assert.equal(
              document.activeElement,
              screen.getByRole("button", { name: "Outline" }),
            );
          } finally {
            await deleteWhiteboardNodes.callPromise({
              boardId,
              nodeIds: [added],
            });
          }
        });

        it("moves between rows with the arrow keys, folds them, and fits on Enter", async function () {
          this.timeout(30000);
          render(<TestApp />);
          await goTo(boardPath);
          await openOutline();
          const outerRow = await screen.findByRole(
            "treeitem",
            { name: /^Outline outer/ },
            { timeout: 10000 },
          );
          act(() => outerRow.focus());
          await press(outerRow, { key: "ArrowDown" });
          assert.equal(document.activeElement, row(/^Outline inner/));
          await press(document.activeElement!, { key: "ArrowLeft" });
          assert.equal(document.activeElement, outerRow);
          await press(outerRow, { key: "ArrowLeft" });
          assert.equal(outerRow.getAttribute("aria-expanded"), "false");
          assert.isNull(
            screen.queryByRole("treeitem", { name: /^Outline inner/ }),
          );
          await press(outerRow, { key: "ArrowRight" });
          assert.equal(outerRow.getAttribute("aria-expanded"), "true");
          await press(outerRow, { key: "ArrowRight" });
          const innerRow = row(/^Outline inner/);
          assert.equal(document.activeElement, innerRow);

          // The frame it's in is collapsed, so it's opened for this viewer
          // first.
          await press(innerRow, { key: "Enter" });
          await waitFor(() => assertFitted(inner), { timeout: 10000 });
        });

        it("works for a viewer on an archived hunt", async function () {
          this.timeout(30000);
          await setHuntArchived.callPromise({ huntId, isArchived: true });
          try {
            await openBoard({ until: viewingOnly });
            await openOutline();
            const round = await screen.findByRole(
              "treeitem",
              { name: /^games-island/ },
              { timeout: 10000 },
            );
            await click(round);
            await waitFor(() => assertFitted(roundFrame), { timeout: 10000 });
          } finally {
            await setHuntArchived.callPromise({ huntId, isArchived: false });
          }
        });

        it("opens as a sheet on a phone, and closes it once a frame is picked", async function () {
          this.timeout(30000);
          const phone = simulatePhone();
          try {
            await openBoard({ until: phoneBanner });
            const tree = await openOutline();
            const sheet = tree.closest(".react-flow__panel.jr-comment-sheet");
            assert.isNotNull(sheet);
            const round = await within(tree).findByRole(
              "treeitem",
              { name: /^games-island/ },
              { timeout: 10000 },
            );
            assert.isAtLeast(round.getBoundingClientRect().height, 44);
            await click(round);
            await waitFor(
              () => {
                assert.isNull(screen.queryByRole("tree", { name: "Outline" }));
                assertFitted(roundFrame);
              },
              { timeout: 10000 },
            );
          } finally {
            phone.restore();
          }
        });
      });
    });

    describe("deleted and replaced puzzles", function () {
      before(async function () {
        this.timeout(10000);
        await ensureBoard();
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
        await click(remove);
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
        await click(option);
        await click(within(dialog).getByRole("button", { name: "Delete" }));

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
        await ensureBoard();
        await commentOn("On the vanishing card", {
          node: card._id,
          x: 5,
          y: 5,
        });
        render(<TestApp />);
        await goTo(boardPath);
        const thread = await commentId({ "comment.node": card._id }, 20000);
        await markPuzzleDeleted.callPromise({ puzzleId });
        await goTo(`${boardPath}?comment=${thread}`);
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

      before(async function () {
        this.timeout(10000);
        await ensureBoard();
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
        await click(card);
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

            await click(
              within(popover).getByRole("button", { name: /Copy answers/ }),
            );
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
            await click(screen.getByRole("button", { name: "History" }));
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
            await viewingOnly();
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
            await phoneBanner();
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
        await ensureBoard();
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
        await click(open);
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
            await openBoard({ until: viewingOnly });
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
          await openBoard({ until: viewingOnly });
          screen.getByText("Only operators can edit this board.");
          assert.exists(screen.getByTitle(/^Comment:/));
          assert.isNull(screen.queryByTitle(/^Select and move/));
          assert.isNull(screen.queryByLabelText("Who can edit"));
        });

        it("lets a viewer download the board", async function () {
          this.timeout(30000);
          const saved: string[] = [];
          const anchorClick = sinon
            .stub(HTMLAnchorElement.prototype, "click")
            .callsFake(function (this: HTMLAnchorElement) {
              if (this.download) saved.push(this.href);
            });
          try {
            await openBoard({ until: viewingOnly });
            await click(screen.getByRole("button", { name: "Download" }));
            await act(async () => {
              fireEvent.click(await screen.findByText("Data (JSON)"));
              await stabilize();
            });
            await waitFor(() => assert.lengthOf(saved, 1), { timeout: 20000 });
            const payload = EJSON.parse(
              await (await fetch(saved[0]!)).text(),
            ) as { nodes: { _id: string }[] };
            assert.include(
              payload.nodes.map((n) => n._id),
              image,
            );
          } finally {
            anchorClick.restore();
          }
        });

        it("offers a non-editor no undo", async function () {
          this.timeout(30000);
          await openBoard({ until: viewingOnly });
          assert.isNull(screen.queryByRole("button", { name: "Undo" }));
          assert.isNull(screen.queryByRole("button", { name: "Redo" }));
        });

        it("gives a viewer on a tablet no editing buttons, and no selecting by long press", async function () {
          this.timeout(30000);
          const coarse = simulateCoarse();
          try {
            await openBoard({ until: viewingOnly });
            const card = await waitFor(
              () => {
                const found = document.querySelector<HTMLElement>(
                  ".react-flow__node-puzzle",
                );
                assert.exists(found);
                return found;
              },
              { timeout: 20000 },
            );
            ["Select area", "Delete", "Copy", "Paste", "Duplicate"].forEach(
              (name) => assert.isNull(screen.queryByRole("button", { name })),
            );
            // nor the hidden input a tap that places a note focuses
            assert.isNull(
              document
                .querySelector(".react-flow")
                ?.parentElement?.querySelector('input[aria-hidden="true"]') ??
                null,
            );
            await pressAndHold(card, { click: false });
            assert.isNull(document.querySelector(".react-flow__node.selected"));
          } finally {
            coarse.restore();
          }
        });

        it("gives a non-editor the Comment key and no other", async function () {
          this.timeout(30000);
          await openBoard({ until: viewingOnly });
          await cardsShown();
          await settle();
          await pressBoard();
          const commentPressed = () => pressed(/^Comment:/);

          await press(pane(), { key: "a", ctrlKey: true });
          assert.isNull(document.querySelector(".react-flow__node.selected"));
          await press(pane(), { key: "c" });
          assert.equal(commentPressed(), "true");
          await press(pane(), { key: "p" });
          assert.equal(commentPressed(), "true");
          await press(pane(), { key: "Escape" });
          assert.equal(commentPressed(), "false");
          assert.isNull(
            screen.queryByRole("button", { name: /^Not on the board/ }),
          );
        });

        it("does nothing with a viewer's copy, paste or duplicate", async function () {
          this.timeout(30000);
          await openBoard({ until: viewingOnly });
          await pressBoard();
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
              pane().dispatchEvent(event);
              pane().dispatchEvent(copy);
              fireEvent.keyDown(pane(), { key: "d", ctrlKey: true });
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
            await putNodes([
              stickyNode(base, { width: 200, height: 160 }, { _id: note }),
            ]);
            await clearWhiteboardVersions.callPromise({ boardId });
            await putNodes([{ _id: note, text: "Changed since" }]);
          } finally {
            await promisify(Meteor.logout)();
            await login(MEMBER_EMAIL, MEMBER_PASSWORD);
          }
          localStorage.setItem(
            `whiteboard:viewport:${boardId}`,
            JSON.stringify({ x: 150 - base.x, y: 150 - base.y, zoom: 1 }),
          );
          try {
            await openBoard({ until: viewingOnly });
            await openHistoryRow((text) => text.startsWith("Before edits by"));
            const shown = await waitFor(
              () => {
                const found = nodeElement(note);
                assert.isNotNull(found);
                return found as HTMLElement;
              },
              { timeout: 10000 },
            );
            await click(shown);
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
          await click(commentTool);
          await pressBoard();
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
          await click(within(panel).getByRole("button", { name: "Send" }));
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
      before(async function () {
        this.timeout(10000);
        await ensureBoard();
        subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
      });

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
        await cardsShown();
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
        const clickHandle = async (handle: Element) => {
          const box = handle.getBoundingClientRect();
          await act(async () => {
            fireEvent.click(handle, {
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
            });
            await stabilize();
          });
        };
        await clickHandle(from);
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
        await clickHandle(to);
        assert.isTrue(to.classList.contains("clickconnecting"));
        await press(document.body, { key: "Escape" });
        assert.equal(await linesBetween(boardId, a._id, b._id), before);
      });

      it("downloads the board as a picture and as data", async function () {
        this.timeout(90000);
        // Well left of everything else, so the picture is narrower without
        // it
        const { data } = await exportWhiteboard.callPromise({
          boardId,
          index: 0,
        });
        const before = EJSON.parse(
          await new Response(
            new Blob([new Uint8Array(data)])
              .stream()
              .pipeThrough(new DecompressionStream("gzip")),
          ).text(),
        ) as {
          nodes: {
            position: { x: number };
            parent?: string;
            hidden?: boolean;
          }[];
        };
        const leftmost = Math.min(
          ...before.nodes
            .filter((n) => !n.parent && !n.hidden)
            .map((n) => n.position.x),
        );
        const ink = Random.id();
        await putNodes([
          {
            _id: ink,
            type: "ink",
            position: { x: leftmost - 2000, y: -200 },
            width: 100,
            height: 20,
            strokeWidth: "thin",
            stroke: Random.id(),
            points: [
              [0, 0, 0.5],
              [50, 20, 0.5],
              [100, 0, 0.5],
            ],
          },
        ]);
        const saved: { href: string; name: string }[] = [];
        const anchorClick = sinon
          .stub(HTMLAnchorElement.prototype, "click")
          .callsFake(function (this: HTMLAnchorElement) {
            if (this.download) {
              saved.push({ href: this.href, name: this.download });
            }
          });
        const callExport = exportWhiteboard.callPromise.bind(exportWhiteboard);
        let letExportGo!: () => void;
        const exportHeld = new Promise<void>((resolve) => {
          letExportGo = resolve;
        });
        const exportStub = sinon
          .stub(exportWhiteboard, "callPromise")
          .callsFake(async (...args: Parameters<typeof callExport>) => {
            await exportHeld;
            return callExport(...args);
          });
        const today = new Date();
        const day = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, "0"),
          String(today.getDate()).padStart(2, "0"),
        ].join("-");
        const hideInk = () => screen.getByRole("button", { name: "Hide ink" });
        // The pixel size of a saved PNG, from its header
        const pngSize = async (href: string) => {
          const bytes = new Uint8Array(await (await fetch(href)).arrayBuffer());
          assert.equal(String.fromCodePoint(...bytes.slice(1, 4)), "PNG");
          const header = new DataView(bytes.buffer);
          return { width: header.getUint32(16), height: header.getUint32(20) };
        };
        const pick = async (choice: string) => {
          await click(screen.getByRole("button", { name: "Download" }));
          await act(async () => {
            fireEvent.click(await screen.findByText(choice));
            await stabilize();
          });
        };
        try {
          await openBoard();
          await cardsShown();

          // Data: busy until the board has come down, then saved whole
          await pick("Data (JSON)");
          const busy = await screen.findByRole("button", {
            name: "Preparing the download",
          });
          assert.isTrue((busy as HTMLButtonElement).disabled);
          letExportGo();
          await waitFor(() => assert.lengthOf(saved, 1), { timeout: 20000 });
          assert.equal(
            saved[0]!.name,
            `Mystery Hunt 2018-whiteboard-${day}.json`,
          );
          const payload = EJSON.parse(
            await (await fetch(saved[0]!.href)).text(),
          ) as {
            format: number;
            nodes: { _id: string; points?: unknown[] }[];
            edges: unknown[];
          };
          assert.equal(payload.format, 1);
          const shown = await WhiteboardNodes.find({
            board: boardId,
          }).fetchAsync();
          assert.includeMembers(
            payload.nodes.map((n) => n._id),
            shown.map((n) => n._id),
          );
          assert.lengthOf(
            payload.nodes.find((n) => n._id === ink)?.points ?? [],
            3,
          );
          await screen.findByRole("button", { name: "Download" });

          // A picture of everything drawn, at twice its size up to the cap
          await pick("Picture (PNG)");
          await waitFor(() => assert.lengthOf(saved, 2), { timeout: 30000 });
          const png = saved[1]!;
          assert.equal(png.name, `Mystery Hunt 2018-whiteboard-${day}.png`);
          assert.match(png.href, /^blob:/);
          const size = await pngSize(png.href);
          // What's drawn, from the nodes at the top level (the rest are
          // inside frames)
          const top = shown.filter(
            (n) =>
              !n.parent &&
              !n.hidden &&
              n.width !== undefined &&
              n.height !== undefined,
          );
          const expectSize = (drawn: typeof top) => {
            const left = Math.min(...drawn.map((n) => n.position.x));
            const right = Math.max(
              ...drawn.map((n) => n.position.x + n.width!),
            );
            const upper = Math.min(...drawn.map((n) => n.position.y));
            const lower = Math.max(
              ...drawn.map((n) => n.position.y + n.height!),
            );
            const width = right - left + 80;
            const height = lower - upper + 80;
            const scale = Math.min(2, 8192 / Math.max(width, height));
            return { width: width * scale, height: height * scale };
          };
          const expected = expectSize(top);
          assert.isAtMost(Math.max(size.width, size.height), 8192);
          assert.approximately(
            size.width,
            expected.width,
            expected.width * 0.15,
          );
          assert.approximately(
            size.height,
            expected.height,
            expected.height * 0.15,
          );
          // with the board drawn on it, on the board's background
          const picture = new Image();
          picture.src = png.href;
          await picture.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 200;
          canvas.height = Math.max(
            1,
            Math.round((200 * size.height) / size.width),
          );
          const context = canvas.getContext("2d")!;
          context.drawImage(picture, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          // The corner is background, white give or take the scaling down
          pixels.subarray(0, 3).forEach((channel) => {
            assert.isAtLeast(channel, 245);
          });
          const colours = new Set<number>();
          for (let i = 0; i < pixels.length; i += 4) {
            colours.add(
              (pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!,
            );
          }
          assert.isAbove(colours.size, 10);

          // With ink hidden, the picture leaves the ink out, as the board does
          await click(hideInk());
          assert.equal(hideInk().getAttribute("aria-pressed"), "true");
          await pick("Picture (PNG)");
          await waitFor(() => assert.lengthOf(saved, 3), { timeout: 30000 });
          const withoutInk = await pngSize(saved[2]!.href);
          const expectedWithoutInk = expectSize(
            top.filter((n) => n._id !== ink),
          );
          assert.isBelow(withoutInk.width, size.width);
          assert.approximately(
            withoutInk.width,
            expectedWithoutInk.width,
            expectedWithoutInk.width * 0.15,
          );
        } finally {
          anchorClick.restore();
          exportStub.restore();
          letExportGo();
          if (
            screen
              .queryByRole("button", { name: "Hide ink" })
              ?.getAttribute("aria-pressed") === "true"
          ) {
            await click(hideInk());
          }
          await deleteWhiteboardNodes.callPromise({ boardId, nodeIds: [ink] });
        }
      });

      describe("comment threads", function () {
        before(async function () {
          this.timeout(10000);
          await ensureBoard();
          await commentOn("Keyboard thread", { x: 4321, y: 4321 });
        });

        // Opens the board at a comment, found once the board's chat has
        // loaded.
        const openAtComment = async (x: number) => {
          await openBoard();
          const id = await commentId({ "comment.x": x }, 20000);
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
          const panel = await threadOpen("Keyboard thread", { timeout: 20000 });
          assert.equal(
            panel.getAttribute("aria-label"),
            "Comment on the board",
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
          const panel = await threadOpen("Keyboard thread", { timeout: 20000 });
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
            const panel = await threadOpen("Keyboard thread", {
              timeout: 20000,
            });
            await click(within(panel).getByRole("button", { name: "Resolve" }));
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
            await click(screen.getByRole("button", { name: /^Comment:/ }));
            await pressBoard();
            const panel = await threadOpen("New comment on");
            await typeInto(
              panel.querySelector<HTMLElement>("[data-slate-editor]")!,
              "Refused words",
            );
            await click(within(panel).getByRole("button", { name: "Send" }));
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

          await click(screen.getByRole("button", { name: /^Comment:/ }));
          await pressBoard();
          await waitFor(() => assert.include(panelText(), "New comment on"));
          await press(document.body, { key: "Escape" });
          await waitFor(() => assert.notInclude(panelText(), "New comment on"));
          assert.equal(pressed(/^Select and move/), "true");
        });

        it("asks before deleting a comment, and leaves it on cancel", async function () {
          this.timeout(30000);
          await ensureBoard();
          await commentOn("Delete me", { x: 5432, y: 5432 });
          const doomed = await openAtComment(5432);
          await waitFor(() => assert.include(panelText(), "Delete me"), {
            timeout: 20000,
          });
          const deleteButton = () =>
            within(
              document.querySelector<HTMLElement>("dialog[open]")!,
            ).getByRole("button", { name: "Delete" });
          const modal = () => document.querySelector<HTMLElement>(".modal");

          await click(deleteButton());
          await screen.findByText(
            "Delete this comment and every reply to it? This can't be undone.",
          );
          await click(within(modal()!).getByRole("button", { name: "Cancel" }));
          await waitFor(() => assert.isNull(modal()));
          assert.exists(await ChatMessages.findOneAsync(doomed));
          assert.include(panelText(), "Delete me");

          await click(deleteButton());
          await waitFor(() => assert.isNotNull(modal()));
          await click(within(modal()!).getByRole("button", { name: "Delete" }));
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
        await click(toggle);
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
        await click(rowFor(tag!.name.replace(/^group:/, "")));
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
        await click(rowFor(firstLabel));
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
          await click(
            screen.getByRole("button", { name: "Show feeder arrows" }),
          );
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

        await click(
          within(sidePanel()).getByRole("button", {
            name: "Put back all feeder arrows",
          }),
        );
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
        const sticky = await addSticky(
          { x: 6000, y: 6000 },
          { width: 200, height: 160 },
          { text: "Original" },
        );
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
          await editText(note, "Original", "Changed");
          await screen.findByText(
            "Couldn't save: Only operators can edit this whiteboard",
          );
          within(note).getByText("Changed");
          const retry = within(note).getByRole("button", { name: "Retry" });

          refuse.restore();
          await click(retry);
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

      it("erases a whole stroke from a press on any part of it", async function () {
        this.timeout(30000);
        const base = { x: 20000, y: 20000 };
        const { segments } = await twoSegmentStroke(base);
        const screenAt = lookAt(base);
        try {
          await openBoard();
          await nodeShown(segments[0]!);
          await click(screen.getByRole("button", { name: "Erase strokes" }));
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

      it("hides ink, and stops receiving its points, until it's shown again or the pen is picked up", async function () {
        this.timeout(30000);
        const stroke = Random.id();
        const segment = Random.id();
        const note = Random.id();
        const base = { x: 20500, y: 20000 };
        await putNodes([
          stickyNode(
            { x: base.x, y: base.y + 100 },
            { width: 160, height: 120 },
            { _id: note },
          ),
          inkNode(
            base,
            { width: 200, height: 40 },
            [
              [0, 0, 0.5],
              [100, 40, 0.5],
              [200, 0, 0.5],
            ],
            { _id: segment, stroke },
          ),
        ]);
        // Hidden ink still comes, as outlines without points
        const inkReceived = () =>
          WhiteboardNodes.find({
            board: boardId,
            type: "ink",
            points: { $exists: true },
          }).countAsync();
        const outlineReceived = async () =>
          !!(await WhiteboardNodes.findOneAsync(segment));
        const hideInk = () => screen.getByRole("button", { name: "Hide ink" });
        lookAt(base);
        try {
          await openBoard();
          await nodeShown(segment);
          assert.equal(hideInk().getAttribute("aria-pressed"), "false");

          await click(hideInk());
          assert.equal(hideInk().getAttribute("aria-pressed"), "true");
          await waitFor(
            async () => {
              assert.isNull(nodeElement(segment));
              assert.equal(await inkReceived(), 0);
              assert.isTrue(await outlineReceived());
            },
            { timeout: 10000 },
          );
          // Everything else is still there
          assert.isNotNull(nodeElement(note));

          await click(hideInk());
          await nodeShown(segment);
          assert.isAbove(await inkReceived(), 0);

          await click(hideInk());
          await waitFor(() => assert.isNull(nodeElement(segment)), {
            timeout: 10000,
          });
          await click(screen.getByRole("button", { name: /^Draw/ }));
          await nodeShown(segment);
          assert.equal(hideInk().getAttribute("aria-pressed"), "false");
        } finally {
          localStorage.removeItem("whiteboard:hideInk");
          forgetView();
          await removeNodes([segment, note]);
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
          await click(screen.getByRole("button", { name: /^Frame:/ }));
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
        await putNodes([
          frameNode(
            base,
            { width: 600, height: 400 },
            { _id: frame, label: "Resize me" },
          ),
          stickyNode(
            { x: 100, y: 100 },
            { width: 200, height: 160 },
            { _id: sticky, parent: frame },
          ),
        ]);
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

      it("resizes a frame and a note without React Flow reporting a resize loop", async function () {
        this.timeout(30000);
        const frame = Random.id();
        const sticky = Random.id();
        const base = { x: 22000, y: 23000 };
        await putNodes([
          frameNode(
            base,
            { width: 600, height: 400 },
            { _id: frame, label: "Resize me" },
          ),
          stickyNode(
            { x: 100, y: 100 },
            { width: 200, height: 160 },
            { _id: sticky, parent: frame, text: "Resize me too" },
          ),
        ]);
        // Zoomed so that the sizes a drag sets aren't whole pixels
        const zoom = 0.73;
        lookAt({ x: base.x - 200, y: base.y - 100 }, zoom);
        const page = collectPageErrors();
        try {
          await openBoard();
          // Drags a corner handle in steps, with a frame drawn between them
          const drag = async (id: string, dx: number, dy: number) => {
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
            const mouse = { button: 0, view: window };
            await act(async () => {
              fireEvent.mouseDown(corner, { ...mouse, ...start });
              await stabilize();
            });
            for (let step = 1; step <= 5; step++) {
              await act(async () => {
                fireEvent.mouseMove(window, {
                  ...mouse,
                  clientX: start.clientX + (dx * step) / 5,
                  clientY: start.clientY + (dy * step) / 5,
                });
                await new Promise((resolve) => {
                  requestAnimationFrame(() => setTimeout(resolve, 20));
                });
              });
            }
            await act(async () => {
              fireEvent.mouseUp(window, {
                ...mouse,
                clientX: start.clientX + dx,
                clientY: start.clientY + dy,
              });
              await stabilize();
            });
          };
          await drag(frame, 100, 50);
          await drag(sticky, 40, 20);
          await waitFor(
            async () => {
              assert.closeTo(
                (await savedNode(frame))?.width ?? 0,
                600 + 100 / zoom,
                1,
              );
              assert.closeTo(
                (await savedNode(sticky))?.height ?? 0,
                160 + 20 / zoom,
                1,
              );
            },
            { timeout: 10000 },
          );
          await expectNoResizeLoop(page);
        } finally {
          page.stop();
          forgetView();
          await removeNodes([sticky, frame]);
        }
      });

      it("keeps hidden ink still when its frame is resized from the top left", async function () {
        this.timeout(30000);
        const frame = Random.id();
        const segment = Random.id();
        const base = { x: 22000, y: 23000 };
        await putNodes([
          frameNode(
            base,
            { width: 600, height: 400 },
            { _id: frame, label: "Inky frame" },
          ),
          inkNode(
            { x: 100, y: 100 },
            { width: 200, height: 40 },
            [
              [0, 0, 0.5],
              [100, 40, 0.5],
              [200, 0, 0.5],
            ],
            { _id: segment, parent: frame, stroke: Random.id() },
          ),
        ]);
        localStorage.setItem("whiteboard:hideInk", "true");
        lookAt({ x: base.x - 200, y: base.y - 100 });
        try {
          await openBoard();
          await nodeShown(frame);
          // Hidden, but there to be moved
          await waitFor(
            async () =>
              assert.exists(await WhiteboardNodes.findOneAsync(segment)),
            { timeout: 10000 },
          );
          assert.isNull(nodeElement(segment));
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
          const to = {
            clientX: start.clientX - 100,
            clientY: start.clientY - 50,
          };
          const mouse = { button: 0, view: window };
          await act(async () => {
            fireEvent.mouseDown(corner, { ...mouse, ...start });
            await stabilize();
          });
          await act(async () => {
            fireEvent.mouseMove(window, { ...mouse, ...to });
            await stabilize();
          });
          await act(async () => {
            fireEvent.mouseUp(window, { ...mouse, ...to });
            await stabilize();
          });
          await waitFor(
            async () => {
              const resized = await savedNode(frame);
              const ink = await savedNode(segment);
              assert.closeTo(resized?.position.x ?? 0, base.x - 100, 1);
              assert.closeTo(
                (resized?.position.x ?? 0) + (ink?.position.x ?? 0),
                base.x + 100,
                1,
              );
              assert.closeTo(
                (resized?.position.y ?? 0) + (ink?.position.y ?? 0),
                base.y + 100,
                1,
              );
            },
            { timeout: 10000 },
          );
        } finally {
          localStorage.removeItem("whiteboard:hideInk");
          forgetView();
          await removeNodes([segment, frame]);
        }
      });

      it("saves edits and colour changes to notes and text", async function () {
        this.timeout(30000);
        const sticky = Random.id();
        const text = Random.id();
        const base = { x: 23000, y: 23000 };
        await putNodes([
          stickyNode(
            base,
            { width: 200, height: 160 },
            { _id: sticky, text: "Before" },
          ),
          {
            _id: text,
            type: "text",
            position: { x: base.x + 300, y: base.y },
            width: 240,
            height: 48,
            text: "Words",
          },
        ]);
        lookAt(base);
        const edit = async (id: string, from: string, to: string) =>
          editText(await nodeShown(id), from, to);
        const recolour = async (id: string, colour: string) => {
          await select(id);
          await click(await colourSwatch(colour));
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
        await putNodes(
          ids.map((_id, i) =>
            stickyNode(
              { x: base.x + xs[i]!, y: base.y + ys[i]! },
              { width: 100, height: 80 },
              { _id },
            ),
          ),
        );
        lookAt(base);
        try {
          await openBoard();
          await select(ids[0]!);
          await selectAlso(ids[1]!, ids[2]!);
          const arrange = async (name: string) => {
            const button = await screen.findByRole("button", { name });
            await click(button);
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
        await ensureBoard();
        localStorage.setItem("whiteboard:showResolvedComments", "false");
        lookAt({ x: 25000, y: 25000 });
        let thread: string | undefined;
        const pin = () =>
          document.querySelector(`.jr-comment-pin[data-thread="${thread}"]`);
        const toggle = () =>
          click(
            screen.getByRole("button", { name: /^Show resolved comments/ }),
          );
        try {
          await openBoard();
          await commentOn("All sorted", { x: 25000, y: 25000 });
          thread = await commentId({ "comment.x": 25000 }, 10000);
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
        await cardsShown();
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
          await click(screen.getByRole("button", { name: "Zoom in" }));
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
        await putNodes([
          frameNode(base, { width: 400, height: 300 }, { _id: frame }),
          // Its middle is 20 past the frame's right edge
          stickyNode(
            { x: base.x + 420, y: base.y + 100 },
            { width: 100, height: 80 },
            { _id: sticky },
          ),
        ]);
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
        const onScreen = async (id: string) => {
          const box = (await nodeShown(id)).getBoundingClientRect();
          return { left: box.left, top: box.top };
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
          const note = await addSticky(
            { x: base.x + 600, y: base.y + 100 },
            { width: 100, height: 80 },
          );
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
          await putNodes([
            stickyNode(
              notePosition,
              { width: 160, height: 120 },
              { _id: note, parent: frame._id },
            ),
            { _id: a._id, position: away },
          ]);
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
          await putNodes([
            stickyNode(
              { x: 280, y: 100 },
              { width: 100, height: 80 },
              { _id: note, parent: frame },
            ),
          ]);
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
            await settleFor(500);
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
          await putNodes([
            stickyNode(
              { x: 280, y: 100 },
              { width: 100, height: 80 },
              { _id: note, parent: frame },
            ),
          ]);
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
            await expectNoResizeLoop(page);
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
          await putNodes([
            { _id: frame, locked: true },
            // Its middle is 20 past the frame's right edge
            stickyNode(
              { x: base.x + 420, y: base.y + 100 },
              { width: 100, height: 80 },
              { _id: note },
            ),
          ]);
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
          const id = await addSticky(base, { width: 160, height: 120 });
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
          const id = await addSticky(
            base,
            { width: 160, height: 120 },
            { text: "Before" },
          );
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

            await editText(await nodeShown(id), "Before", "After");
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
          await putNodes([
            frameNode(
              base,
              { width: 400, height: 300 },
              { _id: frame, label: "Fold me" },
            ),
          ]);
          lookAt(base);
          const collapsed = async () => !!(await savedNode(frame))?.collapsed;
          try {
            await openBoard();
            const node = await nodeShown(frame);
            await click(
              within(node).getByRole("button", {
                name: "Collapse for everyone",
              }),
            );
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
          // Ink is only received while the board is open
          let before = new Set<string>();
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
            before = new Set(
              (
                await WhiteboardNodes.find({
                  board: boardId,
                  type: "ink",
                }).fetchAsync()
              ).map((n) => n._id),
            );
            await click(screen.getByRole("button", { name: /^Draw/ }));
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
          const id = await addSticky(base, { width: 160, height: 120 });
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
          const id = await addSticky(base, { width: 160, height: 120 });
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
          const id = await addSticky(base, { width: 160, height: 120 });
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
          const id = await addSticky(
            base,
            { width: 160, height: 120 },
            { text: "Words" },
          );
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
          const id = await addSticky(base, { width: 160, height: 120 });
          lookAt(base);
          try {
            await openBoard();
            await select(id);
            const red = await colourSwatch("Red");
            const blue = await colourSwatch("Blue");
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
        const stickyAt = (position: Point, text: string) =>
          addSticky(position, { width: 160, height: 120 }, { text });
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
            await selectAlso(b);

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
            await click(screen.getByRole("button", { name: "Duplicate" }));
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
            await selectAlso(note);
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
          await putNodes([
            frameNode(base, { width: 400, height: 300 }, { _id: frame, label }),
            stickyNode(
              { x: 40, y: 60 },
              { width: 160, height: 120 },
              { _id: inside, parent: frame, text },
            ),
          ]);
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
          const inside = (_id: string, x: number) =>
            stickyNode(
              { x, y: 60 },
              { width: 120, height: 100 },
              { _id, parent: frame, text: `In ${label}` },
            );
          await putNodes([
            frameNode(
              base,
              { width: 400, height: 300 },
              { _id: frame, label, collapsed: true },
            ),
            inside(a, 20),
            inside(b, 220),
          ]);
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
          await putNodes([
            frameNode(base, { width: 600, height: 500 }, { _id: outer }),
            frameNode(
              { x: 200, y: 150 },
              { width: 300, height: 250 },
              { _id: locked, parent: outer },
            ),
          ]);
          await putNodes([{ _id: locked, locked: true }]);
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

        it("leaves out images from another hunt and pastes the rest", async function () {
          this.timeout(30000);
          const base = { x: 39000, y: 30000 };
          const note = `Kept ${Random.id()}`;
          const foreignUrl = `https://s3.${TEST_BUCKET.bucketRegion}.amazonaws.com/${TEST_BUCKET.bucketName}/${Random.id()}/${Random.id()}/${Random.id()}`;
          const copied = `jolly-roger-whiteboard/1\n${JSON.stringify({
            nodes: [
              {
                id: "note",
                type: "sticky",
                x: 0,
                y: 0,
                width: 160,
                height: 120,
                text: note,
              },
              {
                id: "picture",
                type: "image",
                x: 200,
                y: 0,
                width: 300,
                height: 150,
                image: { url: foreignUrl, width: 600, height: 300 },
              },
            ],
            edges: [{ source: "note", target: "picture" }],
          })}`;
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            const pasted = await clipboard("paste", copied);
            assert.isTrue(pasted.event.defaultPrevented);
            await screen.findByText("Images from another hunt were left out");
            await waitFor(
              async () =>
                assert.exists(
                  await WhiteboardNodes.findOneAsync({
                    board: boardId,
                    text: note,
                  }),
                ),
              { timeout: 10000 },
            );
            assert.notExists(
              await WhiteboardNodes.findOneAsync({
                board: boardId,
                "image.url": foreignUrl,
              }),
            );
          } finally {
            forgetView();
            const left = await WhiteboardNodes.find({
              board: boardId,
              text: note,
            }).fetchAsync();
            await removeNodes(left.map((n) => n._id));
          }
        });

        it("refuses a paste with more ink than the board has room for", async function () {
          this.timeout(30000);
          const base = { x: 41000, y: 30000 };
          const note = `Inky ${Random.id()}`;
          const copied = `jolly-roger-whiteboard/1\n${JSON.stringify({
            nodes: [
              {
                id: "note",
                type: "sticky",
                x: 0,
                y: 0,
                width: 160,
                height: 120,
                text: note,
              },
              {
                id: "line",
                type: "ink",
                x: 200,
                y: 0,
                width: 200,
                height: 20,
                strokeWidth: "thin",
                stroke: "stroke",
                points: Array.from({ length: 20 }, (_, i) => [
                  i * 10,
                  (i % 2) * 10,
                  0.5,
                ]),
              },
            ],
            edges: [],
          })}`;
          // With ink hidden, the filler's points aren't sent to the client
          localStorage.setItem("whiteboard:hideInk", "true");
          const filler = await fillInk.callPromise({ boardId, spare: 5 });
          lookAt(base);
          try {
            await openBoard();
            await pressBoard();
            await clipboard("paste", copied);
            await screen.findByText(
              "Couldn't save: This board has as much drawing as it can hold",
            );
            assert.isEmpty(await withText([note]).fetchAsync());
            assert.isTrue(undoButton().disabled);
          } finally {
            localStorage.removeItem("whiteboard:hideInk");
            forgetView();
            await removeNodes([filler]);
            const left = await withText([note]).fetchAsync();
            await removeNodes(left.map((n) => n._id));
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
            await selectAlso(b);
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
              await click(imageButton());
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
          const screenAt = lookAt(base);
          try {
            await openWithImages();
            await pressBoard();
            const at = { x: base.x + 300, y: base.y + 200 };
            await act(async () => {
              fireEvent.pointerMove(pane(), {
                pointerId: 1,
                ...screenAt(at.x, at.y),
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
          const screenAt = lookAt(base);
          try {
            await openWithImages();
            const at = { x: base.x + 250, y: base.y + 150 };
            const data = new DataTransfer();
            data.items.add(await pngFile(120, 80));
            const init = {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
              ...screenAt(at.x, at.y),
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
            await click(screen.getByRole("button", { name: /^Comment:/ }));
            await pressBoard();
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
            await settleFor(500);
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

      describe("highlighter and shapes", function () {
        it("draws a highlighter stroke over a card, see-through, and erases it", async function () {
          this.timeout(30000);
          const { a } = await sideBySideCards(boardId);
          let before = new Set<string>();
          const drawn = async () =>
            (
              await WhiteboardNodes.find({
                board: boardId,
                type: "ink",
              }).fetchAsync()
            ).filter((n) => !before.has(n._id));
          try {
            await openBoard();
            before = new Set(
              (
                await WhiteboardNodes.find({
                  board: boardId,
                  type: "ink",
                }).fetchAsync()
              ).map((n) => n._id),
            );
            await pressBoard();
            await press(pane(), { key: "p" });
            await press(pane(), { key: "4" });
            assert.equal(
              screen.getByRole<HTMLSelectElement>("combobox", {
                name: "Pen width",
              }).value,
              "marker",
            );
            assert.include(
              screen.getByRole("combobox", { name: "Pen width" }).textContent,
              "Highlighter",
            );
            // Across the middle of the card
            const card = (await nodeShown(a._id)).getBoundingClientRect();
            const y = card.top + card.height / 2;
            const point = (x: number) => ({
              button: 0,
              buttons: 1,
              pointerId: 1,
              clientX: x,
              clientY: y,
            });
            const xs = [20, 60, 100, 140, 180].map((dx) => card.left + dx);
            await act(async () => {
              fireEvent.pointerDown(pane(), point(xs[0]!));
              await stabilize();
            });
            // Translucent while it's drawn, too
            const live = document.querySelector(
              ".react-flow__viewport-portal svg path",
            );
            assert.equal(live?.getAttribute("fill-opacity"), "0.4");
            for (const x of xs.slice(1)) {
              await act(async () => {
                fireEvent.pointerMove(pane(), point(x));
                await stabilize();
              });
            }
            await act(async () => {
              fireEvent.pointerUp(pane(), { ...point(xs.at(-1)!), buttons: 0 });
              await stabilize();
            });
            const [segment] = await waitFor(
              async () => {
                const segments = await drawn();
                assert.lengthOf(segments, 1);
                return segments;
              },
              { timeout: 10000 },
            );
            assert.equal(segment!.strokeWidth, "marker");

            const node = await nodeShown(segment!._id);
            const path = await waitFor(() => {
              const found = node.querySelector("svg.jr-ink-marker path");
              assert.isNotNull(found);
              return found;
            });
            assert.equal(path.getAttribute("fill-opacity"), "0.4");
            // The whole node blends with the card under it
            assert.equal(
              window.getComputedStyle(node).mixBlendMode,
              "multiply",
            );
            // On top of the card, which still shows through it
            const stack = document.elementsFromPoint(xs[2]!, y);
            const strokeAt = stack.findIndex((el) => node.contains(el));
            const cardAt = stack.findIndex((el) =>
              nodeElement(a._id)!.contains(el),
            );
            assert.isAtLeast(strokeAt, 0);
            assert.isAbove(cardAt, strokeAt);

            await click(screen.getByRole("button", { name: "Erase strokes" }));
            await act(async () => {
              fireEvent.pointerDown(pane(), point(xs[2]!));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerUp(pane(), { ...point(xs[2]!), buttons: 0 });
              await stabilize();
            });
            await waitFor(async () => assert.isEmpty(await drawn()), {
              timeout: 10000,
            });
            assert.exists(await savedNode(a._id));
          } finally {
            forgetView();
            localStorage.removeItem("whiteboard:penWidth");
            const left = (await drawn()).map((n) => n._id);
            if (left.length > 0) await removeNodes(left);
          }
        });

        it("places, recolours, joins, locks and duplicates shapes, and undoes", async function () {
          this.timeout(60000);
          const base = { x: 34000, y: 34000 };
          const screenAt = lookAt(base);
          const shapes = () =>
            WhiteboardNodes.find({
              board: boardId,
              type: "shape",
              "position.x": { $gte: base.x - 500, $lte: base.x + 1500 },
              "position.y": { $gte: base.y - 500, $lte: base.y + 1500 },
            }).fetchAsync();
          const at = (x: number, y: number) => ({
            button: 0,
            buttons: 1,
            pointerId: 1,
            ...screenAt(x, y),
          });
          const pickShape = async () => {
            await click(screen.getByRole("button", { name: /^Shape:/ }));
          };
          let rect: string | undefined;
          try {
            await openBoard();
            await pickShape();
            const kind = screen.getByRole<HTMLSelectElement>("combobox", {
              name: "Shape",
            });
            assert.equal(kind.value, "rect");
            // A click places a rectangle of the default size, centred on it
            await act(async () => {
              fireEvent.pointerDown(pane(), at(base.x + 100, base.y + 100));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerUp(pane(), {
                ...at(base.x + 100, base.y + 100),
                buttons: 0,
              });
              await stabilize();
            });
            const placed = await waitFor(
              async () => {
                const [found, ...more] = await shapes();
                assert.ok(found);
                assert.isEmpty(more);
                return found;
              },
              { timeout: 10000 },
            );
            rect = placed._id;
            assert.equal(placed.shape, "rect");
            assert.deepEqual(placed.position, {
              x: base.x + 20,
              y: base.y + 40,
            });
            assert.equal(placed.width, 160);
            assert.equal(placed.height, 120);
            assert.isUndefined(placed.color);
            assert.equal(pressed(/^Select and move/), "true");
            const rectSvg = (await nodeShown(rect)).querySelector(
              "svg.jr-shape rect",
            );
            assert.equal(rectSvg?.getAttribute("fill"), "none");

            // A drag makes an ellipse its size
            await pickShape();
            await act(async () => {
              fireEvent.change(
                screen.getByRole("combobox", { name: "Shape" }),
                { target: { value: "ellipse" } },
              );
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerDown(pane(), at(base.x + 400, base.y));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerMove(pane(), at(base.x + 600, base.y + 100));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerUp(pane(), {
                ...at(base.x + 600, base.y + 100),
                buttons: 0,
              });
              await stabilize();
            });
            const ellipse = await waitFor(
              async () => {
                const found = (await shapes()).find((n) => n._id !== rect);
                assert.ok(found);
                return found;
              },
              { timeout: 10000 },
            );
            assert.equal(ellipse.shape, "ellipse");
            assert.deepEqual(ellipse.position, { x: base.x + 400, y: base.y });
            assert.equal(ellipse.width, 200);
            assert.equal(ellipse.height, 100);
            await nodeShown(ellipse._id);

            // Recoloured, it's filled in the pastel
            await select(ellipse._id);
            await click(await colourSwatch("Blue"));
            await waitFor(
              async () =>
                assert.equal((await savedNode(ellipse._id))?.color, "blue"),
              { timeout: 10000 },
            );
            await waitFor(() =>
              assert.equal(
                nodeElement(ellipse._id)
                  ?.querySelector("svg.jr-shape ellipse")
                  ?.getAttribute("fill"),
                "#d0ebff",
              ),
            );

            // No fill takes the colour away again
            const shapeFill = () =>
              nodeElement(ellipse._id)
                ?.querySelector("svg.jr-shape ellipse")
                ?.getAttribute("fill");
            assert.equal(
              (await colourSwatch("No fill")).getAttribute("aria-pressed"),
              "false",
            );
            await click(await colourSwatch("No fill"));
            await waitFor(
              async () =>
                assert.isUndefined((await savedNode(ellipse._id))?.color),
              { timeout: 10000 },
            );
            await waitFor(() => assert.equal(shapeFill(), "none"));
            assert.equal(
              (await colourSwatch("No fill")).getAttribute("aria-pressed"),
              "true",
            );
            await click(await colourSwatch("Blue"));
            await waitFor(
              async () =>
                assert.equal((await savedNode(ellipse._id))?.color, "blue"),
              { timeout: 10000 },
            );

            // The line tool joins them
            await click(screen.getByRole("button", { name: /^Line:/ }));
            await act(async () => {
              fireEvent.pointerDown(pane(), at(base.x + 100, base.y + 100));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerMove(pane(), at(base.x + 500, base.y + 50));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerUp(pane(), {
                ...at(base.x + 500, base.y + 50),
                buttons: 0,
              });
              await stabilize();
            });
            await waitFor(
              async () =>
                assert.equal(
                  await linesBetween(boardId, rect!, ellipse._id),
                  1,
                ),
              { timeout: 10000 },
            );
            await press(pane(), { key: "v" });

            // Locked, it shows the padlock
            const rectNode = await nodeShown(rect);
            await select(rect);
            await act(async () => {
              rectNode.focus();
              await stabilize();
            });
            await press(rectNode, { key: "l", ctrlKey: true });
            await waitFor(
              async () => assert.isTrue((await savedNode(rect!))?.locked),
              { timeout: 10000 },
            );
            await waitFor(() =>
              assert.exists(
                nodeElement(rect!)?.querySelector(".jr-lock-badge"),
              ),
            );

            // Duplicated, then undone
            await select(ellipse._id);
            await press(pane(), { key: "d", ctrlKey: true });
            const copy = await waitFor(
              async () => {
                const found = (await shapes()).find(
                  (n) => n._id !== rect && n._id !== ellipse._id,
                );
                assert.ok(found);
                return found;
              },
              { timeout: 10000 },
            );
            assert.equal(copy.shape, "ellipse");
            assert.equal(copy.color, "blue");
            assert.deepEqual(copy.position, {
              x: ellipse.position.x + 24,
              y: ellipse.position.y + 24,
            });
            await waitFor(
              () =>
                assert.isFalse(
                  screen.getByRole<HTMLButtonElement>("button", {
                    name: "Undo",
                  }).disabled,
                ),
              { timeout: 10000 },
            );
            // The duplicate's save is back, so it's the edit Undo takes
            await nodeShown(copy._id);
            await clearPuzzleSubscribers.callPromise({ userIds: [] });
            await press(pane(), { key: "z", ctrlKey: true });
            await waitFor(async () => assert.notOk(await savedNode(copy._id)), {
              timeout: 10000,
            });
            assert.lengthOf(await shapes(), 2);
          } finally {
            forgetView();
            localStorage.removeItem("whiteboard:shapeKind");
            if (rect) {
              await upsertWhiteboardNodes.callPromise({
                boardId,
                nodes: [{ _id: rect, locked: false }],
              });
            }
            await removeNodes((await shapes()).map((n) => n._id));
          }
        });

        it("keeps a filled shape under the cards in it, selected or not", async function () {
          this.timeout(30000);
          const { a, b, frame } = await sideBySideCards(boardId);
          const shape = Random.id();
          await putNodes([
            shapeNode(
              { x: a.position.x - 20, y: a.position.y - 20 },
              { width: CARD_WIDTH + 40, height: CARD_HEIGHT + 40 },
              "rect",
              { _id: shape, parent: frame._id, color: "blue" },
            ),
          ]);
          const linesFromB = async () =>
            (
              await WhiteboardEdges.find({
                board: boardId,
                source: b._id,
                auto: { $ne: true },
              }).fetchAsync()
            ).map((e) => e._id);
          const before = new Set(await linesFromB());
          const middleOf = (id: string) => {
            const box = nodeElement(id)!.getBoundingClientRect();
            return {
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
            };
          };
          // The card is on top at its middle, so it takes clicks there.
          const cardOnTop = () => {
            const { clientX, clientY } = middleOf(a._id);
            const stack = document.elementsFromPoint(clientX, clientY);
            const cardAt = stack.findIndex((el) =>
              nodeElement(a._id)!.contains(el),
            );
            const shapeAt = stack.findIndex((el) =>
              nodeElement(shape)!.contains(el),
            );
            assert.isAtLeast(cardAt, 0);
            assert.isAtLeast(shapeAt, 0);
            assert.isBelow(cardAt, shapeAt);
          };
          try {
            await openBoard();
            await nodeShown(a._id);
            await nodeShown(shape);
            cardOnTop();

            await select(shape);
            await waitFor(() =>
              assert.isTrue(nodeElement(shape)!.classList.contains("selected")),
            );
            cardOnTop();
            // Line ends go to the topmost thing under them by this
            assert.isBelow(
              Number((nodeElement(shape) as HTMLElement).style.zIndex),
              Number((nodeElement(a._id) as HTMLElement).style.zIndex),
            );

            // A line end let go over the card attaches to the card
            await click(screen.getByRole("button", { name: /^Line:/ }));
            const from = middleOf(b._id);
            const to = middleOf(a._id);
            const pointer = { button: 0, pointerId: 1 };
            await act(async () => {
              fireEvent.pointerDown(pane(), {
                ...pointer,
                buttons: 1,
                ...from,
              });
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerMove(pane(), { ...pointer, buttons: 1, ...to });
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerUp(pane(), { ...pointer, buttons: 0, ...to });
              await stabilize();
            });
            const [line] = await waitFor(
              async () => {
                const made = (await linesFromB()).filter(
                  (id) => !before.has(id),
                );
                assert.lengthOf(made, 1);
                return made;
              },
              { timeout: 10000 },
            );
            assert.equal(
              (await WhiteboardEdges.findOneAsync(line))?.target,
              a._id,
            );
          } finally {
            forgetView();
            const made = (await linesFromB()).filter((id) => !before.has(id));
            if (made.length > 0) {
              await deleteWhiteboardEdges.callPromise({
                boardId,
                edgeIds: made,
              });
            }
            await removeNodes([shape]);
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
          await click(chatButton);
          await waitFor(() => {
            assert.isNull(document.querySelector(".react-flow"));
            assert.isNotNull(document.querySelector("[data-slate-editor]"));
          });
          await click(boardButton);
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
          await openBoard({ until: phoneBanner });
          await cardsShown();
          // Lets the canvas's effects run
          await settle();
        };
        const armComment = async () => {
          await click(screen.getByRole("button", { name: /^Comment:/ }));
          screen.getByText("Tap where your comment goes");
        };
        const sheet = () =>
          document.querySelector<HTMLElement>(
            ".react-flow__panel.jr-comment-sheet",
          );
        const draftPin = () =>
          document.querySelector('.jr-comment-pin[data-thread="draft"]');
        // A comment of this test's own, found once it reaches this client,
        // which needs the board open.
        const leaveComment = async (text: string, comment: Point) => {
          await commentOn(text, comment);
          const id = await commentId(
            { "comment.x": comment.x, "comment.y": comment.y },
            10000,
          );
          threads.push(id);
          return id;
        };
        before(async function () {
          this.timeout(10000);
          await ensureBoard();
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
          const mouse = { view: window, button: 0, ...at };
          await act(async () => {
            fireEvent.pointerDown(link, finger(at));
            fireEvent.pointerUp(link, lift(at));
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
          await click(within(panel).getByRole("button", { name: "Send" }));
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
          const moved = { clientX: at.clientX + 30, clientY: at.clientY + 20 };
          await act(async () => {
            fireEvent.pointerDown(pane(), finger(at));
            fireEvent.pointerMove(pane(), finger(moved));
            fireEvent.pointerUp(pane(), lift(moved));
            await stabilize();
          });
          assert.isNull(sheet());
          assert.isNull(draftPin());
          // nor does a pinch, whichever finger lifts first
          const other = { clientX: at.clientX + 80, clientY: at.clientY };
          await act(async () => {
            fireEvent.pointerDown(pane(), finger(at, 1));
            fireEvent.pointerDown(pane(), finger(other, 2));
            fireEvent.pointerUp(pane(), lift(at, 1));
            fireEvent.pointerUp(pane(), lift(other, 2));
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
          const wobbled = { clientX: at.clientX + 6, clientY: at.clientY + 5 };
          await act(async () => {
            fireEvent.pointerDown(pane(), finger(at));
            fireEvent.pointerMove(pane(), finger(wobbled));
            fireEvent.pointerUp(pane(), lift(wobbled));
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
            clientX: box.left + box.width / 2,
            clientY: box.top + box.height * 0.8,
          };
          await tap(pane(), at, { click: false });
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
            fireEvent.pointerDown(pane(), finger(at));
            fireEvent.pointerCancel(pane(), lift(at));
            await stabilize();
          });
          assert.isNull(sheet());
          assert.isNull(draftPin());
          // Cancel puts the tool away
          await click(screen.getByRole("button", { name: "Cancel" }));
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
          await click(within(panel).getByRole("button", { name: "Send" }));
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

          await click(
            within(panel).getAllByRole("button", { name: "React" })[0]!,
          );
          const tick = await waitFor(
            () => {
              const found = document.querySelector('[data-unified="2705"]');
              assert.exists(found);
              return found;
            },
            { timeout: 10000 },
          );
          await click(tick);
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

          await click(within(panel).getByRole("button", { name: "Resolve" }));
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
          await click(reopen);
          await waitFor(
            async () => {
              const root = await ChatMessages.findOneAsync(id);
              assert.notExists(root?.comment?.resolvedAt);
            },
            { timeout: 10000 },
          );
        });

        it("offers no download on a phone", async function () {
          this.timeout(30000);
          await openBoard({ until: phoneBanner });
          await settle();
          screen.getByRole("button", { name: /^Comments/ });
          assert.isNull(screen.queryByRole("button", { name: "Download" }));
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
            const to = {
              clientX: from.clientX + 120,
              clientY: from.clientY + 60,
            };
            await act(async () => {
              fireEvent.mouseDown(card, { view: window, button: 0, ...from });
              fireEvent.mouseMove(document, { view: window, ...to });
              fireEvent.mouseUp(document, { view: window, ...to });
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
          await click(screen.getByRole("button", { name: "Chat" }));
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
          await click(show);
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
          await click(pin);
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
          await tap(pane(), middleOf(pane()), { click: false });
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

      describe("on a tablet", function () {
        let coarse: ReturnType<typeof simulateCoarse>;
        beforeEach(function () {
          coarse = simulateCoarse();
        });
        afterEach(function () {
          coarse.restore();
        });

        const toolbar = () =>
          within(
            document.querySelector<HTMLElement>(".react-flow__panel.top.left")!,
          );
        const pick = async (name: RegExp | string) => {
          await click(toolbar().getByRole("button", { name }));
        };
        const stickies = (base: Point, count: number, text?: string) =>
          stickyRow(base, count, { width: 200, height: 160 }, 400, () => text);

        it("places a sticky note with a tap and opens it to type in", async function () {
          this.timeout(30000);
          const base = { x: 23000, y: 23000 };
          const screenAt = lookAt(base);
          const made = () =>
            WhiteboardNodes.find({
              board: boardId,
              type: "sticky",
              "position.x": { $gte: base.x - 300, $lte: base.x + 300 },
              "position.y": { $gte: base.y - 300, $lte: base.y + 300 },
            }).fetchAsync();
          try {
            await openBoard();
            await pick(/^Sticky note/);
            // The board still pans under a finger with the tool out
            assert.isTrue(pane().classList.contains("draggable"));

            // A finger that moves pans rather than placing one
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(screenAt(base.x, base.y)));
              fireEvent.pointerMove(
                pane(),
                finger(screenAt(base.x + 40, base.y + 30)),
              );
              fireEvent.pointerUp(
                pane(),
                lift(screenAt(base.x + 40, base.y + 30)),
              );
              await stabilize();
            });
            assert.equal(pressed(/^Sticky note/), "true");

            await tap(pane(), screenAt(base.x + 100, base.y + 80), {
              click: false,
            });
            const [note] = await waitFor(
              async () => {
                const found = await made();
                assert.lengthOf(found, 1);
                return found;
              },
              { timeout: 10000 },
            );
            // Centred on the tap, at the size a click gives
            assert.closeTo(note!.position.x, base.x, 1);
            assert.closeTo(note!.position.y, base.y, 1);
            assert.equal(note!.width, 200);
            const node = await nodeShown(note!._id);
            const editor = await waitFor(() => {
              const found = node.querySelector("textarea");
              assert.exists(found);
              assert.equal(document.activeElement, found);
              return found;
            });
            // Big enough that iOS doesn't zoom in on it
            assert.equal(getComputedStyle(editor).fontSize, "16px");
            assert.equal(pressed(/^Select and move/), "true");
          } finally {
            forgetView();
            await removeNodes((await made()).map((n) => n._id));
          }
        });

        it("selects a node with a long press, and another beside it with a second", async function () {
          this.timeout(30000);
          const base = { x: 23500, y: 23500 };
          const notes = stickies(base, 2);
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          lookAt(base);
          try {
            await openBoard();
            const first = await nodeShown(notes[0]!._id);
            const second = await nodeShown(notes[1]!._id);

            // A press let go early isn't a long press (the browser's click
            // from a tap would select it, which isn't sent here)
            await act(async () => {
              fireEvent.pointerDown(first, finger(middleOf(first)));
              fireEvent.pointerUp(first, lift(middleOf(first)));
              await stabilize();
            });
            await act(async () => {
              await settleFor(LONG_PRESS_MS + 100);
            });
            assert.isFalse(first.classList.contains("selected"));

            // The browser's click from letting go doesn't then select only the
            // one held
            await pressAndHold(first);
            await waitFor(() => {
              assert.isTrue(first.classList.contains("selected"));
              // with its toolbar
              const colours = [
                ...document.querySelectorAll(
                  ".react-flow__node-toolbar button[aria-label='Pink']",
                ),
              ];
              assert.lengthOf(colours, 1);
            });

            await pressAndHold(second);
            await waitFor(() => {
              assert.isTrue(second.classList.contains("selected"));
              assert.isTrue(first.classList.contains("selected"));
            });
          } finally {
            forgetView();
            await removeNodes(notes.map((n) => n._id));
          }
        });

        it("doesn't select by long press once the finger has moved", async function () {
          this.timeout(30000);
          const base = { x: 23500, y: 24000 };
          const notes = stickies(base, 1);
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          lookAt(base);
          try {
            await openBoard();
            const node = await nodeShown(notes[0]!._id);
            const at = middleOf(node);
            await act(async () => {
              fireEvent.pointerDown(node, finger(at));
              fireEvent.pointerMove(node, {
                ...finger(at),
                clientX: at.clientX + 30,
              });
              await settleFor(LONG_PRESS_MS + 100);
              await stabilize();
            });
            assert.isFalse(node.classList.contains("selected"));
            await act(async () => {
              fireEvent.pointerUp(node, lift(at));
              await stabilize();
            });
          } finally {
            forgetView();
            await removeNodes(notes.map((n) => n._id));
          }
        });

        it("selects an area with a drag while Select area is on", async function () {
          this.timeout(30000);
          const base = { x: 24000, y: 23000 };
          const notes = stickies(base, 2);
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          const screenAt = lookAt(base, 0.5);
          try {
            await openBoard();
            const nodes = await Promise.all(notes.map((n) => nodeShown(n._id)));
            const selectArea = () =>
              toolbar().getByRole("button", { name: "Select area" });
            assert.equal(selectArea().getAttribute("aria-pressed"), "false");
            await pick("Select area");
            assert.equal(selectArea().getAttribute("aria-pressed"), "true");
            // A finger on the empty board no longer pans
            assert.isFalse(pane().classList.contains("draggable"));

            const from = screenAt(base.x - 50, base.y - 50);
            const to = screenAt(base.x + 650, base.y + 220);
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(from));
              fireEvent.pointerMove(pane(), finger(to));
              fireEvent.pointerUp(pane(), lift(to));
              await stabilize();
            });
            await waitFor(() =>
              nodes.forEach((node) =>
                assert.isTrue(node.classList.contains("selected")),
              ),
            );

            await pick("Select area");
            assert.equal(selectArea().getAttribute("aria-pressed"), "false");
            assert.isTrue(pane().classList.contains("draggable"));
          } finally {
            forgetView();
            await removeNodes(notes.map((n) => n._id));
          }
        });

        it("erases a stroke with a finger dragged across it", async function () {
          this.timeout(30000);
          const base = { x: 24500, y: 23000 };
          const { segment } = await oneSegmentStroke(base);
          const screenAt = lookAt(base);
          try {
            await openBoard();
            await nodeShown(segment);
            await pick("Erase strokes");
            const path = [
              screenAt(base.x + 100, base.y - 40),
              screenAt(base.x + 100, base.y),
              screenAt(base.x + 100, base.y + 10),
              screenAt(base.x + 100, base.y + 40),
            ];
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(path[0]!));
              await stabilize();
            });
            for (const at of path.slice(1)) {
              await act(async () => {
                fireEvent.pointerMove(pane(), finger(at));
                await stabilize();
              });
            }
            await act(async () => {
              fireEvent.pointerUp(pane(), lift(path.at(-1)!));
              await stabilize();
            });
            await waitFor(
              async () =>
                assert.notExists(await WhiteboardNodes.findOneAsync(segment)),
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeNodes([segment]);
          }
        });

        it("joins two notes with the line tool by a finger dragged between them", async function () {
          this.timeout(30000);
          const base = { x: 25000, y: 23000 };
          const notes = stickies(base, 2);
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          lookAt(base, 0.5);
          try {
            await openBoard();
            const [a, b] = await Promise.all(
              notes.map((n) => nodeShown(n._id)),
            );
            await pick(/^Line:/);
            await act(async () => {
              fireEvent.pointerDown(a!, finger(middleOf(a!)));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerMove(pane(), finger(middleOf(b!)));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerUp(b!, lift(middleOf(b!)));
              await stabilize();
            });
            await waitFor(
              async () =>
                assert.equal(
                  await linesBetween(boardId, notes[0]!._id, notes[1]!._id),
                  1,
                ),
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeNodes(notes.map((n) => n._id));
          }
        });

        it("deletes, copies, pastes and duplicates from the toolbar", async function () {
          this.timeout(30000);
          const base = { x: 25500, y: 23000 };
          const text = `Copied by touch ${Random.id()}`;
          const notes = stickies(base, 1, text);
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          lookAt(base);
          const copies = () =>
            WhiteboardNodes.find({ board: boardId, text }).fetchAsync();
          const written = sinon
            .stub(navigator.clipboard, "writeText")
            .resolves();
          const read = sinon.stub(navigator.clipboard, "readText");
          try {
            await openBoard();
            const node = await nodeShown(notes[0]!._id);
            // Nothing to act on until something's selected
            assert.isTrue(
              toolbar().getByRole<HTMLButtonElement>("button", {
                name: "Delete",
              }).disabled,
            );
            await select(notes[0]!._id);
            assert.isTrue(node.classList.contains("selected"));

            await pick("Duplicate");
            await waitFor(async () => assert.lengthOf(await copies(), 2), {
              timeout: 10000,
            });

            await pick("Copy");
            await waitFor(() => assert.isTrue(written.calledOnce));
            read.resolves(written.firstCall.args[0]);
            await pick("Paste");
            await waitFor(async () => assert.lengthOf(await copies(), 3), {
              timeout: 10000,
            });

            // The paste is what's selected now, and Delete takes it away
            const pasted = (await copies()).find(
              (n) => !notes.some((note) => note._id === n._id),
            );
            assert.exists(pasted);
            await waitFor(() => {
              const all = document.querySelectorAll(
                ".react-flow__node-sticky.selected",
              );
              assert.equal(all.length, 1);
            });
            await pick("Delete");
            await waitFor(async () => assert.lengthOf(await copies(), 2), {
              timeout: 10000,
            });

            // Without a way to read the clipboard there's no Paste button
            Object.defineProperty(navigator.clipboard, "readText", {
              configurable: true,
              value: undefined,
            });
            await select(notes[0]!._id);
            assert.isNull(toolbar().queryByRole("button", { name: "Paste" }));
          } finally {
            written.restore();
            read.restore();
            delete (navigator.clipboard as { readText?: unknown }).readText;
            forgetView();
            await removeNodes((await copies()).map((n) => n._id));
          }
        });

        it("pans and zooms with two fingers while the pen is out, without drawing", async function () {
          this.timeout(30000);
          const base = { x: 26500, y: 23000 };
          const screenAt = lookAt(base);
          const drawn = () =>
            WhiteboardNodes.find({
              board: boardId,
              type: "ink",
              "position.x": { $gte: base.x - 500, $lte: base.x + 1000 },
              "position.y": { $gte: base.y - 500, $lte: base.y + 1000 },
            }).fetchAsync();
          const zoom = () =>
            new DOMMatrixReadOnly(
              getComputedStyle(document.querySelector(".react-flow__viewport")!)
                .transform,
            ).a;
          try {
            await openBoard();
            await pick(/^Draw/);
            assert.closeTo(zoom(), 1, 0.001);
            const one = screenAt(base.x + 100, base.y + 100);
            const two = screenAt(base.x + 200, base.y + 100);
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(one, 1));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(two, 2));
              await stabilize();
            });
            // The second finger moves twice as far from the first
            await act(async () => {
              fireEvent.pointerMove(
                pane(),
                finger({ ...two, clientX: two.clientX + 100 }, 2),
              );
              fireEvent.pointerMove(pane(), finger(one, 1));
              await stabilize();
            });
            await waitFor(() => assert.closeTo(zoom(), 2, 0.01));
            await act(async () => {
              fireEvent.pointerUp(pane(), lift(one, 1));
              await stabilize();
            });
            // The finger left behind doesn't start drawing
            await act(async () => {
              fireEvent.pointerMove(
                pane(),
                finger({ ...two, clientX: two.clientX + 150 }, 2),
              );
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerUp(
                pane(),
                lift({ ...two, clientX: two.clientX + 150 }, 2),
              );
              await stabilize();
            });
            await settle();
            assert.isEmpty(await drawn());
            assert.isNull(
              document.querySelector(".react-flow__viewport-portal path"),
            );
            assert.equal(pressed(/^Draw/), "true");
          } finally {
            forgetView();
            await removeNodes((await drawn()).map((n) => n._id));
          }
        });

        it("pans a note being typed in up above the keyboard", async function () {
          this.timeout(30000);
          const base = { x: 27000, y: 23000 };
          lookAt(base);
          const made = () =>
            WhiteboardNodes.find({
              board: boardId,
              type: "sticky",
              "position.x": { $gte: base.x - 2000, $lte: base.x + 2000 },
              "position.y": { $gte: base.y - 2000, $lte: base.y + 2000 },
            }).fetchAsync();
          // The keyboard covers the bottom 300px of the window
          const keyboard = 300;
          const viewport = Object.assign(new EventTarget(), {
            height: window.innerHeight - keyboard,
            offsetTop: 0,
          });
          const realViewport = Object.getOwnPropertyDescriptor(
            window,
            "visualViewport",
          );
          Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: viewport,
          });
          try {
            await openBoard();
            await pick(/^Sticky note/);
            const box = pane().getBoundingClientRect();
            const at = {
              clientX: box.left + box.width / 2,
              clientY: box.bottom - 60,
            };
            assert.isAbove(at.clientY, window.innerHeight - keyboard);
            await tap(pane(), at, { click: false });
            const [note] = await waitFor(
              async () => {
                const found = await made();
                assert.lengthOf(found, 1);
                return found;
              },
              { timeout: 10000 },
            );
            const node = await nodeShown(note!._id);
            await waitFor(() =>
              assert.exists(node.querySelector("textarea:focus")),
            );
            await waitFor(
              () => {
                const shown = node.getBoundingClientRect();
                assert.isAtMost(
                  shown.bottom,
                  window.innerHeight - keyboard - 16 + 1,
                );
              },
              { timeout: 5000 },
            );
          } finally {
            if (realViewport) {
              Object.defineProperty(window, "visualViewport", realViewport);
            } else {
              delete (window as { visualViewport?: unknown }).visualViewport;
            }
            forgetView();
            await removeNodes((await made()).map((n) => n._id));
          }
        });

        it("puts a tool away with Cancel", async function () {
          this.timeout(30000);
          await openBoard();
          assert.isNull(toolbar().queryByRole("button", { name: "Cancel" }));
          await pick(/^Draw/);
          assert.equal(pressed(/^Draw/), "true");
          await pick("Cancel");
          assert.equal(pressed(/^Select and move/), "true");
          assert.isNull(toolbar().queryByRole("button", { name: "Cancel" }));
        });

        it("turns Select area off with Cancel, and leaves it off after another tool", async function () {
          this.timeout(30000);
          await openBoard();
          const selectArea = () =>
            toolbar().getByRole("button", { name: "Select area" });
          await pick("Select area");
          assert.equal(selectArea().getAttribute("aria-pressed"), "true");
          await pick("Cancel");
          assert.equal(selectArea().getAttribute("aria-pressed"), "false");
          assert.isNull(toolbar().queryByRole("button", { name: "Cancel" }));
          assert.isTrue(pane().classList.contains("draggable"));

          await pick("Select area");
          await pick(/^Draw/);
          await pick(/^Select and move/);
          assert.equal(selectArea().getAttribute("aria-pressed"), "false");
          assert.isTrue(pane().classList.contains("draggable"));
        });

        it("names the tools for touch", async function () {
          this.timeout(30000);
          await openBoard();
          [
            "Select and move (long press to add)",
            "Draw (two fingers pan)",
            "Sticky note: tap to place",
            "Text: tap to place",
            "Frame: tap to place",
          ].forEach((name) => toolbar().getByRole("button", { name }));
        });

        it("places a text box and a frame with a tap", async function () {
          this.timeout(30000);
          const base = { x: 23000, y: 25500 };
          lookAt(base, 0.5);
          const made = (type: "text" | "frame") =>
            WhiteboardNodes.find({
              board: boardId,
              type,
              "position.x": { $gte: base.x - 1500, $lte: base.x + 1500 },
              "position.y": { $gte: base.y - 1500, $lte: base.y + 1500 },
            }).fetchAsync();
          // A tap at a fraction of the way across and down the board, clear
          // of its toolbars, and the board point it's at
          const tapAt = async (fx: number, fy: number) => {
            const box = pane().getBoundingClientRect();
            const at = {
              clientX: box.left + box.width * fx,
              clientY: box.top + box.height * fy,
            };
            await tap(pane(), at);
            return {
              x: base.x + (at.clientX - box.left - 150) / 0.5,
              y: base.y + (at.clientY - box.top - 150) / 0.5,
            };
          };
          try {
            await openBoard();
            await pick(/^Text:/);
            const tapped = await tapAt(0.4, 0.5);
            const [text] = await waitFor(
              async () => {
                const found = await made("text");
                assert.lengthOf(found, 1);
                return found;
              },
              { timeout: 10000 },
            );
            // Centred on the tap
            assert.closeTo(text!.position.x, tapped.x - 120, 1);
            assert.closeTo(text!.position.y, tapped.y - 24, 1);
            const node = await nodeShown(text!._id);
            await waitFor(() =>
              assert.exists(node.querySelector("input:focus, textarea:focus")),
            );
            assert.equal(pressed(/^Select and move/), "true");

            await pick(/^Frame:/);
            await tapAt(0.7, 0.7);
            await waitFor(async () => assert.lengthOf(await made("frame"), 1), {
              timeout: 10000,
            });
          } finally {
            forgetView();
            await removeNodes(
              [...(await made("text")), ...(await made("frame"))].map(
                (n) => n._id,
              ),
            );
          }
        });

        it("places a shape with a tap, with nothing to type in", async function () {
          this.timeout(30000);
          const base = { x: 23000, y: 28000 };
          const screenAt = lookAt(base);
          const made = () =>
            WhiteboardNodes.find({
              board: boardId,
              type: "shape",
              "position.x": { $gte: base.x - 300, $lte: base.x + 300 },
              "position.y": { $gte: base.y - 300, $lte: base.y + 300 },
            }).fetchAsync();
          try {
            await openBoard();
            await pick(/^Shape:/);
            assert.equal(pressed(/^Shape:/), "true");
            await tap(pane(), screenAt(base.x + 100, base.y + 80));
            const [shape] = await waitFor(
              async () => {
                const found = await made();
                assert.lengthOf(found, 1);
                return found;
              },
              { timeout: 10000 },
            );
            assert.equal(shape!.shape, "rect");
            assert.deepEqual(shape!.position, {
              x: base.x + 20,
              y: base.y + 20,
            });
            assert.equal(shape!.width, 160);
            assert.equal(shape!.height, 120);
            await nodeShown(shape!._id);
            assert.equal(pressed(/^Select and move/), "true");
            assert.notEqual(document.activeElement?.tagName, "INPUT");
          } finally {
            forgetView();
            await removeNodes((await made()).map((n) => n._id));
          }
        });

        it("places a comment with a tap", async function () {
          this.timeout(30000);
          await openBoard();
          await pick(/^Comment:/);
          // The board still pans under a finger while the tool is out
          assert.isTrue(pane().classList.contains("draggable"));
          const box = pane().getBoundingClientRect();
          const at = {
            clientX: box.left + box.width * 0.6,
            clientY: box.top + box.height * 0.6,
          };
          await tap(pane(), at);
          await waitFor(() =>
            assert.exists(
              document.querySelector('.jr-comment-pin[data-thread="draft"]'),
            ),
          );
          await pick("Cancel");
          await waitFor(() =>
            assert.isNull(
              document.querySelector('.jr-comment-pin[data-thread="draft"]'),
            ),
          );
        });

        it("places nothing when a second finger lands or the press is cancelled", async function () {
          this.timeout(30000);
          const base = { x: 24000, y: 25500 };
          const screenAt = lookAt(base);
          const made = () =>
            WhiteboardNodes.find({
              board: boardId,
              type: "sticky",
              "position.x": { $gte: base.x - 500, $lte: base.x + 500 },
              "position.y": { $gte: base.y - 500, $lte: base.y + 500 },
            }).fetchAsync();
          try {
            await openBoard();
            await pick(/^Sticky note/);
            const one = screenAt(base.x + 100, base.y + 100);
            const two = screenAt(base.x + 250, base.y + 100);
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(one, 1));
              fireEvent.pointerDown(pane(), finger(two, 2));
              fireEvent.pointerUp(pane(), lift(one, 1));
              fireEvent.pointerUp(pane(), lift(two, 2));
              await stabilize();
            });
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(one));
              fireEvent.pointerCancel(pane(), lift(one));
              await stabilize();
            });
            await act(async () => {
              await settleFor(500);
            });
            assert.isEmpty(await made());
            assert.equal(pressed(/^Sticky note/), "true");
          } finally {
            forgetView();
            await removeNodes((await made()).map((n) => n._id));
          }
        });

        it("joins two notes by tapping a handle on each", async function () {
          this.timeout(30000);
          const base = { x: 25000, y: 25500 };
          const notes = stickies(base, 2);
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          lookAt(base, 0.5);
          try {
            await openBoard();
            await tap(await handleOf(notes[0]!._id, "right"));
            // With no hover to find them by, every handle shows
            const end = await handleOf(notes[1]!._id, "left");
            await waitFor(() =>
              assert.equal(getComputedStyle(end).opacity, "1"),
            );
            toolbar().getByRole("button", { name: "Cancel" });
            await tap(end);
            await waitFor(
              async () =>
                assert.equal(
                  await linesBetween(boardId, notes[0]!._id, notes[1]!._id),
                  1,
                ),
              { timeout: 10000 },
            );
          } finally {
            forgetView();
            await removeNodes(notes.map((n) => n._id));
          }
        });

        [0.5, 1, 2].forEach((zoom) => {
          it(`gives a finger 44px targets on a selected note at zoom ${zoom}`, async function () {
            this.timeout(30000);
            const base = { x: 26000, y: 25500 };
            const notes = stickies(base, 1);
            await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
            lookAt(base, zoom);
            // How wide an element's ::after is on screen, allowing for the
            // zoom and any scale of its own
            const targetSize = (element: HTMLElement) =>
              parseFloat(getComputedStyle(element, "::after").width) *
              (element.getBoundingClientRect().width / element.offsetWidth);
            try {
              await openBoard();
              await select(notes[0]!._id);
              const node = await nodeShown(notes[0]!._id);
              await waitFor(() =>
                assert.isTrue(node.classList.contains("selected")),
              );
              const corner = await waitFor(() => {
                const found = node.querySelector<HTMLElement>(
                  ".react-flow__resize-control.handle",
                );
                assert.exists(found);
                return found;
              });
              const handle = node.querySelector<HTMLElement>(
                ".react-flow__handle",
              )!;
              await waitFor(() => {
                assert.closeTo(targetSize(corner), 44, 1);
                assert.closeTo(targetSize(handle), 44, 1);
              });
            } finally {
              forgetView();
              await removeNodes(notes.map((n) => n._id));
            }
          });
        });

        it("only lets a selected node be dragged, so a finger on another pans", async function () {
          this.timeout(30000);
          const base = { x: 27000, y: 25500 };
          const notes = stickies(base, 2);
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          lookAt(base);
          try {
            await openBoard();
            const [first, second] = await Promise.all(
              notes.map((n) => nodeShown(n._id)),
            );
            assert.isFalse(first!.classList.contains("nopan"));
            await select(notes[0]!._id);
            await waitFor(() => {
              assert.isTrue(first!.classList.contains("nopan"));
              assert.isTrue(first!.classList.contains("draggable"));
            });
            assert.isFalse(second!.classList.contains("nopan"));
          } finally {
            forgetView();
            await removeNodes(notes.map((n) => n._id));
          }
        });

        it("selects a whole ink stroke with a long press on it", async function () {
          this.timeout(30000);
          const base = { x: 23000, y: 26500 };
          const { segments } = await twoSegmentStroke(base);
          lookAt(base);
          try {
            await openBoard();
            const shown = await Promise.all(
              segments.map((id) => nodeShown(id)),
            );
            const path = shown[0]!.querySelector("path")!;
            await pressAndHold(path);
            await waitFor(() =>
              shown.forEach((node) =>
                assert.isTrue(node.classList.contains("selected")),
              ),
            );
          } finally {
            forgetView();
            await removeNodes(segments);
          }
        });

        it("deletes only what isn't locked from the toolbar", async function () {
          this.timeout(30000);
          const base = { x: 24000, y: 26500 };
          const notes = stickies(base, 2);
          const [held, free] = notes;
          await upsertWhiteboardNodes.callPromise({ boardId, nodes: notes });
          await upsertWhiteboardNodes.callPromise({
            boardId,
            nodes: [{ _id: held!._id, locked: true }],
          });
          lookAt(base);
          try {
            await openBoard();
            await pressAndHold(await nodeShown(held!._id));
            await pressAndHold(await nodeShown(free!._id));
            await waitFor(() =>
              assert.lengthOf(
                document.querySelectorAll(".react-flow__node-sticky.selected"),
                2,
              ),
            );
            await pick("Delete");
            await screen.findByText("Some of those are locked");
            await waitFor(
              async () =>
                assert.notExists(await WhiteboardNodes.findOneAsync(free!._id)),
              { timeout: 10000 },
            );
            assert.exists(await WhiteboardNodes.findOneAsync(held!._id));
          } finally {
            forgetView();
            await upsertWhiteboardNodes.callPromise({
              boardId,
              nodes: [{ _id: held!._id, locked: false }],
            });
            await removeNodes(notes.map((n) => n._id));
          }
        });

        it("has no Copy button where the browser can't write the clipboard", async function () {
          this.timeout(30000);
          Object.defineProperty(navigator.clipboard, "writeText", {
            configurable: true,
            value: undefined,
          });
          try {
            await openBoard();
            toolbar().getByRole("button", { name: "Delete" });
            assert.isNull(toolbar().queryByRole("button", { name: "Copy" }));
          } finally {
            delete (navigator.clipboard as { writeText?: unknown }).writeText;
          }
        });

        it("still gives a phone no editing tools", async function () {
          this.timeout(30000);
          const phone = simulatePhone();
          const both = simulateCoarse();
          try {
            await openBoard({ until: phoneBanner });
            assert.isNull(
              screen.queryByRole("button", { name: /^Select and move/ }),
            );
            ["Select area", "Delete", "Copy", "Paste", "Duplicate"].forEach(
              (name) =>
                assert.isNull(toolbar().queryByRole("button", { name })),
            );
            screen.getByRole("button", { name: /^Comment:/ });
          } finally {
            both.restore();
            phone.restore();
          }
        });
      });

      describe("with someone else on the board", function () {
        const OTHER_EMAIL = "second-member@example.com";
        const OTHER_PASSWORD = "password";
        const OTHER_NAME = "Second Member";
        let other: ReturnType<typeof DDP.connect>;
        let otherId: string;
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
          const login = (await other.callAsync("login", {
            user: { email: OTHER_EMAIL },
            password: (
              Accounts as unknown as {
                _hashPassword: (password: string) => unknown;
              }
            )._hashPassword(OTHER_PASSWORD),
          })) as { id: string };
          otherId = login.id;
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
          await commentOn(text, { x, y: x }, { via: other });
          const thread = await commentId({ "comment.x": x }, 10000);
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
          await settle();
          const before = unread();
          const thread = await theyComment("Unread for now", 27000);
          await waitFor(() => assert.equal(unread(), before + 1), {
            timeout: 10000,
          });
          await click(pinFor(thread)!);
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
          await click(screen.getByRole("button", { name: "Comments" }));
          const rows = () =>
            panelButtons("button[data-thread]").map(
              (row) => row.dataset.thread,
            );
          await waitFor(() =>
            assert.deepEqual(rows().slice(0, 2), [newer, older]),
          );
          const row = threadRow(older)!;
          assert.include(row.textContent ?? "", "Older thread");
          assert.include(row.textContent ?? "", "0 replies");
          await click(row);
          const listButton = screen.getByRole("button", { name: "Comments" });
          await waitFor(() => {
            assert.include(panelText(), "Older thread");
            assert.equal(pinFor(older)?.getAttribute("aria-expanded"), "true");
            // The thread has the list's place, so the button isn't pressed
            assert.equal(listButton.getAttribute("aria-pressed"), "false");
          });
          // and takes the viewer back to the list rather than closing both
          await click(listButton);
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
          await click(listButton);
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
          // The comment is sent before the board opens, so it arrives through
          // a subscription of this test's own rather than the last test's
          // closing one
          const messages = await typedSubscribe.async(chatMessagesForPuzzle, {
            puzzleId: boardPuzzle,
            huntId,
          });
          let thread: string;
          try {
            thread = await theyComment("Seen by a viewer", 27500);
          } finally {
            messages.stop();
          }
          await setHuntArchived.callPromise({ huntId, isArchived: true });
          try {
            await openBoard({ until: viewingOnly });
            await settle();
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
            await click(list);
            const row = await waitFor(() => {
              const found = threadRow(thread);
              assert.ok(found);
              return found;
            });
            assert.include(row.textContent ?? "", "Seen by a viewer");
            await click(list);
            assert.isNull(threadRow(thread));
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
          const base = { x: 28000, y: 28000 };
          const sticky = await addSticky(base, { width: 200, height: 160 });
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
              { timeout: 5000 },
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

        it("sends a stroke drawn by touch on a tablet while it's drawn", async function () {
          this.timeout(30000);
          const base = { x: 26000, y: 23000 };
          const screenAt = lookAt(base);
          const coarse = simulateCoarse();
          const subscription = other.subscribe(whiteboardPresence.name, {
            boardId,
          });
          const drawn = () =>
            WhiteboardNodes.find({
              board: boardId,
              type: "ink",
              "position.x": { $gte: base.x - 50, $lte: base.x + 400 },
              "position.y": { $gte: base.y - 50, $lte: base.y + 400 },
            }).fetchAsync();
          const mine = async () =>
            (await theirPresence.findOneAsync({
              board: boardId,
              user: Meteor.userId()!,
            })) as
              | {
                  stroke?: { points: unknown[] } | null;
                  cursor?: unknown;
                }
              | undefined;
          try {
            await openBoard();
            await click(screen.getByRole("button", { name: /^Draw/ }));
            const path = [0, 1, 2, 3, 4, 5].map((i) =>
              screenAt(base.x + 20 + i * 40, base.y + 50 + (i % 2) * 20),
            );
            await act(async () => {
              fireEvent.pointerDown(pane(), finger(path[0]!));
              path
                .slice(1)
                .forEach((at) => fireEvent.pointerMove(pane(), finger(at)));
              await stabilize();
            });
            // They see it before it's finished, with no cursor for a finger
            await waitFor(
              async () => {
                const live = await mine();
                assert.isAbove(live?.stroke?.points.length ?? 0, 1);
                assert.notExists(live?.cursor);
              },
              { timeout: 5000 },
            );
            await act(async () => {
              fireEvent.pointerUp(pane(), lift(path.at(-1)!));
              await stabilize();
            });
            await waitFor(
              async () => {
                assert.isNotEmpty(await drawn());
                assert.notExists((await mine())?.stroke);
              },
              { timeout: 10000 },
            );
          } finally {
            subscription.stop();
            coarse.restore();
            forgetView();
            await removeNodes((await drawn()).map((n) => n._id));
          }
        });

        it("sends a selection made by long press on a tablet", async function () {
          this.timeout(30000);
          const base = { x: 26500, y: 24000 };
          const sticky = await addSticky(base, { width: 200, height: 160 });
          lookAt(base);
          const coarse = simulateCoarse();
          const subscription = other.subscribe(whiteboardPresence.name, {
            boardId,
          });
          try {
            await openBoard();
            await pressAndHold(await nodeShown(sticky), { click: false });
            await waitFor(
              async () => {
                const mine = await theirPresence.findOneAsync({
                  board: boardId,
                  user: Meteor.userId()!,
                });
                assert.deepEqual(mine?.selection, [sticky]);
              },
              { timeout: 5000 },
            );
          } finally {
            subscription.stop();
            coarse.restore();
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
          const base = { x: 28500, y: 28000 };
          const sticky = await addSticky(base, { width: 200, height: 160 });
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
          const base = { x: 28500, y: 28500 };
          const sticky = await addSticky(
            base,
            { width: 200, height: 160 },
            { text: "Theirs" },
          );
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
          await putNodes([
            stickyNode(
              base,
              { width: 200, height: 160 },
              { _id: sticky, text: "Mine" },
            ),
            {
              _id: end,
              type: "point",
              position: { x: base.x + 400, y: base.y + 80 },
            },
          ]);
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
            await openHistoryRow((text) => text.startsWith("Before edits"));
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
          await click(commentTool());
          await pressBoard();
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
          const base = { x: 29000, y: 29000 };
          // Two edits by two people, a few seconds apart, share a version
          const note = await addSticky(
            base,
            { width: 200, height: 160 },
            { text: "Added before the history was read" },
          );
          await other.callAsync(upsertWhiteboardNodes.name, {
            boardId,
            nodes: [{ _id: note, text: "Edited by them" }],
          });
          lookAt(base);
          await openBoard();
          await nodeShown(note);

          await click(screen.getByRole("button", { name: "History" }));
          const row = await historyRow((text) => text.includes(OTHER_NAME));
          assert.match(
            row.textContent ?? "",
            /^Before edits by .* and Second Member, .* \(2 changes\)$/,
          );
          assert.exists(
            screen.getByRole("button", { name: "Now", pressed: true }),
          );

          // Escape leaves a preview and leaves History open
          await click(row);
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

          await click(row);
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

          await click(
            within(banner.parentElement!).getByRole("button", {
              name: "Restore this version",
            }),
          );
          const dialog = await modalShown();
          assert.include(
            dialog.textContent ?? "",
            "Changes since then, by anyone, are undone.",
          );
          await click(
            within(dialog).getByRole("button", {
              name: "Restore this version",
            }),
          );

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

        it("previews a version of a busy board without React Flow reporting a resize loop", async function () {
          this.timeout(60000);
          const base = { x: 30000, y: 31000 };
          const round = Random.id();
          const inner = Random.id();
          const folded = Random.id();
          const notes = Array.from({ length: 6 }, () => Random.id());
          const text = Random.id();
          const shape = Random.id();
          const ink = [Random.id(), Random.id()];
          const end = Random.id();
          const added = Random.id();
          const stroke = Random.id();
          const wrapped =
            "A note that wraps over several lines, with **bold** words in it.\n\nAnd a second paragraph below the first.";
          // A board with a bit of everything: nested and collapsed frames,
          // notes that wrap, a text box, a shape, an ink stroke and lines
          await putNodes([
            frameNode(
              base,
              { width: 1200.4, height: 800.6 },
              { _id: round, label: "Round of notes" },
            ),
            frameNode(
              { x: 600, y: 100 },
              { width: 500, height: 400 },
              { _id: inner, parent: round, label: "Inner round" },
            ),
            frameNode(
              { x: base.x + 1300, y: base.y },
              { width: 500, height: 400 },
              { _id: folded, label: "Folded round", collapsed: true },
            ),
            ...notes.map((_id, i) =>
              stickyNode(
                { x: 40 + (i % 3) * 200, y: 80 + (i < 3 ? 0 : 160) },
                { width: 160, height: 120 },
                {
                  _id,
                  parent: i < 3 ? round : i < 5 ? inner : folded,
                  text: wrapped,
                },
              ),
            ),
            {
              _id: text,
              type: "text",
              position: { x: base.x, y: base.y + 900 },
              width: 300,
              height: 48,
              text: "Words under the round",
            },
            shapeNode(
              { x: 20, y: 60 },
              { width: 420, height: 300 },
              "ellipse",
              { _id: shape, parent: round, color: "blue" },
            ),
            ...ink.map((_id, i) =>
              inkNode(
                { x: base.x + i * 200, y: base.y + 850 },
                { width: 200, height: 40 },
                Array.from({ length: 41 }, (_, j): [number, number, number] => [
                  j * 5,
                  20 + Math.sin(j / 4) * 15,
                  0.5,
                ]),
                { _id, stroke },
              ),
            ),
            {
              _id: end,
              type: "point",
              position: { x: base.x + 1400, y: base.y + 900 },
            },
          ]);
          await upsertWhiteboardEdges.callPromise({
            boardId,
            edges: [
              { _id: Random.id(), source: notes[0]!, target: notes[3]! },
              { _id: Random.id(), source: notes[1]!, target: end },
            ],
          });
          await clearWhiteboardVersions.callPromise({ boardId });
          // The version keeps the board as it was; since then things have
          // moved, grown, been added and taken away, and frames have folded
          // the other way
          await putNodes([
            { _id: round, width: 1400.3, height: 900.7 },
            { _id: inner, position: { x: 700, y: 150 }, collapsed: true },
            { _id: folded, collapsed: false },
            {
              _id: notes[0]!,
              position: { x: 300, y: 400 },
              width: 240,
              height: 200,
            },
            { _id: notes[1]!, parent: inner, position: { x: 40, y: 80 } },
            { _id: notes[2]!, text: "Short" },
            { _id: text, width: 400, text: "Other words under the round" },
            stickyNode(
              { x: 900, y: 600 },
              { width: 160, height: 120 },
              { _id: added, parent: round, text: "Added since" },
            ),
          ]);
          await removeNodes([notes[4]!, shape, ink[1]!]);
          lookAt({ x: base.x - 100, y: base.y - 100 }, 0.73);
          const page = collectPageErrors();
          try {
            await openBoard();
            await nodeShown(added);
            await openHistoryRow((text) => text.startsWith("Before edits"));
            await screen.findByText(
              /^Viewing the board as it was at /,
              {},
              { timeout: 10000 },
            );
            // The board as it was: the note since taken away is back, and
            // the one since added is gone
            await nodeShown(notes[4]!);
            await waitFor(() => assert.isNull(nodeElement(added)));
            // Long enough for React Flow to measure what's changed
            await expectNoResizeLoop(page);
          } finally {
            page.stop();
            forgetView();
            await removeNodes([
              round,
              inner,
              folded,
              ...notes.filter((id) => id !== notes[4]),
              text,
              ink[0]!,
              end,
              added,
            ]);
          }
        });

        describe("who's here and following", function () {
          const theirFace = () =>
            screen.getByRole("button", {
              name: `${OTHER_NAME}: jump to or follow`,
            });
          // The board point at the centre of the canvas, and the zoom
          const viewCentre = () => {
            const viewport = new DOMMatrixReadOnly(
              getComputedStyle(document.querySelector(".react-flow__viewport")!)
                .transform,
            );
            const box = pane().getBoundingClientRect();
            return {
              x: (box.width / 2 - viewport.e) / viewport.a,
              y: (box.height / 2 - viewport.f) / viewport.a,
              zoom: viewport.a,
            };
          };
          const assertCentredOn = (view: {
            x: number;
            y: number;
            zoom?: number;
          }) => {
            const now = viewCentre();
            assert.closeTo(now.x, view.x, 2);
            assert.closeTo(now.y, view.y, 2);
            if (view.zoom !== undefined) {
              assert.closeTo(now.zoom, view.zoom, 0.001);
            }
          };
          const pickAction = async (name: string) => {
            const face = await waitFor(() => theirFace(), { timeout: 10000 });
            await click(face);
            const action = await screen.findByRole("button", { name });
            await click(action);
          };
          const follow = async (view: {
            x: number;
            y: number;
            zoom: number;
          }) => {
            await theirLive({ view });
            await pickAction("Follow");
            await screen.findByText(`Following ${OTHER_NAME}`);
            await waitFor(() => assertCentredOn(view), { timeout: 5000 });
          };
          const theirId = () => otherId;
          const Presence: typeof import("../../imports/client/WhiteboardPresence").default =
            require("../../imports/client/WhiteboardPresence").default;
          // Their live state, once it has reached this page
          const theirsHere = () =>
            Presence.findOneAsync({ board: boardId, user: theirId() });
          // This page's live state, as their connection sees it
          const mineThere = async () =>
            (await theirPresence.findOneAsync({
              board: boardId,
              user: Meteor.userId()!,
            })) as { view?: unknown; followedUser?: string | null } | undefined;

          afterEach(async function () {
            await theirLive();
          });

          it("shows them after you, and jumps to their cursor", async function () {
            this.timeout(30000);
            lookAt({ x: 0, y: 0 });
            try {
              await openBoard();
              await theirLive({ cursor: { x: 29000, y: 29500 } });
              const face = await waitFor(() => theirFace(), {
                timeout: 10000,
              });
              // You first, and not a button, then them
              const stack = face.parentElement!;
              assert.equal(stack.firstElementChild?.tagName, "DIV");
              assert.equal(stack.children[1], face);
              assert.isNull(
                within(stack).queryByRole("button", { name: /\(you\)/ }),
              );

              await pickAction("Jump to their cursor");
              await waitFor(() => assertCentredOn({ x: 29000, y: 29500 }), {
                timeout: 5000,
              });
            } finally {
              forgetView();
            }
          });

          it("can't jump to someone whose pointer hasn't been on the board", async function () {
            this.timeout(30000);
            await openBoard();
            const face = await waitFor(() => theirFace(), { timeout: 10000 });
            await click(face);
            const jump = await screen.findByRole("button", {
              name: "Jump to their cursor",
            });
            assert.isTrue((jump as HTMLButtonElement).disabled);
          });

          it("follows their view as it changes, until a wheel moves the board", async function () {
            this.timeout(30000);
            lookAt({ x: 0, y: 0 });
            try {
              await openBoard();
              await follow({ x: 30000, y: 30000, zoom: 0.5 });
              // They hear who's following them
              const subscription = other.subscribe(whiteboardPresence.name, {
                boardId,
              });
              try {
                const them = theirId();
                await waitFor(
                  async () => {
                    const mine = await theirPresence.findOneAsync({
                      board: boardId,
                      user: Meteor.userId()!,
                    });
                    assert.equal(
                      (mine as { followedUser?: string })?.followedUser,
                      them,
                    );
                  },
                  { timeout: 5000 },
                );
              } finally {
                subscription.stop();
              }

              await theirLive({ view: { x: 30400, y: 30100, zoom: 1 } });
              await waitFor(
                () => assertCentredOn({ x: 30400, y: 30100, zoom: 1 }),
                { timeout: 5000 },
              );

              // A click on the empty board doesn't move it
              const box = pane().getBoundingClientRect();
              const mouse = {
                button: 0,
                view: window,
                clientX: box.left + 100,
                clientY: box.top + 100,
              };
              await act(async () => {
                fireEvent.mouseDown(pane(), mouse);
                fireEvent.mouseUp(window, mouse);
                fireEvent.click(pane(), mouse);
                await stabilize();
              });
              assert.exists(screen.getByText(`Following ${OTHER_NAME}`));

              await act(async () => {
                fireEvent.wheel(pane(), {
                  deltaY: -120,
                  clientX: box.left + 100,
                  clientY: box.top + 100,
                });
                await stabilize();
              });
              await screen.findByText(
                `Stopped following ${OTHER_NAME}: you moved the board.`,
              );
              const stoppedAt = viewCentre();
              await theirLive({ view: { x: 31000, y: 31000, zoom: 1 } });
              await waitFor(
                async () =>
                  assert.deepEqual((await theirsHere())?.view, {
                    x: 31000,
                    y: 31000,
                    zoom: 1,
                  }),
                { timeout: 5000 },
              );
              await settle();
              assertCentredOn(stoppedAt);
            } finally {
              forgetView();
            }
          });

          it("stops following when a control moves the board", async function () {
            this.timeout(30000);
            lookAt({ x: 0, y: 0 });
            try {
              await openBoard();
              await follow({ x: 30200, y: 30200, zoom: 1 });
              await click(screen.getByRole("button", { name: "Zoom in" }));
              await screen.findByText(
                `Stopped following ${OTHER_NAME}: you moved the board.`,
              );
            } finally {
              forgetView();
            }
          });

          it("pauses following while an earlier version is shown", async function () {
            this.timeout(40000);
            await clearWhiteboardVersions.callPromise({ boardId });
            const note = await addSticky(
              { x: 30500, y: 30500 },
              { width: 200, height: 160 },
              { text: "Added before following" },
            );
            await other.callAsync(upsertWhiteboardNodes.name, {
              boardId,
              nodes: [{ _id: note, text: "Edited by them" }],
            });
            const subscription = other.subscribe(whiteboardPresence.name, {
              boardId,
            });
            lookAt({ x: 0, y: 0 });
            try {
              await openBoard();
              await follow({ x: 30000, y: 30000, zoom: 1 });
              await waitFor(
                async () =>
                  assert.equal((await mineThere())?.followedUser, theirId()),
                { timeout: 5000 },
              );

              await openHistoryRow((text) => text.includes(OTHER_NAME));
              await screen.findByText(
                `Following ${OTHER_NAME} is paused while you look at an earlier version.`,
                {},
                { timeout: 10000 },
              );
              // Nothing about what this page looks at, or who it follows,
              // goes out
              await waitFor(
                async () => {
                  const mine = await mineThere();
                  assert.isNull(mine?.view ?? null);
                  assert.isNull(mine?.followedUser ?? null);
                },
                { timeout: 5000 },
              );

              const pausedAt = viewCentre();
              const latest = { x: 30600, y: 30300, zoom: 1 };
              await theirLive({ view: latest });
              await waitFor(
                async () =>
                  assert.deepEqual((await theirsHere())?.view, latest),
                { timeout: 5000 },
              );
              await settle();
              assertCentredOn(pausedAt);

              // Back to now, the board catches up with them
              await click(screen.getByRole("button", { name: "Now" }));
              await screen.findByText(`Following ${OTHER_NAME}`);
              await waitFor(() => assertCentredOn(latest), { timeout: 5000 });
              await waitFor(
                async () =>
                  assert.equal((await mineThere())?.followedUser, theirId()),
                { timeout: 5000 },
              );
            } finally {
              subscription.stop();
              forgetView();
              await removeNodes([note]);
            }
          });

          it("stops following, and says so, when they leave the board", async function () {
            this.timeout(30000);
            const subscription = other.subscribe(whiteboardPresence.name, {
              boardId,
            });
            try {
              await openBoard();
              await follow({ x: 29800, y: 29800, zoom: 1 });
              subscription.stop();
              await screen.findByText(
                `Stopped following ${OTHER_NAME}: they left the board.`,
                {},
                { timeout: 5000 },
              );
              assert.isNull(screen.queryByText(`Following ${OTHER_NAME}`));
              await waitFor(() =>
                assert.isNull(
                  screen.queryByRole("button", {
                    name: `${OTHER_NAME}: jump to or follow`,
                  }),
                ),
              );
            } finally {
              subscription.stop();
              forgetView();
            }
          });

          it("tells you who's following you", async function () {
            this.timeout(30000);
            // A name i18next would otherwise show with entities in it
            const name = "Ada O'Brien";
            await other.callAsync(updateProfile.name, {
              displayName: name,
              dingwords: [],
            });
            try {
              await openBoard();
              // Following someone needs them on the board, which opening it
              // puts this page
              await waitFor(
                async () => {
                  await theirLive({ followedUser: Meteor.userId()! });
                },
                { timeout: 5000 },
              );
              const chip = await screen.findByText(
                `${name} is following you`,
                {},
                { timeout: 5000 },
              );
              assert.isTrue(chip.closest(".jr-whos-here") !== null);
              assert.exists(
                screen.getByRole("button", {
                  name: `${name}: jump to or follow`,
                }),
              );
              await theirLive();
              await waitFor(() =>
                assert.isNull(screen.queryByText(`${name} is following you`)),
              );
            } finally {
              await other.callAsync(updateProfile.name, {
                displayName: OTHER_NAME,
                dingwords: [],
              });
            }
          });

          it("follows on a phone, with finger-sized faces", async function () {
            this.timeout(30000);
            const phone = simulatePhone();
            try {
              await openBoard({ until: phoneBanner });
              await settle();
              const face = await waitFor(() => theirFace(), {
                timeout: 10000,
              });
              assert.equal(face.getBoundingClientRect().height, 44);
              assert.equal(face.getBoundingClientRect().width, 44);
              await follow({ x: 29600, y: 29700, zoom: 0.8 });
              await theirLive({ view: { x: 29650, y: 29700, zoom: 0.8 } });
              await waitFor(
                () => assertCentredOn({ x: 29650, y: 29700, zoom: 0.8 }),
                { timeout: 5000 },
              );
              await click(screen.getByRole("button", { name: "Stop" }));
              assert.isNull(screen.queryByText(`Following ${OTHER_NAME}`));
            } finally {
              phone.restore();
              forgetView();
            }
          });
        });

        describe("locks", function () {
          const stickies = (base: Point, n: number) =>
            putNodes(
              stickyRow(
                base,
                n,
                { width: 160, height: 120 },
                200,
                (i) => `Note ${i}`,
              ),
            );
          const badge = (id: string) =>
            nodeElement(id)?.querySelector<HTMLElement>(".jr-lock-badge");
          const lockButton = () =>
            screen.getByRole<HTMLButtonElement>("button", {
              name: /^(Lock|Unlock)$/,
            });
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
              await selectAlso(free!);
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
            await putNodes(
              ids.map((_id, i) =>
                stickyNode(
                  { x: base.x + i * 200, y: base.y + i * 60 },
                  { width: 100, height: 80 },
                  { _id },
                ),
              ),
            );
            await putNodes([{ _id: ids[1]!, locked: true }]);
            lookAt(base);
            try {
              await openBoard();
              await select(ids[0]!);
              await selectAlso(ids[1]!, ids[2]!);
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
            await putNodes(
              [held, free].map((_id, i) =>
                inkNode(
                  { x: base.x, y: base.y + i * 200 },
                  { width: 200, height: 20 },
                  sampledStroke(),
                  { _id, stroke: _id },
                ),
              ),
            );
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
          await click(screen.getByRole("button", { name: "Reset layout…" }));
          const dialog = await modalShown();
          assert.include(
            dialog.textContent ?? "",
            "Every card and round frame goes back to where the puzzle list puts it, and collapsed rounds open.",
          );
          assert.isFalse(
            within(dialog).getByRole<HTMLInputElement>("checkbox", {
              name: "Also put back cards and rounds taken off the board",
            }).checked,
          );
          await click(
            within(dialog).getByRole("button", { name: "Reset layout" }),
          );
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

          await click(screen.getByRole("button", { name: "Open History" }));
          const row = await historyRow((text) =>
            text.includes("reset the layout"),
          );
          await click(row);
          const banner = await screen.findByText(
            /^Viewing the board as it was at /,
            {},
            { timeout: 10000 },
          );
          await click(
            within(banner.parentElement!).getByRole("button", {
              name: "Restore this version",
            }),
          );
          const confirm = await modalShown();
          await click(
            within(confirm).getByRole("button", {
              name: "Restore this version",
            }),
          );
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
        const base = { x: 31000, y: 31000 };
        const note = await addSticky(
          base,
          { width: 200, height: 160 },
          { text: "Deleted by mistake" },
        );
        // The deletion is then the first edit, so the version it records
        // has the note on it
        await clearWhiteboardVersions.callPromise({ boardId });
        await removeNodes([note]);
        lookAt(base);
        try {
          await openBoard();
          await openHistoryRow((text) => text.startsWith("Before edits by"));
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
          await click(button);
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
          await click(screen.getByRole("button", { name: "Back to now" }));
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
          const dialog = await modalShown();
          await click(
            within(dialog).getByRole("button", { name: "Reset layout" }),
          );
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
          const shown = modalContent();
          assert.exists(shown);
          within(shown).getByText(
            "Couldn't reset the layout: Only operators can edit this whiteboard",
          );
          assert.isFalse(
            within(shown).getByRole<HTMLButtonElement>("button", {
              name: "Reset layout",
            }).disabled,
          );
          await click(within(shown).getByRole("button", { name: "Cancel" }));
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
          await click(place);
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

      before(async function () {
        this.timeout(10000);
        await ensureBoard();
        subs.push(await typedSubscribe.async(whiteboardContents, { boardId }));
      });

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
        const size = { width: 120, height: 80 };
        await putNodes([
          frameNode(
            base,
            { width: 600, height: 400 },
            { _id: ids.frame, label: "Folded round" },
          ),
          stickyNode({ x: 40, y: 100 }, size, {
            _id: ids.inside,
            parent: ids.frame,
            text: "Inside",
          }),
          stickyNode({ x: 300, y: 100 }, size, {
            _id: ids.alsoInside,
            parent: ids.frame,
          }),
          stickyNode({ x: base.x + 800, y: base.y }, size, {
            _id: ids.outside,
          }),
        ]);
        await putNodes([{ _id: ids.frame, collapsed: true }]);
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
          await openBoard({ until: canvasShown });
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

      it("folds a shape away with its frame", async function () {
        this.timeout(30000);
        const base = { x: 41000, y: 40000 };
        const frame = Random.id();
        const shape = Random.id();
        await putNodes([
          frameNode(
            base,
            { width: 600, height: 400 },
            { _id: frame, label: "Shaped round" },
          ),
          shapeNode({ x: 40, y: 100 }, { width: 160, height: 120 }, "ellipse", {
            _id: shape,
            parent: frame,
            color: "green",
          }),
        ]);
        lookAt(base);
        try {
          await openBoard({ until: canvasShown });
          await nodeShown(shape);
          const header = await nodeShown(frame);
          await click(
            within(header).getByRole("button", {
              name: "Collapse for everyone",
            }),
          );
          await waitFor(
            async () => {
              assert.isTrue(await isCollapsed(frame));
              assert.isNull(nodeElement(shape));
              assert.include(header.textContent ?? "", "1 item");
            },
            { timeout: 10000 },
          );
          await click(
            within(header).getByRole("button", { name: "Expand for everyone" }),
          );
          await waitFor(() => assert.isNotNull(nodeElement(shape)), {
            timeout: 10000,
          });
        } finally {
          forgetView();
          await removeNodes([frame, shape]);
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
          await openBoard({ until: canvasShown });
          await searchFor("zebra");
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
          await openBoard({ search: `?node=${frameId}`, until: canvasShown });
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
          await openBoard({ until: canvasShown });
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
          await openBoard({ until: canvasShown });
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
        await commentOn("Is this inside?", { node: ids.inside, x: 10, y: 10 });
        let thread: string | undefined;
        try {
          await openBoard({ until: canvasShown });
          thread = await commentId({ "comment.node": ids.inside }, 20000);
          assert.isNull(nodeElement(ids.inside));
          await goTo(`${boardPath}?comment=${thread}`);
          await waitFor(
            () => {
              assert.isNotNull(nodeElement(ids.inside));
              assert.isNotNull(
                document.querySelector(
                  `.jr-comment-pin[data-thread="${thread}"]`,
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
          if (thread) {
            await deleteWhiteboardComment.callPromise({ messageId: thread });
          }
          await removeNodes(Object.values(ids));
        }
      });
    });
    describe("telling a puzzle's people about a comment on its card", function () {
      const OTHER_EMAIL = "card-commenter@example.com";
      const OTHER_PASSWORD = "password";
      const OTHER_NAME = "Card Commenter";
      const SETTING = "Tell me about board comments on puzzles I'm on";
      let other: ReturnType<typeof DDP.connect>;
      let board: { _id: string; puzzle: string };

      before(async function () {
        this.timeout(20000);
        board = await ensureBoard();
        await createTestUser.callPromise({
          email: OTHER_EMAIL,
          password: OTHER_PASSWORD,
          displayName: OTHER_NAME,
        });
        await addHuntUser.callPromise({ huntId, email: OTHER_EMAIL });
        other = DDP.connect(Meteor.absoluteUrl());
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

      const ChatNotifications: typeof import("../../imports/lib/models/ChatNotifications").default =
        require("../../imports/lib/models/ChatNotifications").default;
      const { Subscribers: ClientSubscribers } =
        require("../../imports/client/subscribers") as typeof import("../../imports/client/subscribers");

      // Opens a puzzle's page, which puts this browser on the puzzle, and
      // waits until the server has it there.
      const openPuzzle = async (puzzleId: string) => {
        await goTo(`/hunts/${huntId}/puzzles/${puzzleId}`);
        await waitFor(
          async () =>
            assert.ok(
              await ClientSubscribers.findOneAsync({
                name: `puzzle:${puzzleId}`,
                user: Meteor.userId()!,
              }),
            ),
          { timeout: 20000 },
        );
      };
      const theyComment = (node: string, text: string) =>
        commentOn(text, { node, x: 10, y: 10 }, { via: other });
      const commentToasts = () =>
        [...document.querySelectorAll<HTMLElement>(".toast")].filter((toast) =>
          toast
            .querySelector(".toast-header")
            ?.textContent?.includes("Comment on"),
        );

      it("tells someone with the puzzle open, until they turn it off", async function () {
        this.timeout(60000);
        subs.push(
          await typedSubscribe.async(whiteboardContents, {
            boardId: board._id,
          }),
          await typedSubscribe.async(chatMessagesForPuzzle, {
            puzzleId: board.puzzle,
            huntId,
          }),
        );
        const card = (await WhiteboardNodes.findOneAsync({
          board: board._id,
          type: "puzzle",
          hidden: { $ne: true },
        }))!;
        const cardPuzzle = card.puzzle!;
        const first = "Have a look at this one";
        const second = "And this one";
        const hadDisplayName = !!(await Meteor.userAsync())?.displayName;
        try {
          render(<TestApp />);
          await openPuzzle(cardPuzzle);
          const title = await waitFor(
            async () => {
              const found = await Puzzles.findOneAsync(cardPuzzle);
              assert.ok(found);
              return found.title;
            },
            { timeout: 20000 },
          );

          await theyComment(card._id, first);
          const toast = await waitFor(
            () => {
              const [found] = commentToasts();
              assert.ok(found);
              return found;
            },
            { timeout: 20000 },
          );
          assert.include(
            toast.querySelector(".toast-header")?.textContent ?? "",
            `Comment on ${title}`,
          );
          assert.include(
            toast.querySelector(".toast-body")?.textContent ?? "",
            `${OTHER_NAME}: ${first}`,
          );

          // Following it opens the thread on the board
          const link =
            toast.querySelector<HTMLAnchorElement>(".toast-header a")!;
          await click(link);
          await waitFor(
            () => {
              assert.equal(location.current?.pathname, boardPath);
              assert.include(
                document.querySelector(".react-flow__panel.top.right")
                  ?.textContent ?? "",
                first,
              );
              assert.equal(location.current?.search, "");
            },
            { timeout: 20000 },
          );

          // Turning it off on the profile page stops the next one
          const me = (await Meteor.userAsync())!;
          if (!hadDisplayName) {
            await updateProfile.callPromise({
              displayName: "Board Watcher",
              dingwords: me.dingwords ?? [],
            });
          }
          await goTo("/users/me");
          const setting = await screen.findByLabelText<HTMLInputElement>(
            SETTING,
            {},
            { timeout: 20000 },
          );
          assert.isTrue(setting.checked);
          await act(async () => {
            fireEvent.click(setting);
            fireEvent.click(screen.getByRole("button", { name: "Save" }));
            await stabilize();
          });
          await screen.findByText("Saved changes.", {}, { timeout: 10000 });
          assert.isFalse((await Meteor.userAsync())?.boardCommentNotifications);

          await openPuzzle(cardPuzzle);
          await theyComment(card._id, second);
          // A mention sent after the comment arrives after any row the
          // comment made, so once it's here a board comment row would be too
          await other.callAsync(sendChatMessage.name, {
            puzzleId: board.puzzle,
            content: JSON.stringify({
              type: "message",
              children: [
                { type: "mention", userId: Meteor.userId()! },
                { text: " after the second" },
              ],
            }),
          });
          await waitFor(
            async () =>
              assert.ok(
                await ChatNotifications.findOneAsync({
                  "content.children.text": " after the second",
                }),
              ),
            { timeout: 20000 },
          );
          await settle();
          assert.lengthOf(commentToasts(), 0);
          assert.equal(
            await ChatNotifications.find({
              reason: "boardComment",
            }).countAsync(),
            0,
          );
        } finally {
          await unsetProfileSettings.callPromise({
            displayName: !hadDisplayName,
          });
          for (const cn of await ChatNotifications.find({
            "content.children.text": " after the second",
          }).fetchAsync()) {
            await dismissChatNotification.callPromise({
              chatNotificationId: cn._id,
            });
          }
          for (const text of [first, second]) {
            const thread = await ChatMessages.findOneAsync({
              puzzle: board.puzzle,
              "content.children.text": text,
            });
            if (thread) {
              await other.callAsync(deleteWhiteboardComment.name, {
                messageId: thread._id,
              });
            }
          }
        }
      });
    });
  });
}
