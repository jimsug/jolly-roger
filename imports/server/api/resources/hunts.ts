import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import bodyParser from "body-parser";
import express from "express";
import type { GdriveMimeTypesType } from "../../../lib/GdriveMimeTypes";
import GdriveMimeTypes from "../../../lib/GdriveMimeTypes";
import type { HuntType } from "../../../lib/models/Hunts";
import Hunts from "../../../lib/models/Hunts";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import type { PuzzleType } from "../../../lib/models/Puzzles";
import Puzzles from "../../../lib/models/Puzzles";
import type { TagType } from "../../../lib/models/Tags";
import Tags from "../../../lib/models/Tags";
import addPuzzle from "../../addPuzzle";
import expressAsyncWrapper from "../../expressAsyncWrapper";

const hunts = express.Router();
hunts.use(bodyParser.json());

// Whether the API key's user is a member of the hunt; if not, answers the
// request itself.
const userIsHuntMember = async (huntId: string, res: express.Response) => {
  const userId = Meteor.userId();
  check(userId, String);

  const user = await MeteorUsers.findOneAsync({ _id: userId });
  if (!user) {
    // Should never happen if the API key passed authentication.
    res.sendStatus(500);
    return false;
  }

  if (!user.hunts?.includes(huntId)) {
    res.sendStatus(403);
    return false;
  }

  return true;
};

// Returns the hunt if it exists and the API key's user is a member of it;
// otherwise answers the request itself and returns undefined.
const huntForMember = async (huntId: string, res: express.Response) => {
  const hunt = await Hunts.findOneAsync(huntId);
  if (!hunt) {
    res.sendStatus(404);
    return undefined;
  }

  if (!(await userIsHuntMember(huntId, res))) {
    return undefined;
  }

  return hunt;
};

const puzzlePageUrl = (huntId: string, puzzleId: string) =>
  Meteor.absoluteUrl(`hunts/${huntId}/puzzles/${puzzleId}`);

// GET /hunts - list all hunts
hunts.get(
  "/",
  expressAsyncWrapper(async (_, res) => {
    const userId = Meteor.userId();
    check(userId, String);

    const user = await MeteorUsers.findOneAsync({ _id: userId });
    if (!user) {
      // Should never happen if the API key passed authentication.
      res.sendStatus(500);
      return;
    }

    const userHunts = await Hunts.find(
      { _id: { $in: user.hunts ?? [] } },
      { sort: { createdAt: -1 } },
    ).mapAsync((hunt) => renderHunt(hunt));
    res.json({
      hunts: userHunts,
    });
  }),
);

// GET /hunts/:huntId/tags - list tags for a hunt
hunts.get(
  "/:huntId/tags",
  expressAsyncWrapper(async (req, res) => {
    check(req.params.huntId, String);

    if (!(await userIsHuntMember(req.params.huntId, res))) {
      return;
    }

    const huntTags = Tags.find({ hunt: req.params.huntId });
    res.json({
      tags: await huntTags.mapAsync((tag: TagType) => tag.name),
    });
  }),
);

// GET /hunts/:huntId/puzzles?url=... - find the hunt's puzzles with this URL
hunts.get(
  "/:huntId/puzzles",
  expressAsyncWrapper(async (req, res) => {
    check(req.params.huntId, String);
    const { url } = req.query;
    if (typeof url !== "string" || url === "") {
      res.sendStatus(400);
      return;
    }

    const hunt = await huntForMember(req.params.huntId, res);
    if (!hunt) {
      return;
    }

    const puzzles = await Puzzles.find(
      { hunt: hunt._id, url },
      { projection: { hunt: 1 } },
    ).mapAsync((puzzle) => renderPuzzle(puzzle));
    res.json({
      puzzles,
    });
  }),
);

// POST /hunts/:huntId/puzzles/bulk-check - map each of the given URLs that
// already has a puzzle in the hunt to that puzzle's page
hunts.post(
  "/:huntId/puzzles/bulk-check",
  expressAsyncWrapper(async (req, res) => {
    check(req.params.huntId, String);
    if (!Match.test(req.body, { urls: [String] })) {
      res.sendStatus(400);
      return;
    }
    const { urls } = req.body;

    const hunt = await huntForMember(req.params.huntId, res);
    if (!hunt) {
      return;
    }

    const existing = new Map<string, string>();
    await Puzzles.find(
      { hunt: hunt._id, url: { $in: urls } },
      { projection: { url: 1 } },
    ).forEachAsync((puzzle) => {
      if (puzzle.url) {
        existing.set(puzzle.url, puzzlePageUrl(hunt._id, puzzle._id));
      }
    });
    res.json({
      existing: Object.fromEntries(existing),
    });
  }),
);

// POST /hunts/:huntId/puzzles - create a new puzzle
hunts.post(
  "/:huntId/puzzles",
  expressAsyncWrapper(async (req, res) => {
    check(req.params.huntId, String);
    check(req.body, {
      title: String,
      url: Match.Optional(String),
      tags: [String],
      expectedAnswerCount: Number,
      docType: Match.OneOf(
        ...(Object.keys(GdriveMimeTypes) as GdriveMimeTypesType[]),
      ),
      allowDuplicateUrls: Match.Optional(Boolean),
      completedWithNoAnswer: Match.Optional(Boolean),
      locked: Match.Optional(Boolean),
      lockedSummary: Match.Optional(String),
    });

    try {
      const id = await addPuzzle({
        ...req.body,
        huntId: req.params.huntId,
      });
      res.json({
        id,
      });
    } catch (error) {
      if (error instanceof Meteor.Error && typeof error.error === "number") {
        res.sendStatus(error.error);
      }
      throw error;
    }
  }),
);

const renderHunt = function renderHunt(hunt: HuntType) {
  return {
    _id: hunt._id,
    name: hunt.name,
  };
};

const renderPuzzle = function renderPuzzle(puzzle: PuzzleType) {
  return {
    _id: puzzle._id,
    jollyRogerUrl: puzzlePageUrl(puzzle.hunt, puzzle._id),
  };
};

export default hunts;
