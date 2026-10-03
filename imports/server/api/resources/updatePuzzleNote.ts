import { Match } from "meteor/check";
import { MongoInternals } from "meteor/mongo";
import bodyParser from "body-parser";
import express from "express";
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

const NotePattern = {
  flavor: Match.Optional(String),
  flavorMeanings: Match.Optional([[String]]),
  summary: Match.Optional(String),
  theories: Match.Optional(String),
  contactPerson: Match.Optional(String),
  externalLinkText: Match.Optional(String),
  externalLinkUrl: Match.Optional(String),
};

// The sheet sends every field, blank or not; the schema only accepts
// non-empty strings, so blanks are dropped.
function normalizeNote(body: {
  flavor?: string;
  flavorMeanings?: string[][];
  summary?: string;
  theories?: string;
  contactPerson?: string;
  externalLinkText?: string;
  externalLinkUrl?: string;
}): PuzzleNoteContentType {
  const note: PuzzleNoteContentType = {};
  for (const field of [
    "flavor",
    "summary",
    "theories",
    "contactPerson",
    "externalLinkText",
    "externalLinkUrl",
  ] as const) {
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
    const { huntId, documentId } = req.params;
    if (
      typeof huntId !== "string" ||
      typeof documentId !== "string" ||
      !Match.test(req.body, NotePattern)
    ) {
      res.sendStatus(400);
      return;
    }

    const doc = await Documents.findOneAsync({
      hunt: huntId,
      "value.id": documentId,
    });
    if (!doc) {
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
