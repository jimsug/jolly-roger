import { z } from "zod";
import { foreignKey, nonEmptyString } from "./customTypes";
import type { ModelType } from "./Model";
import Model from "./Model";
import withCommon from "./withCommon";

const Whiteboard = withCommon(
  z.object({
    hunt: foreignKey,
    // The hidden puzzle (kind: "whiteboard") that carries the board's chat and
    // call.
    puzzle: foreignKey,
    title: nonEmptyString,
  }),
);

const Whiteboards = new Model("jr_whiteboards", Whiteboard);
Whiteboards.addIndex({ hunt: 1 }, { unique: true });
Whiteboards.addIndex({ puzzle: 1 });
export type WhiteboardType = ModelType<typeof Whiteboards>;

export default Whiteboards;
