import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import Logger from "../../Logger";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import updatePuzzle from "../../methods/updatePuzzle";
import GlobalHooks from "../GlobalHooks";
import { ensureDocument, renameDocument } from "../gdrive";
import getOrCreateTagByName from "../getOrCreateTagByName";
import getTeamName from "../getTeamName";
import defineMethod from "./defineMethod";

type OptionalPuzzleField =
  | "url"
  | "completedWithNoAnswer"
  | "locked"
  | "lockedSummary";

defineMethod(updatePuzzle, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      title: String,
      url: Match.Optional(String),
      tags: [String],
      expectedAnswerCount: Number,
      // We accept this argument since it's provided by the form, but it's not checked here - only
      // during puzzle creation, to avoid duplicates when creating new puzzles.
      allowDuplicateUrls: Match.Optional(Boolean),
      completedWithNoAnswer: Match.Optional(Boolean),
      locked: Match.Optional(Boolean),
      lockedSummary: Match.Optional(String),
    });

    return arg;
  },

  async run({
    puzzleId,
    title,
    url,
    tags,
    expectedAnswerCount,
    completedWithNoAnswer,
    locked,
    lockedSummary,
  }) {
    check(this.userId, String);

    const oldPuzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
    if (!oldPuzzle) {
      throw new Meteor.Error(404, "Unknown puzzle id");
    }
    const hunt = await Hunts.findOneAsync(oldPuzzle.hunt);
    if (
      !userMayWritePuzzlesForHunt(
        await MeteorUsers.findOneAsync(this.userId),
        hunt,
      )
    ) {
      throw new Meteor.Error(
        401,
        `User ${this.userId} may not modify puzzles from hunt ${oldPuzzle.hunt}`,
      );
    }

    if (locked && !hunt?.allowUnlockablePuzzles) {
      throw new Meteor.Error(
        400,
        `Hunt ${oldPuzzle.hunt} does not allow locked puzzles`,
      );
    }

    // Look up each tag by name and map them to tag IDs.
    const tagIds = await Promise.all(
      tags.map((tagName) => {
        return getOrCreateTagByName(oldPuzzle.hunt, tagName);
      }),
    );

    Logger.info("Updating a puzzle", {
      hunt: oldPuzzle.hunt,
      puzzle: puzzleId,
      title,
      expectedAnswerCount,
      completedWithNoAnswer,
      locked,
    });

    const update: Mongo.Modifier<PuzzleType> = {
      $set: {
        title,
        expectedAnswerCount,
        tags: [...new Set(tagIds)],
      },
    };
    // Every cleared optional field lands in the one $unset, so clearing
    // several at once works.
    const unset = (field: OptionalPuzzleField) => {
      update.$unset = { ...update.$unset, [field]: "" };
    };

    if (url) {
      update.$set = { ...update.$set, url };
    } else {
      unset("url");
    }
    if (completedWithNoAnswer) {
      update.$set = { ...update.$set, completedWithNoAnswer };
    } else {
      unset("completedWithNoAnswer");
    }
    // Omitting `locked` leaves the lock as it was, so callers that don't know
    // about locked puzzles can't unlock one by accident.
    if (locked !== undefined) {
      if (locked) {
        update.$set = { ...update.$set, locked };
      } else {
        unset("locked");
      }
      const trimmedSummary = locked ? lockedSummary?.trim() : undefined;
      if (trimmedSummary) {
        update.$set = { ...update.$set, lockedSummary: trimmedSummary };
      } else {
        unset("lockedSummary");
      }
    }
    await Puzzles.updateAsync(puzzleId, update);

    // Run any puzzle update hooks
    Meteor.defer(() => {
      void GlobalHooks.runPuzzleUpdatedHooks(puzzleId, oldPuzzle);
    });

    // Unlocking through the edit form skips the chat announcement that
    // Puzzles.methods.unlock posts, but the puzzle still needs announcing to
    // the world now that it exists. Operators can edit deleted puzzles too,
    // and those stay unannounced.
    if (oldPuzzle.locked && locked === false && !oldPuzzle.deleted) {
      Meteor.defer(() => {
        void GlobalHooks.runPuzzleCreatedHooks(puzzleId);
      });
    }

    if (oldPuzzle.title !== title) {
      Meteor.defer(
        Meteor.bindEnvironment(async () => {
          const doc = await ensureDocument({
            _id: puzzleId,
            title,
            hunt: oldPuzzle.hunt,
          });
          const teamName = await getTeamName();
          await renameDocument(doc.value.id, `${title}: ${teamName}`);
        }),
      );
    }
  },
});
