import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

import "./unit/imports/lib/calendarTimeFormat";
import "./unit/imports/lib/defaultHuntTags";
import "./unit/imports/lib/permission_stubs";
import "./unit/imports/lib/puzzle-sort-and-group";
import "./unit/imports/lib/relativeTimeFormat";
import "./unit/imports/lib/sortUsersByDisplayName";
import "./unit/imports/lib/ValidateShape";

import "./acceptance/authentication";
import "./acceptance/chatHooks";
import "./acceptance/emails";
import "./acceptance/hunts";
import "./acceptance/profiles";
import "./acceptance/smoke";
