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
// they're dragging and the ink stroke they're part way through. Removed when
// the tab goes away, or by the dead-server cleanup if its server went first.
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
      colour: z.enum(WhiteboardColors),
      strokeWidth: z.enum(WhiteboardStrokeWidths),
      points: WhiteboardInkPoint.array(),
    })
    .nullable()
    .optional(),
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
