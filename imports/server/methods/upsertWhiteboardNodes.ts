import { check } from "meteor/check";
import type { WhiteboardNodeInput } from "../../methods/upsertWhiteboardNodes";
import upsertWhiteboardNodesMethod from "../../methods/upsertWhiteboardNodes";
import { NodeInputPattern, upsertNodes } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(upsertWhiteboardNodesMethod, {
  validate(arg) {
    check(arg, { boardId: String, nodes: [NodeInputPattern] });
    // Ink point arity is checked when the nodes are applied.
    return arg as { boardId: string; nodes: WhiteboardNodeInput[] };
  },

  async run({ boardId, nodes }) {
    check(this.userId, String);
    await upsertNodes(this.userId, boardId, nodes);
  },
});
