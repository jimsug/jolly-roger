import { check } from "meteor/check";
import upsertWhiteboardEdgesMethod from "../../methods/upsertWhiteboardEdges";
import { EdgeInputPattern, upsertEdges } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

defineMethod(upsertWhiteboardEdgesMethod, {
  validate(arg) {
    check(arg, { boardId: String, edges: [EdgeInputPattern] });
    return arg;
  },

  async run({ boardId, edges }) {
    check(this.userId, String);
    await upsertEdges(this.userId, boardId, edges);
  },
});
