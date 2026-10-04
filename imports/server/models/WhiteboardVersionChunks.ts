import { z } from "zod";
import { foreignKey, uint8Array } from "../../lib/typedModel/customTypes";
import Model from "../../lib/typedModel/Model";

// One piece of a whiteboard version's gzipped payload, in order by index.
// Pieces are written before the version's header, so one without a header is
// left from a write that didn't finish, and the retention daemon removes it.
const WhiteboardVersionChunk = z.object({
  hunt: foreignKey,
  board: foreignKey,
  version: foreignKey,
  index: z.int32().nonnegative(),
  data: uint8Array,
  createdAt: z.date(),
});

const WhiteboardVersionChunks = new Model(
  "jr_whiteboard_version_chunks",
  WhiteboardVersionChunk,
);
WhiteboardVersionChunks.addIndex({ version: 1, index: 1 }, { unique: true });
WhiteboardVersionChunks.addIndex({ board: 1, version: 1 });
WhiteboardVersionChunks.addIndex({ hunt: 1 });

export default WhiteboardVersionChunks;
