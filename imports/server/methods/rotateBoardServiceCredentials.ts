import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { userMayConfigureBoard } from "../../lib/permission_stubs";
import rotateBoardServiceCredentials from "../../methods/rotateBoardServiceCredentials";
import { rotateBoardServiceCredentials as rotate } from "../boardServiceAccount";
import defineMethod from "./defineMethod";

defineMethod(rotateBoardServiceCredentials, {
  async run() {
    check(this.userId, String);
    if (!userMayConfigureBoard(await MeteorUsers.findOneAsync(this.userId))) {
      throw new Meteor.Error(401, "Must be admin to configure the board");
    }
    const service = await Settings.findOneAsync({ name: "board.service" });
    if (!service) {
      throw new Meteor.Error(400, "The board service isn't set up");
    }
    return rotate(service.value.serviceUserId);
  },
});
