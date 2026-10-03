import { assert } from "chai";
import { GLOBAL_SCOPE } from "../../../../imports/lib/isAdmin";
import type { HuntType } from "../../../../imports/lib/models/Hunts";
import {
  huntGrantsRoleByDefault,
  huntsUserIsOperatorFor,
  listAllRolesForHunt,
  listAssignedRolesForHunt,
  userHasAssignedRoleForHunt,
  userHasEffectiveRoleForHunt,
  userIsOperatorForHunt,
  userMayAddUsersToHunt,
  userMayMakeOperatorForHunt,
  userMayUpdateGuessesForHunt,
  userMayUpdateHuntInvitationCode,
  userMayWritePuzzlesForHunt,
} from "../../../../imports/lib/permission_stubs";

type TestHunt = Pick<HuntType, "_id" | "openSignups" | "defaultRoles">;

describe("permission_stubs", function () {
  const plainHunt: TestHunt = {
    _id: "hunt1",
    openSignups: false,
    defaultRoles: [],
  };
  const operatorByDefaultHunt: TestHunt = {
    _id: "hunt2",
    openSignups: false,
    defaultRoles: ["operator"],
  };
  const openHunt: TestHunt = {
    _id: "hunt3",
    openSignups: true,
    defaultRoles: [],
  };

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

    it("leaves default roles out where only assigned roles count", function () {
      assert.isTrue(
        userHasEffectiveRoleForHunt(member, operatorByDefaultHunt, "operator"),
      );
      assert.isFalse(
        userHasAssignedRoleForHunt(member, operatorByDefaultHunt, "operator"),
      );
      assert.deepEqual(
        listAssignedRolesForHunt(member, operatorByDefaultHunt),
        [],
      );
      assert.isFalse(
        huntsUserIsOperatorFor(member).has(operatorByDefaultHunt._id),
      );
    });

    it("knows which roles a hunt grants by default", function () {
      assert.isTrue(huntGrantsRoleByDefault(operatorByDefaultHunt, "operator"));
      assert.isFalse(huntGrantsRoleByDefault(plainHunt, "operator"));
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

    it("handles missing users and hunts", function () {
      assert.isFalse(userMayAddUsersToHunt(undefined, plainHunt));
      assert.isFalse(userMayAddUsersToHunt(admin, null));
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
