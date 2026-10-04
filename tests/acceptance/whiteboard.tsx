import { promisify } from "node:util";
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import {
  act,
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
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import createWhiteboard from "../../imports/methods/createWhiteboard";
import deleteWhiteboardComment from "../../imports/methods/deleteWhiteboardComment";
import deleteWhiteboardNodes from "../../imports/methods/deleteWhiteboardNodes";
import promoteOperator from "../../imports/methods/promoteOperator";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import removePuzzleTag from "../../imports/methods/removePuzzleTag";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import setWhiteboardEditPolicy from "../../imports/methods/setWhiteboardEditPolicy";
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
  });
}
