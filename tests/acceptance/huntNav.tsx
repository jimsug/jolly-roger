import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "styled-components";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import huntForHuntApp from "../../imports/lib/publications/huntForHuntApp";
import addHuntUser from "../../imports/methods/addHuntUser";
import createHunt from "../../imports/methods/createHunt";
import createWhiteboard from "../../imports/methods/createWhiteboard";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import resetDatabase from "../lib/resetDatabase";
import createTestUser from "./createTestUser";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const HuntNav: typeof import("../../imports/client/components/HuntNav").default =
    require("../../imports/client/components/HuntNav").default;
  const {
    lightTheme,
  }: typeof import("../../imports/client/theme") = require("../../imports/client/theme");
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const huntFields: EditableHuntType = {
    name: "Nav Hunt",
    mailingLists: [],
    openSignups: false,
    hasGuessQueue: true,
    defaultRoles: [],
    allowUnlockablePuzzles: false,
    isArchived: false,
    customLinkEmbed: false,
    homepageUrl: "https://example.com/hunt",
  };

  const MEMBER_EMAIL = "member@example.com";
  const MEMBER_PASSWORD = "password";

  const login = (email: string, password: string) =>
    promisify(Meteor.loginWithPassword)(email, password);

  const renderNav = (huntId: string) =>
    render(
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter initialEntries={[`/hunts/${huntId}/puzzles`]}>
          <Routes>
            <Route path="/hunts/:huntId/*" element={<HuntNav />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

  // Every entry in the bar carries a title, whereas its label is hidden on
  // narrow viewports
  const linkTitles = () =>
    screen.getAllByRole("link").map((link) => link.getAttribute("title"));

  describe("HuntNav", function () {
    let huntId: string;
    let huntSub: { stop: () => void } | undefined;

    before(async function () {
      this.timeout(10000);
      await resetDatabase("HuntNav");
      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await login(USER_EMAIL, USER_PASSWORD);
      huntId = await createHunt.callPromise({
        ...huntFields,
        initialTags: "",
      });
      await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
      await createTestUser.callPromise({
        email: MEMBER_EMAIL,
        password: MEMBER_PASSWORD,
        displayName: "Member",
      });
      await addHuntUser.callPromise({ huntId, email: MEMBER_EMAIL });
    });

    afterEach(function () {
      cleanup();
      huntSub?.stop();
      huntSub = undefined;
    });

    it("gives operators the Notes and Tags links, but no Guesses or Firehose", async function () {
      this.timeout(10000);
      await login(USER_EMAIL, USER_PASSWORD);
      huntSub = await typedSubscribe.async(huntForHuntApp, { huntId });
      await stabilize();

      renderNav(huntId);
      await screen.findByTitle("Tags");
      assert.deepEqual(linkTitles(), [
        "Announcements",
        "Hunters",
        "Whiteboard",
        "Notes",
        "Tags",
        "Open the hunt homepage",
        "More",
      ]);
    });

    it("gives members only the shared links", async function () {
      this.timeout(10000);
      await promisify(Meteor.logout)();
      await login(MEMBER_EMAIL, MEMBER_PASSWORD);
      huntSub = await typedSubscribe.async(huntForHuntApp, { huntId });
      await stabilize();

      renderNav(huntId);
      await screen.findByTitle("More");
      assert.deepEqual(linkTitles(), [
        "Announcements",
        "Hunters",
        "Open the hunt homepage",
        "More",
      ]);
    });

    it("gives members the whiteboard once there is one", async function () {
      this.timeout(10000);
      await promisify(Meteor.logout)();
      await login(USER_EMAIL, USER_PASSWORD);
      await createWhiteboard.callPromise({ huntId });
      await promisify(Meteor.logout)();
      await login(MEMBER_EMAIL, MEMBER_PASSWORD);
      huntSub = await typedSubscribe.async(huntForHuntApp, { huntId });
      await stabilize();

      renderNav(huntId);
      await screen.findByTitle("Whiteboard");
      assert.deepEqual(linkTitles(), [
        "Announcements",
        "Hunters",
        "Whiteboard",
        "Open the hunt homepage",
        "More",
      ]);
    });
  });
}
