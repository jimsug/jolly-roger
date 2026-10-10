import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "styled-components";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import huntForHuntApp from "../../imports/lib/publications/huntForHuntApp";
import addHuntUser from "../../imports/methods/addHuntUser";
import createHunt from "../../imports/methods/createHunt";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import setFeatureFlag from "../../imports/methods/setFeatureFlag";
import TypedMethod from "../../imports/methods/TypedMethod";
import resetDatabase from "../lib/resetDatabase";
import createTestUser from "./createTestUser";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";

// Test-only: stands up a stub of the board service on the server and points
// the board.service setting at it, so the real methods can be driven from
// the browser. Returns the stub's URL.
const configureStubBoardService = new TypedMethod<
  { serviceUserId: string },
  string
>("test.methods.configureStubBoardService");

if (Meteor.isServer) {
  const { createServer }: typeof import("node:http") = require("node:http");
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;
  const Settings: typeof import("../../imports/lib/models/Settings").default =
    require("../../imports/lib/models/Settings").default;

  const SECRET = "a shared secret at least thirty-two characters long";
  let server: Server | undefined;
  let base = "";

  defineMethod(configureStubBoardService, {
    validate(arg: unknown) {
      check(arg, { serviceUserId: String });
      return arg;
    },

    async run({ serviceUserId }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }
      if (!server) {
        server = createServer((req: IncomingMessage, res: ServerResponse) => {
          let raw = "";
          req.on("data", (chunk: Buffer) => {
            raw += chunk.toString("utf8");
          });
          req.on("end", () => {
            if (
              req.headers.authorization !== `Bearer ${SECRET}` ||
              req.method !== "POST" ||
              req.url !== "/boards"
            ) {
              res.statusCode = 404;
              res.end("{}");
              return;
            }
            const { scope } = JSON.parse(raw) as { scope: { hunt: string } };
            const id = `board${scope.hunt}`;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ id, url: `${base}/boards/${id}` }));
          });
        });
        await new Promise<void>((resolve) => {
          server!.listen(0, "127.0.0.1", resolve);
        });
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      }
      await Settings.upsertAsync(
        { name: "board.service" },
        { $set: { value: { url: base, secret: SECRET, serviceUserId } } },
      );
      return base;
    },
  });
}

if (Meteor.isClient) {
  const BoardPage: typeof import("../../imports/client/components/BoardPage").default =
    require("../../imports/client/components/BoardPage").default;
  const HuntNav: typeof import("../../imports/client/components/HuntNav").default =
    require("../../imports/client/components/HuntNav").default;
  const {
    lightTheme,
  }: typeof import("../../imports/client/theme") = require("../../imports/client/theme");
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const huntFields: EditableHuntType = {
    name: "Board Hunt",
    mailingLists: [],
    openSignups: false,
    hasGuessQueue: true,
    defaultRoles: [],
    allowUnlockablePuzzles: false,
    isArchived: false,
    customLinkEmbed: false,
  };

  const MEMBER_EMAIL = "member@example.com";
  const MEMBER_PASSWORD = "password";

  const login = (email: string, password: string) =>
    promisify(Meteor.loginWithPassword)(email, password);
  const logout = () => promisify(Meteor.logout)();

  const renderPage = (huntId: string) =>
    render(
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter initialEntries={[`/hunts/${huntId}/board`]}>
          <Routes>
            <Route
              path="/hunts/:huntId/board"
              element={
                <>
                  <HuntNav />
                  <BoardPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

  const navTitles = () =>
    screen.getAllByRole("link").map((link) => link.getAttribute("title"));

  // The board's frame, once the page has a token to open it with
  const findFrame = () =>
    waitFor(
      () => {
        const iframe = document.body.querySelector("iframe");
        assert.isNotNull(iframe);
        return iframe;
      },
      { timeout: 5000 },
    );

  describe("board", function () {
    let huntId: string;
    let serviceUrl: string;
    let huntSub: { stop: () => void } | undefined;

    before(async function () {
      this.timeout(10000);
      await resetDatabase("board");
      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await login(USER_EMAIL, USER_PASSWORD);
      huntId = await createHunt.callPromise({
        ...huntFields,
        initialTags: [],
      });
      await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
      await createTestUser.callPromise({
        email: MEMBER_EMAIL,
        password: MEMBER_PASSWORD,
        displayName: "Member",
      });
      await addHuntUser.callPromise({ huntId, email: MEMBER_EMAIL });
      const serviceUserId = await createTestUser.callPromise({
        email: "board@example.com",
        password: "password",
        displayName: "Board service",
      });
      serviceUrl = await configureStubBoardService.callPromise({
        serviceUserId,
      });
    });

    afterEach(function () {
      cleanup();
      huntSub?.stop();
      huntSub = undefined;
    });

    it("shows nothing of the board while it's switched off", async function () {
      this.timeout(10000);
      await setFeatureFlag.callPromise({ name: "disable.board", type: "on" });
      huntSub = await typedSubscribe.async(huntForHuntApp, { huntId });
      // Feature flags reach every client without a subscription, and the
      // method's result waits for the write to arrive
      await stabilize();

      renderPage(huntId);
      try {
        await screen.findByText("The board is turned off.");
        assert.notInclude(navTitles(), "Board");
        assert.isNull(document.body.querySelector("iframe"));
      } finally {
        await setFeatureFlag.callPromise({
          name: "disable.board",
          type: "off",
        });
      }
    });

    it("lets an operator create the board, then shows it in a frame with a token", async function () {
      this.timeout(10000);
      huntSub = await typedSubscribe.async(huntForHuntApp, { huntId });
      await stabilize();

      renderPage(huntId);
      (await screen.findByRole("button", { name: "Create board" })).click();
      assert.include(navTitles(), "Board");

      const iframe = await findFrame();
      const src = new URL(iframe.getAttribute("src")!);
      assert.equal(
        `${src.origin}${src.pathname}`,
        `${serviceUrl}/boards/board${huntId}`,
      );
      assert.isNotEmpty(src.searchParams.get("token"));
    });

    it("shows members the board once there is one", async function () {
      this.timeout(10000);
      await logout();
      await login(MEMBER_EMAIL, MEMBER_PASSWORD);
      huntSub = await typedSubscribe.async(huntForHuntApp, { huntId });
      await stabilize();

      renderPage(huntId);
      const iframe = await findFrame();
      assert.include(iframe.getAttribute("src"), "token=");
      assert.include(navTitles(), "Board");
    });
  });
}
