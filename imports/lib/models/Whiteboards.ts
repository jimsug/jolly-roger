import { z } from "zod";
import { foreignKey } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import Model from "../typedModel/Model";
import withCommon from "../typedModel/withCommon";

const Whiteboard = withCommon(
  z.object({
    hunt: foreignKey,
    // The hidden puzzle (kind: "whiteboard") that carries the board's chat and
    // call.
    puzzle: foreignKey,
  }),
);

const Whiteboards = new Model("jr_whiteboards", Whiteboard);
Whiteboards.addIndex({ hunt: 1 }, { unique: true });
Whiteboards.addIndex({ puzzle: 1 });
export type WhiteboardType = ModelType<typeof Whiteboards>;

export default Whiteboards;
