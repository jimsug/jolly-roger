import { z } from "zod";
import {
  WhiteboardColors,
  WhiteboardInkPoint,
  WhiteboardStrokeWidths,
} from "../../lib/models/WhiteboardNodes";
import { foreignKey } from "../../lib/typedModel/customTypes";
import type { ModelType } from "../../lib/typedModel/Model";
import Model from "../../lib/typedModel/Model";
import { Id } from "../../lib/typedModel/regexes";

const point = z.object({ x: z.number(), y: z.number() });

// Short-lived per-tab state for a board: where someone's pointer is, what
// they're dragging, the ink stroke they're part way through, what they have
// selected, what they're typing in, what they're looking at and who they're
// following. Removed when the tab goes away, or by the dead-server cleanup if
// its server went first.
const WhiteboardPresenceSchema = z.object({
  board: foreignKey,
  hunt: foreignKey,
  user: foreignKey,
  server: foreignKey,
  // Not a foreign key: connection ids don't refer to another record.
  connection: z.string().regex(Id),
  // Each update sets all of these, so one that's been cleared is null.
  cursor: point.nullable().optional(),
  drag: z
    .object({
      node: foreignKey,
      x: z.number(),
      y: z.number(),
      // The frame x and y are relative to; null for the board itself.
      parent: foreignKey.nullable().optional(),
    })
    .array()
    .nullable()
    .optional(),
  stroke: z
    .object({
      color: z.enum(WhiteboardColors),
      strokeWidth: z.enum(WhiteboardStrokeWidths),
      points: WhiteboardInkPoint.array(),
    })
    .nullable()
    .optional(),
  selection: foreignKey.array().nullable().optional(),
  // A node, or a line whose label is being typed in.
  editing: foreignKey.nullable().optional(),
  // Refreshed by the client every few seconds while editing is set, so the
  // document keeps changing while someone types and others don't take their
  // tab for a stalled one.
  editingAt: z.date().nullable().optional(),
  // The point at the centre of their canvas, and their zoom, for anyone
  // following them.
  view: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .nullable()
    .optional(),
  // Someone else on the board whose view they're following.
  followedUser: foreignKey.nullable().optional(),
});

const WhiteboardPresence = new Model(
  "jr_whiteboard_presence",
  WhiteboardPresenceSchema,
);
WhiteboardPresence.addIndex({ board: 1, connection: 1 }, { unique: true });
WhiteboardPresence.addIndex({ server: 1 });
WhiteboardPresence.addIndex({ connection: 1 });
export type WhiteboardPresenceType = ModelType<typeof WhiteboardPresence>;

export default WhiteboardPresence;
