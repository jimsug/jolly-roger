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
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import createWhiteboard from "../../imports/methods/createWhiteboard";
import deleteWhiteboardNodes from "../../imports/methods/deleteWhiteboardNodes";
import promoteOperator from "../../imports/methods/promoteOperator";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
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

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;

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
