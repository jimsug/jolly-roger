import { z } from "zod";
import { GoogleDocumentProvider } from "../../lib/models/Documents";
import { createdTimestamp, foreignKey } from "../../lib/typedModel/customTypes";
import type { ModelType } from "../../lib/typedModel/Model";
import Model from "../../lib/typedModel/Model";

// Google documents created ahead of time for a hunt, so that creating a
// puzzle can claim one instead of waiting on Drive. Claiming a cached
// document deletes its row. Rows are written outside any user's request, so
// they record no user. Rows from earlier versions can still carry
// createdBy, updatedBy and updatedAt, and a "claimed" status where a two-step
// claim was interrupted partway through.
const CachedDocument = z
  .object({
    hunt: foreignKey,
    status: z.enum(["available", "claimed"]),
    createdAt: createdTimestamp,
    createdBy: foreignKey.optional(),
    updatedBy: foreignKey.optional(),
    updatedAt: z.date().optional(),
  })
  .and(GoogleDocumentProvider);

const CachedDocuments = new Model("jr_cached_documents", CachedDocument);
CachedDocuments.addIndex({ hunt: 1, status: 1, "value.type": 1 });
export type CachedDocumentType = ModelType<typeof CachedDocuments>;

export default CachedDocuments;
