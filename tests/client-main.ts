import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

import "./unit/imports/lib/calendarTimeFormat";
import "./unit/imports/lib/defaultHuntTags";
import "./unit/imports/lib/guessTitleFromUrl";
import "./unit/imports/lib/permission_stubs";
import "./unit/imports/lib/puzzle-sort-and-group";
import "./unit/imports/lib/puzzleSolvers";
import "./unit/imports/lib/puzzleUrl";
import "./unit/imports/lib/relativeTimeFormat";
import "./unit/imports/lib/solvedness";
import "./unit/imports/lib/sortUsersByDisplayName";
import "./unit/imports/lib/tagNames";
import "./unit/imports/lib/userStatusesToLastSeen";
import "./unit/imports/lib/ValidateShape";

import "./unit/imports/client/puzzleTitles";

import "./acceptance/authentication";
import "./acceptance/chatHooks";
import "./acceptance/emails";
import "./acceptance/hunts";
import "./acceptance/profiles";
import "./acceptance/puzzles";
import "./acceptance/smoke";
import "./acceptance/tags";
