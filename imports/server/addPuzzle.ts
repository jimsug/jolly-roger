import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Logger from "../Logger";
import type { GdriveMimeTypesType } from "../lib/GdriveMimeTypes";
import GdriveMimeTypes from "../lib/GdriveMimeTypes";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import GlobalHooks from "./GlobalHooks";
import {
  deleteUnusedDocument,
  ensureDocument,
  isGoogleAvailable,
} from "./gdrive";
import getOrCreateTagByName from "./getOrCreateTagByName";
import { deferSyncPuzzlesOnBoard } from "./whiteboard";
import withLock from "./withLock";

async function checkForDuplicatePuzzle(huntId: string, url: string) {
  const existingPuzzleWithUrl = await Puzzles.findOneAsync({
    hunt: huntId,
    url,
  });
  if (existingPuzzleWithUrl) {
    throw new Meteor.Error(409, `Puzzle with URL ${url} already exists`);
  }
}

async function createDocumentAndInsertPuzzle(
  huntId: string,
  title: string,
  expectedAnswerCount: number,
  tags: string[],
  url: string | undefined,
  docType: GdriveMimeTypesType,
  completedWithNoAnswer: boolean | undefined,
  lock: { locked: true; lockedSummary?: string } | undefined,
): Promise<string> {
  // Look up each tag by name and map them to tag IDs.
  const tagIds = await Promise.all(
    tags.map((tagName) => {
      return getOrCreateTagByName(huntId, tagName);
    }),
  );

  const fullPuzzle = {
    hunt: huntId,
    title,
    expectedAnswerCount,
    _id: Random.id(),
    tags: [...new Set(tagIds)],
    answers: [],
    url,
    completedWithNoAnswer,
    ...lock,
  };

  // By creating the document before we save the puzzle, we make sure nobody
  // else has a chance to create a document with the wrong config. (This
  // requires us to have an _id for the puzzle, which is why we generate it
  // manually above instead of letting Meteor do it)
  if (await isGoogleAvailable()) {
    await ensureDocument(fullPuzzle, docType);
  }

  try {
    await Puzzles.insertAsync(fullPuzzle);
  } catch (error) {
    // The document was made for a puzzle that now doesn't exist, so take it
    // back out of Drive rather than leaving a stray file behind.
    try {
      await deleteUnusedDocument(fullPuzzle);
    } catch (cleanupError) {
      Logger.warn("Unable to delete document for puzzle that failed to save", {
        puzzle: fullPuzzle._id,
        error: cleanupError,
      });
    }
    throw error;
  }
  return fullPuzzle._id;
}

export default async function addPuzzle({
  huntId,
  title,
  tags,
  expectedAnswerCount,
  docType,
  url,
  allowDuplicateUrls,
  completedWithNoAnswer,
  locked,
  lockedSummary,
}: {
  huntId: string;
  title: string;
  url?: string;
  tags: string[];
  expectedAnswerCount: number;
  docType: GdriveMimeTypesType;
  allowDuplicateUrls?: boolean;
  completedWithNoAnswer?: boolean;
  locked?: boolean;
  lockedSummary?: string;
}) {
  const userId = Meteor.userId();

  check(userId, String);
  check(huntId, String);
  check(url, Match.Optional(String));
  check(tags, [String]);
  check(expectedAnswerCount, Number);
  check(
    docType,
    Match.OneOf(...(Object.keys(GdriveMimeTypes) as GdriveMimeTypesType[])),
  );
  check(allowDuplicateUrls, Match.Optional(Boolean));
  check(completedWithNoAnswer, Match.Optional(Boolean));
  check(locked, Match.Optional(Boolean));
  check(lockedSummary, Match.Optional(String));
  if (title === "") {
    throw new Meteor.Error(400, "Puzzle title is required");
  }

  const hunt = await Hunts.findOneAsync(huntId);
  if (!hunt) {
    throw new Meteor.Error(404, "Unknown hunt id");
  }

  if (
    !userMayWritePuzzlesForHunt(await MeteorUsers.findOneAsync(userId), hunt)
  ) {
    throw new Meteor.Error(
      401,
      `User ${userId} may not create new puzzles for hunt ${huntId}`,
    );
  }

  if (locked && !hunt.allowUnlockablePuzzles) {
    throw new Meteor.Error(400, `Hunt ${huntId} does not allow locked puzzles`);
  }
  const trimmedSummary = lockedSummary?.trim();
  const lock = locked
    ? ({
        locked: true,
        ...(trimmedSummary ? { lockedSummary: trimmedSummary } : {}),
      } as const)
    : undefined;

  // Before we do any writes, try an opportunistic check for duplicates. If a
  // puzzle with this URL already exists, we can short-circuit without
  // creating tags or the Google Doc. We'll still need to repeat this check
  // with the lock held.
  if (url && !allowDuplicateUrls) {
    await checkForDuplicatePuzzle(huntId, url);
  }

  Logger.info("Creating a new puzzle", {
    hunt: huntId,
    title,
    locked: lock !== undefined,
  });

  let puzzleId = "";
  if (!url) {
    puzzleId = await createDocumentAndInsertPuzzle(
      huntId,
      title,
      expectedAnswerCount,
      tags,
      url,
      docType,
      completedWithNoAnswer,
      lock,
    );
  } else {
    // With a lock, look for a puzzle with the same URL. If present, we reject the insertion
    // unless the client overrides it.
    await withLock(`hunts:${huntId}:puzzle-url:${url}`, async () => {
      if (!allowDuplicateUrls) {
        await checkForDuplicatePuzzle(huntId, url);
      }
      puzzleId = await createDocumentAndInsertPuzzle(
        huntId,
        title,
        expectedAnswerCount,
        tags,
        url,
        docType,
        completedWithNoAnswer,
        lock,
      );
    });
  }

  // Run any puzzle-creation hooks, like creating a default document
  // attachment or announcing the puzzle to Slack. A locked puzzle isn't
  // announced until it is unlocked (see unlockPuzzle), so they wait.
  if (!lock) {
    Meteor.defer(() => {
      void GlobalHooks.runPuzzleCreatedHooks(puzzleId);
    });
  } else {
    // The whiteboard shows locked puzzles too, so they go on the board now
    // rather than when they're unlocked (when placing them is a no-op).
    deferSyncPuzzlesOnBoard(huntId, [puzzleId]);
  }

  return puzzleId;
}
