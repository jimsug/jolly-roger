import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { assert } from "chai";
import type React from "react";
import { act } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import {
  MemoryRouter,
  Routes as ReactRouterRoutes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";
import FixtureHunt from "../../imports/FixtureHunt";
import ChatMessages from "../../imports/lib/models/ChatMessages";
import Whiteboards from "../../imports/lib/models/Whiteboards";
import addHuntUser from "../../imports/methods/addHuntUser";
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import createWhiteboard from "../../imports/methods/createWhiteboard";
import promoteOperator from "../../imports/methods/promoteOperator";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import resetDatabase from "../lib/resetDatabase";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const Routes: typeof import("../../imports/client/components/Routes").default =
    require("../../imports/client/components/Routes").default;

  const location: React.MutableRefObject<Location | null> = { current: null };
  const navigate: React.MutableRefObject<NavigateFunction | null> = {
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
      navigate.current!(url);
      await stabilize();
    });
  };

  describe("whiteboard page", function () {
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
      await waitFor(() =>
        screen.getByRole("button", { name: "Create whiteboard" }),
      );
    });

    it("shows the canvas and chat once there's a board", async function () {
      this.timeout(30000);
      await createWhiteboard.callPromise({ huntId });
      render(<TestApp />);
      await goTo(boardPath);
      await waitFor(
        () => {
          assert.isNotNull(document.querySelector(".react-flow__node-puzzle"));
          assert.isNotNull(document.querySelector(".react-flow__node-frame"));
        },
        { timeout: 20000 },
      );
    });

    it("sends the backing puzzle's page to the board", async function () {
      this.timeout(10000);
      render(<TestApp />);
      await goTo(boardPath);
      const board = await waitFor(async () => {
        const found = await Whiteboards.findOneAsync({ hunt: huntId });
        assert.ok(found);
        return found!;
      });
      await goTo(`/hunts/${huntId}/puzzles/${board.puzzle}`);
      await waitFor(() => {
        assert.equal(location.current?.pathname, boardPath);
      });
    });

    it("doesn't let things be picked up while the line tool is in use", async function () {
      this.timeout(30000);
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

    describe("comments", function () {
      const panelText = () =>
        document.querySelector(".react-flow__panel.top.right")?.textContent ??
        "";

      let commentId: string;
      before(async function () {
        this.timeout(30000);
        render(<TestApp />);
        await goTo(boardPath);
        const board = await waitFor(
          async () => {
            const found = await Whiteboards.findOneAsync({ hunt: huntId });
            assert.ok(found);
            return found!;
          },
          { timeout: 20000 },
        );
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
        commentId = await waitFor(
          async () => {
            const found = await ChatMessages.findOneAsync({
              comment: { $exists: true },
            });
            assert.ok(found);
            return found!._id;
          },
          { timeout: 20000 },
        );
        await goTo(`${boardPath}?comment=${commentId}`);
        await waitFor(
          () => {
            assert.isNotNull(
              document.querySelector(
                `.jr-comment-pin[data-comment="${commentId}"]`,
              ),
            );
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
        const show = await waitFor(
          () => screen.getAllByRole("button", { name: "Show on board" })[0]!,
          { timeout: 20000 },
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
  });
}
