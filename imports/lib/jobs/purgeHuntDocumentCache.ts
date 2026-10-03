import { z } from "zod";
import { foreignKey } from "../typedModel/customTypes";
import TypedJob from "./TypedJob";

const purgeHuntDocumentCache = new TypedJob("hunt.purgeDocumentCache", {
  args: z.object({
    huntId: foreignKey,
  }),
  resultSchema: z.object({
    itemsTotal: z.number(), // How many cached documents the hunt had
    itemsCompleted: z.number(), // How many of them have been dealt with so far
  }),
  maxAttempts: 3,
});

export default purgeHuntDocumentCache;
