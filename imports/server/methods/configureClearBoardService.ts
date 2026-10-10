import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { userMayConfigureBoard } from "../../lib/permission_stubs";
import configureClearBoardService from "../../methods/configureClearBoardService";
import defineMethod from "./defineMethod";

defineMethod(configureClearBoardService, {
  async run() {
    check(this.userId, String);
    if (!userMayConfigureBoard(await MeteorUsers.findOneAsync(this.userId))) {
      throw new Meteor.Error(401, "Must be admin to configure the board");
    }
    Logger.info("Clearing board service", { user: this.userId });
    await Settings.removeAsync({ name: "board.service" });
  },
});
