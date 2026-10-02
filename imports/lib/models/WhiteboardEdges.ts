import { z } from "zod";
import { foreignKey, nonEmptyString } from "./customTypes";
import type { ModelType } from "./Model";
import Model from "./Model";
import { WhiteboardColours } from "./WhiteboardNodes";
import withCommon from "./withCommon";

export const WhiteboardPathStyles = ["curved", "straight", "elbow"] as const;
export type WhiteboardPathStyle = (typeof WhiteboardPathStyles)[number];

export const WhiteboardArrowHeads = ["none", "end", "both"] as const;
export type WhiteboardArrowHead = (typeof WhiteboardArrowHeads)[number];

const WhiteboardEdge = withCommon(
  z.object({
    hunt: foreignKey,
    board: foreignKey,
    // Node ids
    source: foreignKey,
    target: foreignKey,
    label: nonEmptyString.optional(),
    hidden: z.boolean().optional(),
    // Drawing style. Unset means a curved line with an arrow at the target end.
    pathStyle: z.enum(WhiteboardPathStyles).optional(),
    arrowHead: z.enum(WhiteboardArrowHeads).optional(),
    colour: z.enum(WhiteboardColours).optional(),
    dashed: z.boolean().optional(),
    // Who drew and restyled a hand-drawn line, oldest first. Server-written.
    contributors: z
      .array(z.object({ user: foreignKey, at: z.date() }))
      .default([]),
    // Auto edges are drawn from a feeder (group:X) to its meta (meta-for:X)
    // and kept in sync with tags. feeder and meta are puzzle ids.
    auto: z.boolean().optional(),
    feeder: foreignKey.optional(),
    meta: foreignKey.optional(),
  }),
);

const WhiteboardEdges = new Model("jr_whiteboard_edges", WhiteboardEdge);
WhiteboardEdges.addIndex({ board: 1 });
WhiteboardEdges.addIndex(
  { board: 1, feeder: 1, meta: 1 },
  { unique: true, partialFilterExpression: { feeder: { $exists: true } } },
);
export type WhiteboardEdgeType = ModelType<typeof WhiteboardEdges>;

export default WhiteboardEdges;
