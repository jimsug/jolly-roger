import { z } from "zod";
import { foreignKey, nonEmptyString } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import Model from "../typedModel/Model";
import withCommon from "../typedModel/withCommon";

export const WhiteboardNodeKinds = [
  "puzzle",
  "frame",
  "sticky",
  "text",
  "ink",
  // The free end of a line that isn't attached to anything.
  "point",
] as const;
export type WhiteboardNodeKind = (typeof WhiteboardNodeKinds)[number];

export const WhiteboardColors = [
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "blue",
  "green",
  "gray",
  "black",
] as const;
export type WhiteboardColor = (typeof WhiteboardColors)[number];

export const WhiteboardStrokeWidths = ["thin", "medium", "thick"] as const;
export type WhiteboardStrokeWidth = (typeof WhiteboardStrokeWidths)[number];

// An ink sample: [x, y, pressure].
export const WhiteboardInkPoint = z.tuple([z.number(), z.number(), z.number()]);

const WhiteboardFrameKinds = ["group", "ungrouped", "user"] as const;
export type WhiteboardFrameKind = (typeof WhiteboardFrameKinds)[number];

// One entry in the log of who made and edited a node or line.
export const WhiteboardContributor = z.object({
  user: foreignKey,
  at: z.date(),
});
export type WhiteboardContributorType = z.infer<typeof WhiteboardContributor>;

const WhiteboardNode = withCommon(
  z.object({
    hunt: foreignKey,
    board: foreignKey,
    type: z.enum(WhiteboardNodeKinds),
    // Frame node that contains this one. Position is relative to the parent.
    parent: foreignKey.optional(),
    position: z.object({ x: z.number(), y: z.number() }),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    // Removed from the board by a person. Kept rather than deleted so that
    // placement doesn't put it back.
    hidden: z.boolean().optional(),
    // Set once a person has moved or reparented the node. Placement only ever
    // moves nodes that haven't been touched by hand.
    manual: z.boolean().optional(),

    // type: "puzzle"
    puzzle: foreignKey.optional(),

    // type: "frame"
    frameKind: z.enum(WhiteboardFrameKinds).optional(),
    // The group:/administrivia tag a seeded frame represents. The live tag name
    // is shown; label is the fallback if the tag goes away.
    tag: foreignKey.optional(),
    label: nonEmptyString.optional(),

    // type: "sticky" | "text"
    text: nonEmptyString.optional(),
    color: z.enum(WhiteboardColors).optional(),

    // type: "ink". Points are [x, y, pressure], relative to position. A long
    // stroke is split into several nodes that share a stroke id.
    points: WhiteboardInkPoint.array().optional(),
    strokeWidth: z.enum(WhiteboardStrokeWidths).optional(),
    stroke: foreignKey.optional(),

    // Who created and edited a board-native node, oldest first. Written only
    // by the server.
    contributors: WhiteboardContributor.array().default([]),
  }),
);

const WhiteboardNodes = new Model("jr_whiteboard_nodes", WhiteboardNode);
WhiteboardNodes.addIndex({ board: 1 });
WhiteboardNodes.addIndex(
  { board: 1, puzzle: 1 },
  { unique: true, partialFilterExpression: { puzzle: { $exists: true } } },
);
WhiteboardNodes.addIndex(
  { board: 1, tag: 1 },
  { unique: true, partialFilterExpression: { tag: { $exists: true } } },
);
WhiteboardNodes.addIndex(
  { board: 1, stroke: 1 },
  { partialFilterExpression: { stroke: { $exists: true } } },
);
export type WhiteboardNodeType = ModelType<typeof WhiteboardNodes>;

export default WhiteboardNodes;
