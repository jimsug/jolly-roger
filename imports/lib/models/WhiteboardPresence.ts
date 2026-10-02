import { z } from "zod";
import { foreignKey } from "./customTypes";
import type { ModelType } from "./Model";
import Model from "./Model";
import { Id } from "./regexes";
import { WhiteboardColours, WhiteboardStrokeWidths } from "./WhiteboardNodes";
import withTimestamps from "./withTimestamps";

const point = z.object({ x: z.number(), y: z.number() });

// Short-lived per-tab state for a board: where someone's pointer is, what
// they're dragging and the ink stroke they're part way through. Removed when
// the tab goes away.
const WhiteboardPresenceSchema = withTimestamps(
  z.object({
    board: foreignKey,
    hunt: foreignKey,
    user: foreignKey,
    server: foreignKey,
    // Not a foreign key: connection ids don't refer to another record.
    connection: z.string().regex(Id),
    cursor: point.nullable().optional(),
    drag: z
      .array(z.object({ node: foreignKey, x: z.number(), y: z.number() }))
      .nullable()
      .optional(),
    stroke: z
      .object({
        id: foreignKey,
        colour: z.enum(WhiteboardColours),
        strokeWidth: z.enum(WhiteboardStrokeWidths),
        points: z.array(z.tuple([z.number(), z.number(), z.number()])),
      })
      .nullable()
      .optional(),
  }),
);

const WhiteboardPresence = new Model(
  "jr_whiteboard_presence",
  WhiteboardPresenceSchema,
);
WhiteboardPresence.addIndex({ board: 1, connection: 1 }, { unique: true });
WhiteboardPresence.addIndex({ server: 1 });
WhiteboardPresence.addIndex({ connection: 1 });
export type WhiteboardPresenceType = ModelType<typeof WhiteboardPresence>;

export default WhiteboardPresence;
