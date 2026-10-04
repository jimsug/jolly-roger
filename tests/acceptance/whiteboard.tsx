import { promisify } from "node:util";
import { Accounts } from "meteor/accounts-base";
import { check } from "meteor/check";
import { DDP } from "meteor/ddp";
import { Meteor } from "meteor/meteor";
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
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  GAP,
} from "../../imports/lib/whiteboard/layout";
import addHuntUser from "../../imports/methods/addHuntUser";
import addPuzzleTag from "../../imports/methods/addPuzzleTag";
import createChatImageUpload from "../../imports/methods/createChatImageUpload";
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import createWhiteboard from "../../imports/methods/createWhiteboard";
import deleteWhiteboardComment from "../../imports/methods/deleteWhiteboardComment";
import deleteWhiteboardEdges from "../../imports/methods/deleteWhiteboardEdges";
import deleteWhiteboardNodes from "../../imports/methods/deleteWhiteboardNodes";
import promoteOperator from "../../imports/methods/promoteOperator";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import removePuzzleTag from "../../imports/methods/removePuzzleTag";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import setWhiteboardCommentResolved from "../../imports/methods/setWhiteboardCommentResolved";
import setWhiteboardEditPolicy from "../../imports/methods/setWhiteboardEditPolicy";
import setWhiteboardLive from "../../imports/methods/setWhiteboardLive";
import TypedMethod from "../../imports/methods/TypedMethod";
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

// Solving or unsolving a puzzle without going through guesses.
const setPuzzleAnswers = new TypedMethod<
  { puzzleId: string; answers: string[] },
  void
>("test.methods.whiteboard.setPuzzleAnswers");

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
        before(async function () {
          this.timeout(10000);
          await setPolicy("operators");
          await promisify(Meteor.logout)();
          await login(MEMBER_EMAIL, MEMBER_PASSWORD);
        });

        after(async function () {
          this.timeout(10000);
          await promisify(Meteor.logout)();
          await login(USER_EMAIL, USER_PASSWORD);
          await setPolicy("members");
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
          const toolbar = await waitFor(() => {
            const found = document.querySelector<HTMLElement>(
              ".react-flow__node-toolbar",
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
            },
            { timeout: 10000 },
          );
        } finally {
          forgetView();
          await removeNodes([sticky, frame]);
        }
      });

      it("switches between the board and chat on a narrow screen", async function () {
        this.timeout(30000);
        const width = Object.getOwnPropertyDescriptor(window, "innerWidth");
        Object.defineProperty(window, "innerWidth", {
          configurable: true,
          value: 500,
        });
        const realMatchMedia = window.matchMedia.bind(window);
        const matchMedia = sinon
          .stub(window, "matchMedia")
          .callsFake((query: string) => {
            if (!query.includes("min-width")) return realMatchMedia(query);
            return {
              matches: false,
              media: query,
              onchange: null,
              addEventListener: sinon.fake(),
              removeEventListener: sinon.fake(),
              addListener: sinon.fake(),
              removeListener: sinon.fake(),
              dispatchEvent: () => false,
            } as MediaQueryList;
          });
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
          matchMedia.restore();
          if (width) {
            Object.defineProperty(window, "innerWidth", width);
          } else {
            delete (window as { innerWidth?: number }).innerWidth;
          }
        }
      });

      describe("with someone else on the board", function () {
        const OTHER_EMAIL = "second-member@example.com";
        const OTHER_PASSWORD = "password";
        const OTHER_NAME = "Second Member";
        let other: ReturnType<typeof DDP.connect>;
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
              assert.include(
                note?.textContent ?? "",
                "S3 presignedPost creation failed",
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
      });
    });
  });
}
