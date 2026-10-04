import { z } from "zod";
import TypedJob from "./TypedJob";

const applyTagSynonyms = new TypedJob("tag.applySynonyms", {
  args: z.object({}),
  resultSchema: z.object({
    huntsTotal: z.number(),
    huntsCompleted: z.number(),
    renamed: z.number(),
    merged: z.number(),
  }),
  maxAttempts: 3,
});

export default applyTagSynonyms;
