import { z } from "zod";
import { foreignKey } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import Model from "../typedModel/Model";
import withCommon from "../typedModel/withCommon";

// What a version is the board before: ordinary edits, a reset of the layout,
// or a restore of an earlier version.
export const WhiteboardVersionKinds = ["edits", "reset", "restore"] as const;
export type WhiteboardVersionKind = (typeof WhiteboardVersionKinds)[number];

// A snapshot of a board's nodes and lines, taken just before the edits it
// lists. The payload itself is in WhiteboardVersionChunks (server-only).
const WhiteboardVersion = withCommon(
  z.object({
    hunt: foreignKey,
    board: foreignKey,
    kind: z.enum(WhiteboardVersionKinds),
    // Whose edits followed this version, and when each one's window began;
    // the first started it
    users: z.object({ user: foreignKey, at: z.date() }).array().min(1),
    // How many edit calls (one per batch) followed it
    changeCount: z.int32().nonnegative(),
    lastEditAt: z.date(),
    // kind "restore": when the restored version was taken
    restoredFromAt: z.date().optional(),
    nodeCount: z.int32().nonnegative(),
    edgeCount: z.int32().nonnegative(),
    // Compressed bytes, across every chunk
    size: z.int32().nonnegative(),
    chunkCount: z.int32().positive(),
    // The payload's format, 1
    format: z.int32(),
    // sha256 of the uncompressed payload, to tell an unchanged board
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
);

const WhiteboardVersions = new Model(
  "jr_whiteboard_versions",
  WhiteboardVersion,
);
WhiteboardVersions.addIndex({ board: 1, createdAt: -1 });
WhiteboardVersions.addIndex({ board: 1, "users.user": 1, createdAt: -1 });
WhiteboardVersions.addIndex({ hunt: 1 });
export type WhiteboardVersionType = ModelType<typeof WhiteboardVersions>;

export default WhiteboardVersions;
