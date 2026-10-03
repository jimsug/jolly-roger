import { z } from "zod";
import { foreignKey, nonEmptyString } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import Model from "../typedModel/Model";
import withCommon from "../typedModel/withCommon";

// Placeholder Google documents created ahead of time for a hunt, so that
// creating a puzzle can claim one instead of waiting on Drive. A row is
// removed as soon as its document is claimed; a "claimed" row only lingers
// when a claim was interrupted partway through.
const CachedDocument = withCommon(
  z
    .object({
      hunt: foreignKey,
      status: z.enum(["available", "claimed"]),
    })
    .and(
      z.object({
        provider: z.literal("google"),
        value: z.object({
          type: z.enum(["spreadsheet", "document"]),
          id: nonEmptyString,
          folder: nonEmptyString.optional(),
        }),
      }),
    ),
);

const CachedDocuments = new Model("jr_cached_documents", CachedDocument);
CachedDocuments.addIndex({ hunt: 1, status: 1, "value.type": 1 });
export type CachedDocumentType = ModelType<typeof CachedDocuments>;

export default CachedDocuments;
