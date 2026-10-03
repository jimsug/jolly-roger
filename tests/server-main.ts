import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

import "./unit/imports/lib/calendarTimeFormat";
import "./unit/imports/lib/chatMessagePlainText";
import "./unit/imports/lib/defaultHuntTags";
import "./unit/imports/lib/dingwordLogic";
import "./unit/imports/lib/guessQueueFilter";
import "./unit/imports/lib/guessTitleFromUrl";
import "./unit/imports/lib/isReaction";
import "./unit/imports/lib/permission_stubs";
import "./unit/imports/lib/puzzle-sort-and-group";
import "./unit/imports/lib/puzzleSolvers";
import "./unit/imports/lib/puzzleUrl";
import "./unit/imports/lib/relativeTimeFormat";
import "./unit/imports/lib/scrubTelemetry";
import "./unit/imports/lib/solvedness";
import "./unit/imports/lib/sortUsersByDisplayName";
import "./unit/imports/lib/tagNames";
import "./unit/imports/lib/userStatusesToLastSeen";
import "./unit/imports/lib/ValidateShape";

// Disable rate limiting
if (!Meteor.isAppTest) {
  throw new Meteor.Error(500, "This code must not run in production");
}

Accounts.removeDefaultRateLimit();

import "./unit/imports/server/backfillHuntAdminFields";
import "./unit/imports/server/backfillPuzzleNotifications";
import "./unit/imports/server/chatMessagePins";
import "./unit/imports/server/chatReactions";
import "./unit/imports/server/dingwordsOpenMatch";
import "./unit/imports/server/dingwordSuppression";
import "./unit/imports/server/DiscordHooks";
import "./unit/imports/server/documentCache";
import "./unit/imports/server/dropChatMessageAttachments";
import "./unit/imports/server/dropPuzzleMarkedComplete";
import "./unit/imports/server/Flags";
import "./unit/imports/server/generateTurnConfig";
import "./unit/imports/server/getOrCreateTagByName";
import "./unit/imports/server/googleAccountIdIndex";
import "./unit/imports/server/healthApi";
import "./unit/imports/server/isOffsite";
import "./unit/imports/server/lockedPuzzles";
import "./unit/imports/server/MigrationRegistry";
import "./unit/imports/server/Model";
import "./unit/imports/server/publishJoinedQuery";
import "./unit/imports/server/puzzleHistory";
import "./unit/imports/server/sendChatMessage";
import "./unit/imports/server/PuzzleHooks";
import "./unit/imports/server/setGuessStateCorrectAnswer";
import "./unit/imports/server/subscriberPresence";
import "./unit/imports/server/TagHooks";
import "./unit/imports/server/updatePuzzleNote";
import "./unit/imports/server/userStatuses";
import "./unit/imports/server/validateSchema";
import "./unit/imports/server/mergeUsers";

import "./acceptance/authentication";
import "./acceptance/chatHooks";
import "./acceptance/emails";
import "./acceptance/huntNav";
import "./acceptance/hunts";
import "./acceptance/profiles";
import "./acceptance/puzzleLookupApi";
import "./acceptance/puzzles";
import "./acceptance/smoke";
import "./acceptance/tags";
