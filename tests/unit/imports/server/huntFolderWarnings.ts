import { Accounts } from "meteor/accounts-base";
import { assert } from "chai";
import sinon from "sinon";
import Logger from "../../../../imports/Logger";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import type { EditableHuntType } from "../../../../imports/lib/models/Hunts";
import { addUserToRole } from "../../../../imports/lib/permission_stubs";
import createHunt from "../../../../imports/methods/createHunt";
import updateHunt from "../../../../imports/methods/updateHunt";
import GoogleClient from "../../../../imports/server/googleClientRefresher";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";
import waitForAssertion from "../../../lib/waitForAssertion";

// createHunt and updateHunt set up the hunt's Drive folder in a deferred task
// that catches its own failures. With Drive unconfigured that task fails, and
// the warning it logs has to say which hunt it was for.
describe("hunt folder warnings", function () {
  this.timeout(10000);

  const huntFields: EditableHuntType = {
    name: "Folderless hunt",
    mailingLists: [],
    openSignups: false,
    hasGuessQueue: true,
    defaultRoles: [],
    allowUnlockablePuzzles: false,
    isArchived: false,
    customLinkEmbed: false,
  };

  let adminId: string;
  let warn: sinon.SinonStub;

  const asAdmin = <T>(fn: () => Promise<T>) => asUser(adminId, fn);

  const createFolderlessHunt = () =>
    asAdmin(() => createHunt.callPromise({ ...huntFields, initialTags: [] }));
  const waitForWarning = (message: string, huntId: string) =>
    waitForAssertion(() =>
      assert.isTrue(
        warn.calledWithMatch(message, { huntId }),
        `Expected "${message}" for hunt ${huntId}`,
      ),
    );

  beforeEach(async function () {
    await resetDatabase("hunt folder warnings");
    assert.isFalse(GoogleClient.ready(), "These tests need Drive unconfigured");
    adminId = await Accounts.createUserAsync({
      email: "admin@example.com",
      password: "password",
    });
    await addUserToRole(adminId, GLOBAL_SCOPE, "admin");
    warn = sinon.stub(Logger, "warn");
  });

  afterEach(function () {
    warn.restore();
  });

  it("logs a failed setup against the new hunt", async function () {
    const huntId = await createFolderlessHunt();
    await waitForWarning("Unable to finish setting up hunt", huntId);
  });

  it("logs a failed folder rename against the hunt", async function () {
    const huntId = await createFolderlessHunt();
    await waitForWarning("Unable to finish setting up hunt", huntId);

    await asAdmin(() =>
      updateHunt.callPromise({
        huntId,
        value: { ...huntFields, name: "Renamed hunt" },
      }),
    );
    await waitForWarning("Unable to finish updating hunt", huntId);
  });
});
