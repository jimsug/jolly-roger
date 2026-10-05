import { promisify } from "node:util";
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { assert } from "chai";
import type React from "react";
import type { NavigateFunction } from "react-router";
import {
  MemoryRouter,
  Routes as ReactRouterRoutes,
  Route,
  useNavigate,
} from "react-router";
import Logger from "../../imports/Logger";
import WhiteboardNodes from "../../imports/lib/models/WhiteboardNodes";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import TypedMethod from "../../imports/methods/TypedMethod";
import resetDatabase from "../lib/resetDatabase";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";

// A board the size of a real hunt's: 200 puzzles in 20 rounds, each with a
// meta, and 300 ink strokes of 100 points over the first rounds, 50 sticky
// notes and 50 lines on top. Seeded straight into the database, as a busy
// hunt would leave it.
const HUNT_SIZE = {
  rounds: 20,
  puzzlesPerRound: 10,
  strokes: 300,
  pointsPerStroke: 100,
  stickies: 50,
  lines: 50,
};

const seedHuntSizedBoard = new TypedMethod<
  Record<string, never>,
  { huntId: string; boardId: string; firstFrame: { x: number; y: number } }
>("test.methods.whiteboard.seedHuntSizedBoard");

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;
  const Hunts: typeof import("../../imports/lib/models/Hunts").default =
    require("../../imports/lib/models/Hunts").default;
  const MeteorUsers: typeof import("../../imports/lib/models/MeteorUsers").default =
    require("../../imports/lib/models/MeteorUsers").default;
  const Puzzles: typeof import("../../imports/lib/models/Puzzles").default =
    require("../../imports/lib/models/Puzzles").default;
  const Tags: typeof import("../../imports/lib/models/Tags").default =
    require("../../imports/lib/models/Tags").default;
  const WhiteboardEdges: typeof import("../../imports/lib/models/WhiteboardEdges").default =
    require("../../imports/lib/models/WhiteboardEdges").default;
  const {
    ensureWhiteboard,
  }: typeof import("../../imports/server/whiteboard") = require("../../imports/server/whiteboard");

  defineMethod(seedHuntSizedBoard, {
    validate(arg: unknown) {
      check(arg, {});
      return arg as Record<string, never>;
    },

    async run() {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      check(this.userId, String);
      const userId: string = this.userId;
      const huntId = await Hunts.insertAsync({
        name: "Hunt-sized board",
        openSignups: true,
        hasGuessQueue: true,
        createdBy: userId,
      });
      await MeteorUsers.updateAsync(userId, {
        $addToSet: { hunts: huntId },
        $set: { [`roles.${huntId}`]: ["operator"] },
      });

      const tag = (name: string) =>
        Tags.insertAsync({ hunt: huntId, name, createdBy: userId });
      const isMeta = await tag("is:meta");
      for (let r = 0; r < HUNT_SIZE.rounds; r++) {
        const round = `round-${r + 1}`;
        const group = await tag(`group:${round}`);
        const metaFor = await tag(`meta-for:${round}`);
        for (let p = 0; p < HUNT_SIZE.puzzlesPerRound; p++) {
          await Puzzles.insertAsync({
            hunt: huntId,
            title: p === 0 ? `Meta ${r + 1}` : `Puzzle ${r + 1}.${p}`,
            tags: p === 0 ? [group, isMeta, metaFor] : [group],
            answers: [],
            expectedAnswerCount: 1,
            createdBy: userId,
          });
        }
      }

      const boardId = await ensureWhiteboard(userId, huntId);
      const firstFrame = (await WhiteboardNodes.findOneAsync(
        { board: boardId, type: "frame", tag: { $exists: true } },
        { sort: { "position.y": 1, "position.x": 1 } },
      ))!.position;

      // A wandering stroke, so simplifying it would keep most of it
      const stroke = (s: number) => {
        let x = 0;
        let y = 0;
        return Array.from(
          { length: HUNT_SIZE.pointsPerStroke },
          (_, i): [number, number, number] => {
            x += 4 + ((s + i) % 3);
            y += ((s * 7 + i * 13) % 9) - 4;
            return [x, y + 40, 0.5];
          },
        );
      };
      await WhiteboardNodes.insertManyAsync(
        Array.from({ length: HUNT_SIZE.strokes }, (_, s) => ({
          hunt: huntId,
          board: boardId,
          type: "ink" as const,
          // Over the first rounds' frames, where the test opens the board,
          // so drawing it is part of what's timed
          position: {
            x: firstFrame.x + (s % 20) * 60,
            y: firstFrame.y + Math.floor(s / 20) * 40,
          },
          width: 600,
          height: 120,
          strokeWidth: "medium" as const,
          color: "black" as const,
          stroke: Random.id(),
          points: stroke(s),
          createdBy: userId,
        })),
      );
      const stickies = Array.from({ length: HUNT_SIZE.stickies }, () =>
        Random.id(),
      );
      await WhiteboardNodes.insertManyAsync(
        stickies.map((_id, i) => ({
          _id,
          hunt: huntId,
          board: boardId,
          type: "sticky" as const,
          position: { x: (i % 10) * 300, y: 9000 + Math.floor(i / 10) * 250 },
          width: 160,
          height: 120,
          text: `Note ${i + 1}`,
          color: "yellow" as const,
          createdBy: userId,
        })),
      );
      await WhiteboardEdges.insertManyAsync(
        Array.from({ length: HUNT_SIZE.lines }, (_, i) => ({
          hunt: huntId,
          board: boardId,
          source: stickies[i]!,
          target: stickies[(i + 1) % stickies.length]!,
          createdBy: userId,
        })),
      );
      return { huntId, boardId, firstFrame };
    },
  });
}

