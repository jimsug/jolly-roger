import type { WhiteboardEditPolicy } from "../lib/models/Whiteboards";
import TypedMethod from "./TypedMethod";

// Chooses who may edit a hunt's board: everyone in the hunt, its operators,
// or its operators and the people listed. Only the hunt's assigned operators
// and admins may change it. Everyone in the hunt can still view the board and
// comment on it.
export default new TypedMethod<
  {
    boardId: string;
    editPolicy: WhiteboardEditPolicy;
    editors: string[];
  },
  void
>("Whiteboards.methods.setEditPolicy");
