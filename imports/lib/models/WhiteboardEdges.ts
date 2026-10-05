import { z } from "zod";
import { foreignKey, nonEmptyString } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import Model from "../typedModel/Model";
import withCommon from "../typedModel/withCommon";
import { WhiteboardColors, WhiteboardContributor } from "./WhiteboardNodes";

export const WhiteboardPathStyles = ["curved", "straight", "elbow"] as const;
export type WhiteboardPathStyle = (typeof WhiteboardPathStyles)[number];

export const WhiteboardArrowHeads = ["none", "end", "both"] as const;
export type WhiteboardArrowHead = (typeof WhiteboardArrowHeads)[number];

// A line's look: what the line tool draws with and restyling changes.
export const LINE_STYLE_FIELDS = [
  "pathStyle",
  "arrowHead",
  "color",
  "dashed",
] as const;
export type LineStyleField = (typeof LINE_STYLE_FIELDS)[number];

const WhiteboardEdge = withCommon(
  z.object({
    hunt: foreignKey,
    board: foreignKey,
    // Node ids
    source: foreignKey,
    target: foreignKey,
    label: nonEmptyString.optional(),
    hidden: z.boolean().optional(),
    // A feeder arrow hidden because a puzzle at one end was deleted rather
    // than by a person, which comes back once both puzzles are live.
    hiddenWithPuzzle: z.boolean().optional(),
    // Drawing style. Unset means a curved line with an arrow at the target end.
    pathStyle: z.enum(WhiteboardPathStyles).optional(),
    arrowHead: z.enum(WhiteboardArrowHeads).optional(),
    color: z.enum(WhiteboardColors).optional(),
    dashed: z.boolean().optional(),
    // Who drew and restyled a hand-drawn line, oldest first. Server-written.
    contributors: WhiteboardContributor.array().default([]),
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
