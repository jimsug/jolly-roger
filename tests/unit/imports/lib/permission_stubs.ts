import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import {
  listAllRolesForHunt,
  userIsOperatorForHunt,
  userMayAddUsersToHunt,
  userMayBulkAddToHunt,
  userMayMakeOperatorForHunt,
  userMayUpdateGuessesForHunt,
  userMayUpdateHuntInvitationCode,
  userMayWritePuzzlesForHunt,
} from "../../../../imports/lib/permission_stubs";

describe("permission_stubs", function () {
  const plainHunt = { _id: "hunt1", openSignups: false, defaultRoles: [] };
  const operatorByDefaultHunt = {
    _id: "hunt2",
    openSignups: false,
    defaultRoles: ["operator"],
  };
  const openHunt = { _id: "hunt3", openSignups: true, defaultRoles: [] };

  const admin = { roles: { [GLOBAL_SCOPE]: ["admin"] }, hunts: [] };
  const explicitOperator = {
    roles: { [plainHunt._id]: ["operator"] },
    hunts: [plainHunt._id],
  };
  const member = {
    roles: {},
    hunts: [plainHunt._id, operatorByDefaultHunt._id],
  };
  const nonMember = { roles: {}, hunts: [openHunt._id] };

  describe("default roles", function () {
    it("treats members as having the hunt's default roles", function () {
      assert.isTrue(userIsOperatorForHunt(member, operatorByDefaultHunt));
      assert.isTrue(userMayWritePuzzlesForHunt(member, operatorByDefaultHunt));
      assert.isTrue(userMayUpdateGuessesForHunt(member, operatorByDefaultHunt));
      assert.sameMembers(listAllRolesForHunt(member, operatorByDefaultHunt), [
        "operator",
      ]);
    });

    it("does not grant default roles to non-members", function () {
      assert.isFalse(userIsOperatorForHunt(nonMember, operatorByDefaultHunt));
      assert.isFalse(
        userMayWritePuzzlesForHunt(nonMember, operatorByDefaultHunt),
      );
      assert.deepEqual(
        listAllRolesForHunt(nonMember, operatorByDefaultHunt),
        [],
      );
    });

    it("does not grant roles the hunt doesn't default to", function () {
      assert.isFalse(userIsOperatorForHunt(member, plainHunt));
      assert.deepEqual(listAllRolesForHunt(member, plainHunt), []);
    });

    it("ignores default roles when the caller only has a hunt id", function () {
      assert.isFalse(
        userIsOperatorForHunt(member, { _id: operatorByDefaultHunt._id }),
      );
    });

    it("still honours explicit roles", function () {
      assert.isTrue(userIsOperatorForHunt(explicitOperator, plainHunt));
      assert.sameMembers(listAllRolesForHunt(explicitOperator, plainHunt), [
        "operator",
      ]);
    });

    it("lists each role once when it is both explicit and default", function () {
      const user = {
        roles: { [operatorByDefaultHunt._id]: ["operator"] },
        hunts: [operatorByDefaultHunt._id],
      };
      assert.deepEqual(listAllRolesForHunt(user, operatorByDefaultHunt), [
        "operator",
      ]);
    });

    it("handles missing users and hunts", function () {
      assert.isFalse(userIsOperatorForHunt(undefined, plainHunt));
      assert.isFalse(userIsOperatorForHunt(member, null));
      assert.deepEqual(listAllRolesForHunt(null, plainHunt), []);
    });
  });

  describe("inviting users", function () {
    it("allows admins", function () {
      assert.isTrue(userMayAddUsersToHunt(admin, plainHunt));
    });

    it("allows members of hunts with open signups", function () {
      assert.isTrue(userMayAddUsersToHunt(nonMember, openHunt));
      assert.isFalse(userMayAddUsersToHunt(member, plainHunt));
    });

    it("does not allow operators without open signups", function () {
      assert.isFalse(userMayAddUsersToHunt(explicitOperator, plainHunt));
      assert.isFalse(userMayAddUsersToHunt(member, operatorByDefaultHunt));
    });

    it("does not allow non-members", function () {
      assert.isFalse(userMayAddUsersToHunt(nonMember, plainHunt));
    });
  });

  describe("invitation links", function () {
    it("only allows admins", function () {
      assert.isTrue(userMayUpdateHuntInvitationCode(admin, plainHunt));
      assert.isFalse(
        userMayUpdateHuntInvitationCode(explicitOperator, plainHunt),
      );
      assert.isFalse(
        userMayUpdateHuntInvitationCode(member, operatorByDefaultHunt),
      );
      assert.isFalse(userMayUpdateHuntInvitationCode(undefined, plainHunt));
    });
  });

  describe("bulk invites", function () {
    it("follows the single-invite policy", function () {
      assert.isTrue(userMayBulkAddToHunt(admin, plainHunt));
      assert.isTrue(userMayBulkAddToHunt(nonMember, openHunt));
      assert.isFalse(userMayBulkAddToHunt(member, plainHunt));
      assert.isFalse(userMayBulkAddToHunt(explicitOperator, plainHunt));
      assert.isFalse(userMayBulkAddToHunt(member, operatorByDefaultHunt));
      assert.isFalse(userMayBulkAddToHunt(undefined, plainHunt));
    });
  });

  describe("promoting and demoting operators", function () {
    it("requires an explicit operator role", function () {
      assert.isTrue(userMayMakeOperatorForHunt(admin, plainHunt));
      assert.isTrue(userMayMakeOperatorForHunt(explicitOperator, plainHunt));
      assert.isFalse(userMayMakeOperatorForHunt(member, plainHunt));
      assert.isFalse(userMayMakeOperatorForHunt(member, operatorByDefaultHunt));
      assert.isFalse(userMayMakeOperatorForHunt(undefined, plainHunt));
    });
  });
});
