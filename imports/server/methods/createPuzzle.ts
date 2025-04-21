import { check, Match } from "meteor/check";
<<<<<<< HEAD
import { Meteor } from "meteor/meteor";
import { MongoInternals } from "meteor/mongo";
import { Random } from "meteor/random";
import Flags from "../../Flags";
import Logger from "../../Logger";
=======
>>>>>>> jpd/extension
import type { GdriveMimeTypesType } from "../../lib/GdriveMimeTypes";
import GdriveMimeTypes from "../../lib/GdriveMimeTypes";
import createPuzzle from "../../methods/createPuzzle";
<<<<<<< HEAD
import GlobalHooks from "../GlobalHooks";
import { deleteUnusedDocument, ensureDocument } from "../gdrive";
import getOrCreateTagByName from "../getOrCreateTagByName";
import GoogleClient from "../googleClientRefresher";
=======
import addPuzzle from "../addPuzzle";
>>>>>>> jpd/extension
import defineMethod from "./defineMethod";

defineMethod(createPuzzle, {
  validate(arg) {
    check(arg, {
      huntId: String,
      title: String,
      url: Match.Optional(String),
      tags: [String],
      expectedAnswerCount: Number,
      docType: Match.OneOf(
        ...(Object.keys(GdriveMimeTypes) as GdriveMimeTypesType[]),
      ),
      allowDuplicateUrls: Match.Optional(Boolean),
    });
    return arg;
  },

  async run({
    huntId,
    title,
    tags,
    expectedAnswerCount,
    docType,
    url,
    allowDuplicateUrls,
  }) {
    check(this.userId, String);

    return addPuzzle({
      userId: this.userId,
      huntId,
      title,
      tags,
      expectedAnswerCount,
      docType,
      url,
      allowDuplicateUrls,
    });
  },
});
