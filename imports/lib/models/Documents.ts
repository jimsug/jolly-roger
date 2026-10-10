import { z } from "zod";
import { foreignKey, nonEmptyString } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import { Url } from "../typedModel/regexes";
import SoftDeletedModel from "../typedModel/SoftDeletedModel";
import withCommon from "../typedModel/withCommon";

export const GoogleDocumentProvider = z.object({
  provider: z.literal("google"),
  value: z.object({
    type: z.enum(["spreadsheet", "document"]),
    id: nonEmptyString,
    folder: nonEmptyString.optional(),
  }),
});

// A board on the board service (Settings "board.service"): the service's id
// for it and the page to embed.
export const BoardDocumentProvider = z.object({
  provider: z.literal("board"),
  value: z.object({
    id: nonEmptyString,
    url: z.string().regex(Url),
  }),
});

const DocumentSchema = withCommon(
  z
    .object({
      hunt: foreignKey,
      // Left out for a document that belongs to the hunt as a whole
      puzzle: foreignKey.optional(),
    })
    .and(
      z.discriminatedUnion("provider", [
        GoogleDocumentProvider,
        BoardDocumentProvider,
      ]),
    ),
);

const Documents = new SoftDeletedModel("jr_documents", DocumentSchema);
Documents.addIndex({ deleted: 1, puzzle: 1 });
Documents.addIndex({ "value.id": 1 });
Documents.addIndex({ hunt: 1 });
Documents.addIndex({ hunt: 1, provider: 1 });
export type DocumentType = ModelType<typeof Documents>;
export type GoogleDocumentType = Extract<DocumentType, { provider: "google" }>;
export type BoardDocumentType = Extract<DocumentType, { provider: "board" }>;

export default Documents;
