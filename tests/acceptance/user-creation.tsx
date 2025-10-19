import { Meteor } from "meteor/meteor";
import { render, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert } from "chai";
import React, { act } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import {
  MemoryRouter,
  Route,
  useLocation,
  Routes as ReactRouterRoutes,
  useNavigate,
} from "react-router-dom";
import { promisify } from "util";
import { check } from "meteor/check";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import resetDatabase from "../lib/resetDatabase";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";
import TypedMethod from "../../imports/methods/TypedMethod";
import Hunts from "../../imports/lib/models/Hunts";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";

const createHunt = new TypedMethod<{ name: string }, string>(
  "test.methods.user-creation.createHunt",
);

const getEnrollmentToken = new TypedMethod<{ email: string }, string>(
  "test.methods.user-creation.getEnrollmentToken",
);

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;

  defineMethod(createHunt, {
    validate(arg: unknown) {
      check(arg, {
        name: String,
      });

      return arg;
    },

    async run({ name }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      const u = await Meteor.users.findOneAsync();
      if (!u) {
        throw new Meteor.Error(500, "No users found");
      }

      return Hunts.insertAsync({ name, hasGuessQueue: true, createdBy: u._id });
    },
  });

  defineMethod(getEnrollmentToken, {
    validate(arg: unknown) {
      check(arg, {
        email: String,
      });

      return arg;
    },

    async run({ email }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      const u = await MeteorUsers.findOneAsync({ "emails.address": email });
      if (!u) {
        throw new Meteor.Error(500, "No user found");
      }

      return u.services.password.enroll.token;
    },
  });
}

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

  const TestApp = () => {
    return (
      <MemoryRouter>
        <Routes />
        <ReactRouterRoutes>
          <Route path="*" element={<LocationCapture />} />
        </ReactRouterRoutes>
      </MemoryRouter>
    );
  };

  describe("user creation", function () {
    afterEach(function () {
      cleanup();
      location.current = null;
      navigate.current = null;
    });

    describe("first user creation", function () {
      before(async function () {
        await resetDatabase("user creation first user creation");
      });

      it("creates the first user and logs them in", async function () {
        render(<TestApp />);
        await act(async () => {
          await stabilize();
        });
        assert.equal(location.current?.pathname, "/create-first-user");

        const user = userEvent.setup();
        const emailInput = await screen.findByLabelText("Email");
        const passwordInput = await screen.findByLabelText("Password");
        const submitButton = screen.getByRole("button", { name: "Create" });

        await user.type(emailInput, USER_EMAIL);
        await user.type(passwordInput, USER_PASSWORD);
        await user.click(submitButton);

        await act(async () => {
          await stabilize();
        });

        assert.equal(location.current?.pathname, "/hunts");
        assert.isNotNull(Meteor.user());
      });
    });

    describe("second user", function () {
      const invitedUserEmail = "user2@example.com";
      before(async function () {
        await resetDatabase("user creation second user");
        await provisionFirstUser.callPromise({
          email: USER_EMAIL,
          password: USER_PASSWORD,
        });
        await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
      });

      it("invites a second user to a hunt", async function () {
        const huntId = await createHunt.callPromise({ name: "Test Hunt" });
        render(<TestApp />);
        await act(async () => {
          await stabilize();
          navigate.current!(`/hunts/${huntId}/hunters/invite`);
          await stabilize();
        });

        assert.equal(
          location.current?.pathname,
          `/hunts/${huntId}/hunters/invite`,
        );

        const user = userEvent.setup();
        const emailInput = await screen.findByLabelText("E-mail address");
        const submitButton = screen.getByRole("button", { name: "Send invite" });

        await user.type(emailInput, invitedUserEmail);
        await user.click(submitButton);

        await act(async () => {
          await stabilize();
        });

        assert.equal(location.current?.pathname, `/hunts/${huntId}`);

        await act(async () => {
          navigate.current!(`/hunts/${huntId}/hunters/invite`);
          await stabilize();
        });

        assert.isNotNull(await screen.findByText(invitedUserEmail));
      });

      it("allows an invited user to register", async function () {
        const token = await getEnrollmentToken.callPromise({
          email: invitedUserEmail,
        });

        await promisify(Meteor.logout)();

        render(<TestApp />);
        await act(async () => {
          await stabilize();
          navigate.current!(`/enroll/${token}`);
          await stabilize();
        });
        assert.equal(location.current?.pathname, `/enroll/${token}`);

        const user = userEvent.setup();
        const passwordInput = await screen.findByLabelText("Password");
        const displayNameInput = await screen.findByLabelText("Display name");
        const submitButton = screen.getByRole("button", { name: "Register" });

        await user.type(passwordInput, "password2");
        await user.type(displayNameInput, "User 2");
        await user.click(submitButton);

        await act(async () => {
          await stabilize();
        });

        assert.equal(location.current?.pathname, "/hunts");
        assert.isNotNull(Meteor.user());
        assert.equal(Meteor.user()?.emails?.[0]?.address, invitedUserEmail);
      });
    });
  });
}