if (Meteor.isClient) {
  const Routes: typeof import("../../imports/client/components/Routes").default =
    require("../../imports/client/components/Routes").default;

  const navigate: React.RefObject<NavigateFunction | null> = {
    current: null,
  };
  const NavigateCapture = () => {
    navigate.current = useNavigate();
    return null;
  };
  const TestApp = () => (
    <MemoryRouter>
      <Routes />
      <ReactRouterRoutes>
        <Route path="*" element={<NavigateCapture />} />
      </ReactRouterRoutes>
    </MemoryRouter>
  );

  // Ceilings well above what the board takes, so a run on a slow machine
  // passes and only a real regression fails.
  const FIRST_CARD_CEILING_MS = 8000;
  const INK_SHOWN_CEILING_MS = 8000;
  const DRAG_SAVED_CEILING_MS = 2000;

  describe("hunt-sized whiteboard", function () {
    before(async function () {
      this.timeout(20000);
      await resetDatabase("hunt-sized whiteboard");
      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
    });

    it("shows its first card and its ink, and saves a drag, in good time", async function () {
      this.timeout(90000);
      const { huntId, boardId, firstFrame } =
        await seedHuntSizedBoard.callPromise({});

      // Opens on the first round's frame at zoom 1
      localStorage.setItem(
        `whiteboard:viewport:${boardId}`,
        JSON.stringify({
          x: 100 - firstFrame.x,
          y: 100 - firstFrame.y,
          zoom: 1,
        }),
      );

      try {
        render(<TestApp />);
        let opened = 0;
        await act(async () => {
          await stabilize();
          opened = performance.now();
          await navigate.current!(`/hunts/${huntId}/whiteboard`);
        });
        const cardShown = (timeout: number) =>
          waitFor(
            () => {
              const found = document.querySelector<HTMLElement>(
                ".react-flow__node-puzzle",
              );
              assert.exists(found);
              return found;
            },
            { timeout, interval: 20 },
          );
        await cardShown(30000);
        const firstCardMs = performance.now() - opened;

        // Every stroke has arrived and those in view are drawn, so the drag
        // below runs with the whole board there
        await waitFor(
          async () => {
            assert.equal(
              await WhiteboardNodes.find({
                board: boardId,
                type: "ink",
                points: { $exists: true },
              }).countAsync(),
              HUNT_SIZE.strokes,
            );
            assert.exists(
              document.querySelector(".react-flow__node-ink path[d^='M']"),
            );
          },
          { timeout: 30000, interval: 20 },
        );
        const inkShownMs = performance.now() - opened;

        await act(async () => {
          await stabilize();
        });
        // A card shown once everything has arrived, which needn't be the
        // first one drawn
        const shown = await cardShown(10000);
        const cardId = shown.dataset.id!;
        const before = (await WhiteboardNodes.findOneAsync(cardId))!.position;
        const box = shown.getBoundingClientRect();
        const start = {
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        };
        const mouse = { button: 0, view: window };
        const to = {
          ...mouse,
          clientX: start.clientX + 30,
          clientY: start.clientY + 20,
        };
        // The first move starts the drag; the card is saved when it's let
        // go, which is what's timed.
        await act(async () => {
          fireEvent.mouseDown(shown, { ...mouse, ...start });
          await stabilize();
        });
        for (const point of [
          { ...mouse, clientX: start.clientX + 2, clientY: start.clientY },
          to,
        ]) {
          await act(async () => {
            fireEvent.mouseMove(window, point);
            await stabilize();
          });
        }
        const dropped = performance.now();
        act(() => {
          fireEvent.mouseUp(window, to);
        });
        await waitFor(
          async () => {
            const saved = (await WhiteboardNodes.findOneAsync(cardId))!;
            assert.notDeepEqual(saved.position, before);
          },
          { timeout: 30000, interval: 20 },
        );
        const dragSavedMs = performance.now() - dropped;

        Logger.info("Hunt-sized whiteboard timings", {
          firstCardMs: Math.round(firstCardMs),
          inkShownMs: Math.round(inkShownMs),
          dragSavedMs: Math.round(dragSavedMs),
        });
        assert.isBelow(firstCardMs, FIRST_CARD_CEILING_MS);
        assert.isBelow(inkShownMs, INK_SHOWN_CEILING_MS);
        assert.isBelow(dragSavedMs, DRAG_SAVED_CEILING_MS);
      } finally {
        localStorage.removeItem(`whiteboard:viewport:${boardId}`);
      }
    });
  });
}
