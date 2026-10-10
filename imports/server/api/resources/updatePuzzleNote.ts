import { Match } from "meteor/check";
import { MongoInternals } from "meteor/mongo";
import bodyParser from "body-parser";
import express from "express";
import Flags from "../../../Flags";
import Logger from "../../../Logger";
import Documents from "../../../lib/models/Documents";
import type { PuzzleNoteContentType } from "../../../lib/models/Puzzles";
import Puzzles from "../../../lib/models/Puzzles";
import expressAsyncWrapper from "../../expressAsyncWrapper";

const { MongoError } = MongoInternals.NpmModules.mongodb.module;

// Mounted without authentication (see api.ts): the caller is a script bound
// to the puzzle's Google Sheet, which identifies the puzzle by the sheet's
// file id and has no API key of its own.
const updatePuzzleNote = express.Router();

// Notes are a few cells of text; anything larger is not a note.
updatePuzzleNote.use(bodyParser.json({ limit: "64kb" }));

// The note's plain text fields. flavorMeanings, a table of cells, is the only
// other field.
const NOTE_TEXT_FIELDS = [
  "flavor",
  "summary",
  "theories",
  "contactPerson",
  "externalLinkText",
  "externalLinkUrl",
] as const;

const optionalString = Match.Optional(String);

const NotePattern = {
  // Object.fromEntries loses the keys, so the record type is restated
  ...(Object.fromEntries(
    NOTE_TEXT_FIELDS.map((field) => [field, optionalString]),
  ) as Record<(typeof NOTE_TEXT_FIELDS)[number], typeof optionalString>),
  flavorMeanings: Match.Optional([[String]]),
};

// The sheet sends every field, blank or not; the schema only accepts
// non-empty strings, so blanks are dropped.
function normalizeNote(
  body: Match.PatternMatch<typeof NotePattern>,
): PuzzleNoteContentType {
  const note: PuzzleNoteContentType = {};
  for (const field of NOTE_TEXT_FIELDS) {
    const value = body[field]?.trim();
    if (value) {
      note[field] = value;
    }
  }
  const meanings = (body.flavorMeanings ?? [])
    .map((row) => row.map((cell) => cell.trim()).filter((cell) => cell !== ""))
    .filter((row) => row.length > 0);
  if (meanings.length > 0) {
    note.flavorMeanings = meanings;
  }
  return note;
}

// POST /updatePuzzleNote/:huntId/:documentId - replace the notes of the puzzle
// whose Google document has the given file id
updatePuzzleNote.post(
  "/:huntId/:documentId",
  expressAsyncWrapper(async (req, res) => {
    if (await Flags.activeAsync("disable.puzzle_notes")) {
      res.sendStatus(503);
      return;
    }

    const { huntId, documentId } = req.params;
    if (
      typeof huntId !== "string" ||
      typeof documentId !== "string" ||
      !Match.test(req.body, NotePattern)
    ) {
      res.sendStatus(400);
      return;
    }

    // Notes come from the puzzle's sheet; a board's id isn't a document
    // this endpoint knows, and a hunt board has no puzzle to note
    const doc = await Documents.findOneAsync({
      hunt: huntId,
      provider: "google",
      "value.id": documentId,
    });
    if (!doc?.puzzle) {
      res.sendStatus(404);
      return;
    }

    let updated: number;
    try {
      updated = await Puzzles.updateAsync(
        { _id: doc.puzzle, hunt: huntId },
        {
          $set: {
            noteContent: normalizeNote(req.body),
            noteUpdateTs: new Date(),
          },
        },
      );
    } catch (error) {
      if (
        error instanceof MongoError &&
        error.code === 121 /* DocumentValidationFailure */
      ) {
        Logger.info("Rejected puzzle note", { puzzle: doc.puzzle, error });
        res.status(400).json({ error: "Note failed validation" });
        return;
      }
      throw error;
    }

    if (updated === 0) {
      res.sendStatus(404);
      return;
    }

    res.json({
      status: "success",
    });
  }),
);

export default updatePuzzleNote;
