import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

import "./unit/imports/lib/calendarTimeFormat";
import "./unit/imports/lib/defaultHuntTags";
import "./unit/imports/lib/guessTitleFromUrl";
import "./unit/imports/lib/permission_stubs";
import "./unit/imports/lib/puzzle-sort-and-group";
import "./unit/imports/lib/puzzleUrl";
import "./unit/imports/lib/relativeTimeFormat";
import "./unit/imports/lib/solvedness";
import "./unit/imports/lib/sortUsersByDisplayName";
import "./unit/imports/lib/tagNames";
import "./unit/imports/lib/ValidateShape";

// Disable rate limiting
if (!Meteor.isAppTest) {
  throw new Meteor.Error(500, "This code must not run in production");
}

Accounts.removeDefaultRateLimit();

import "./unit/imports/server/backfillHuntAdminFields";
import "./unit/imports/server/backfillPuzzleNotifications";
import "./unit/imports/server/DiscordHooks";
import "./unit/imports/server/dropPuzzleMarkedComplete";
import "./unit/imports/server/Flags";
import "./unit/imports/server/getOrCreateTagByName";
import "./unit/imports/server/lockedPuzzles";
import "./unit/imports/server/MigrationRegistry";
import "./unit/imports/server/Model";
import "./unit/imports/server/publishJoinedQuery";
import "./unit/imports/server/TagHooks";
import "./unit/imports/server/updatePuzzleNote";
import "./unit/imports/server/validateSchema";
import "./unit/imports/server/mergeUsers";

import "./acceptance/authentication";
import "./acceptance/chatHooks";
import "./acceptance/emails";
import "./acceptance/hunts";
import "./acceptance/profiles";
import "./acceptance/puzzles";
import "./acceptance/smoke";
import "./acceptance/tags";
