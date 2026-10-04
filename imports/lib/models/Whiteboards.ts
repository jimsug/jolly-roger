import { z } from "zod";
import { foreignKey } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import Model from "../typedModel/Model";
import withCommon from "../typedModel/withCommon";

// Who may edit the board. Unset means "members". Everyone in the hunt can
// view the board and comment on it whatever this says.
export const WhiteboardEditPolicies = [
  "members",
  "operators",
  "operatorsAndEditors",
] as const;
export type WhiteboardEditPolicy = (typeof WhiteboardEditPolicies)[number];

const Whiteboard = withCommon(
  z.object({
    hunt: foreignKey,
    // The hidden puzzle (kind: "whiteboard") that carries the board's chat and
    // call.
    puzzle: foreignKey,
    editPolicy: z.enum(WhiteboardEditPolicies).optional(),
    // The people besides operators who may edit under "operatorsAndEditors".
    // Kept under the other policies, so switching back doesn't lose it.
    editors: foreignKey.array().optional(),
  }),
);

const Whiteboards = new Model("jr_whiteboards", Whiteboard);
Whiteboards.addIndex({ hunt: 1 }, { unique: true });
Whiteboards.addIndex({ puzzle: 1 });
export type WhiteboardType = ModelType<typeof Whiteboards>;

export default Whiteboards;
