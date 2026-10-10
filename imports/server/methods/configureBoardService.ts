import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { userMayConfigureBoard } from "../../lib/permission_stubs";
import { Url } from "../../lib/typedModel/regexes";
import configureBoardService from "../../methods/configureBoardService";
import { createBoardServiceAccount } from "../boardServiceAccount";
import defineMethod from "./defineMethod";

defineMethod(configureBoardService, {
  validate(arg) {
    check(arg, {
      url: String,
      secret: Match.Optional(String),
    });
    return arg;
  },

  async run({ url, secret }) {
    check(this.userId, String);

    if (!userMayConfigureBoard(await MeteorUsers.findOneAsync(this.userId))) {
      throw new Meteor.Error(401, "Must be admin to configure the board");
    }

    // Trailing slashes would double up when the API paths are appended
    const trimmedUrl = url.trim().replace(/\/+$/, "");
    if (!Url.test(trimmedUrl)) {
      throw new Meteor.Error(400, "The service URL must be an http(s) URL");
    }

    const existing = await Settings.findOneAsync({ name: "board.service" });
    const trimmedSecret = secret?.trim() ?? "";
    const keptSecret =
      trimmedSecret.length > 0 ? trimmedSecret : existing?.value.secret;
    if (!keptSecret) {
      throw new Meteor.Error(400, "A shared secret is needed");
    }

    // The account outlives re-saves; it's only made again if it's gone
    let serviceUserId = existing?.value.serviceUserId;
    let credentials;
    if (!serviceUserId || !(await MeteorUsers.findOneAsync(serviceUserId))) {
      const account = await createBoardServiceAccount();
      serviceUserId = account.userId;
      credentials = { email: account.email, password: account.password };
    }

    Logger.info("Configuring board service", {
      url: trimmedUrl,
      serviceUserId,
      user: this.userId,
    });
    await Settings.upsertAsync(
      { name: "board.service" },
      {
        $set: {
          value: { url: trimmedUrl, secret: keptSecret, serviceUserId },
        },
      },
    );
    return credentials;
  },
});
