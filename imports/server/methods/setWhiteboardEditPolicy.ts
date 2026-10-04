import { check, Match } from "meteor/check";
import { WhiteboardEditPolicies } from "../../lib/models/Whiteboards";
import setWhiteboardEditPolicy from "../../methods/setWhiteboardEditPolicy";
import { setEditPolicy } from "../whiteboardPolicy";
import defineMethod from "./defineMethod";

defineMethod(setWhiteboardEditPolicy, {
  validate(arg) {
    check(arg, {
      boardId: String,
      editPolicy: Match.OneOf(...WhiteboardEditPolicies),
      editors: [String],
    });
    return arg;
  },

  async run({ boardId, editPolicy, editors }) {
    check(this.userId, String);
    await setEditPolicy(this.userId, boardId, editPolicy, editors);
  },
});
