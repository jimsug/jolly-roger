import { Meteor } from "meteor/meteor";
import type z from "zod";
import isAdmin, { GLOBAL_SCOPE } from "./isAdmin";
import type { HuntDefaultRole, HuntType } from "./models/Hunts";
import MeteorUsers from "./models/MeteorUsers";
import type { User } from "./models/User";
import type { WhiteboardType } from "./models/Whiteboards";
import type { Selector } from "./typedModel/Model";

type HuntWithDefaultRoles = Pick<HuntType, "_id" | "defaultRoles">;

type UserWithRoles = Pick<Meteor.User, "roles" | "hunts">;

// Default roles apply to members of the hunt only; they are never written to
// the user's account.
function defaultRolesForHunt(
  user: Pick<Meteor.User, "hunts">,
  hunt: HuntWithDefaultRoles,
): readonly string[] {
  if (!user.hunts?.includes(hunt._id)) {
    return [];
  }
  return hunt.defaultRoles ?? [];
}

// Whether the hunt grants this role to every member (Hunts.defaultRoles)
export function huntGrantsRoleByDefault(
  hunt: Pick<HuntType, "defaultRoles">,
  role: HuntDefaultRole,
): boolean {
  return hunt.defaultRoles.includes(role);
}

// A role written to the user's account for this hunt. The hunt's default
// roles don't count.
export function userHasAssignedRoleForHunt(
  user: Pick<Meteor.User, "roles"> | null | undefined,
  hunt: Pick<HuntType, "_id"> | null | undefined,
  role: string,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  return user.roles?.[hunt._id]?.includes(role) ?? false;
}

// A role the user holds in this hunt, whether assigned to them or granted to
// every member by the hunt's default roles.
export function userHasEffectiveRoleForHunt(
  user: UserWithRoles | null | undefined,
  hunt: Pick<HuntType, "_id" | "defaultRoles"> | null | undefined,
  role: string,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  return (
    userHasAssignedRoleForHunt(user, hunt, role) ||
    defaultRolesForHunt(user, hunt).includes(role)
  );
}

function isOperatorForHunt(
  user: UserWithRoles,
  hunt: Pick<HuntType, "_id" | "defaultRoles">,
): boolean {
  return userHasEffectiveRoleForHunt(user, hunt, "operator");
}

// Global roles plus the roles assigned to the user for this hunt, without the
// hunt's default roles.
export function listAssignedRolesForHunt(
  user: Pick<Meteor.User, "roles"> | null | undefined,
  hunt: Pick<HuntType, "_id"> | null | undefined,
): string[] {
  if (!user || !hunt) {
    return [];
  }

  const roles = new Set([
    ...(user.roles?.[GLOBAL_SCOPE] ?? []),
    ...(user.roles?.[hunt._id] ?? []),
  ]);
  return [...roles];
}

export function listAllRolesForHunt(
  user: UserWithRoles | null | undefined,
  hunt: HuntWithDefaultRoles | null | undefined,
): string[] {
  if (!user || !hunt) {
    return [];
  }

  const roles = new Set([
    ...listAssignedRolesForHunt(user, hunt),
    ...defaultRolesForHunt(user, hunt),
  ]);
  return [...roles];
}

export function userIsOperatorForHunt(
  user: UserWithRoles | null | undefined,
  hunt: Pick<HuntType, "_id" | "defaultRoles"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  return isOperatorForHunt(user, hunt);
}

// Assigned operator roles only, on purpose: the pending-guess feed follows
// this, and a hunt that makes every member an operator by default shouldn't
// send every member every guess.
export function huntsUserIsOperatorFor(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): Set<string> {
  if (!user?.roles) {
    return new Set();
  }

  return Object.entries(user.roles)
    .filter(
      ([huntId, roles]) =>
        huntId !== GLOBAL_SCOPE && roles?.includes("operator"),
    )
    .reduce((acc, [huntId]) => {
      acc.add(huntId);
      return acc;
    }, new Set<string>());
}

// Matches assigned operators only, on purpose: @operator mentions fall back to
// everyone this finds, and a hunt that makes every member an operator by
// default shouldn't ping every member.
export function queryOperatorsForHunt(
  hunt: Pick<HuntType, "_id">,
): Selector<z.output<typeof User>> {
  return {
    [`roles.${hunt._id}`]: "operator",
  };
}

// Admins are always allowed to join someone to a hunt. Everyone else
// (operators included) can only do so if they are already a member of that
// hunt and the hunt allows open signups.
export function userMayAddUsersToHunt(
  user: Pick<Meteor.User, "roles" | "hunts"> | null | undefined,
  hunt: Pick<HuntType, "_id" | "openSignups"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  // Admins can always do everything
  if (isAdmin(user)) {
    return true;
  }

  // You can only add users to a hunt if you're already a member of said hunt.
  const joinedHunts = user.hunts;
  if (!joinedHunts) {
    return false;
  }

  if (!joinedHunts.includes(hunt._id)) {
    return false;
  }

  return hunt.openSignups;
}

// Only admins may generate or clear invitation links, since anyone holding
// the link can join the hunt.
export function userMayUpdateHuntInvitationCode(
  user: Pick<Meteor.User, "roles"> | null | undefined,
  hunt: Pick<HuntType, "_id"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  return isAdmin(user);
}

// Admins and operators may add announcements to a hunt.
export function userMayAddAnnouncementToHunt(
  user: UserWithRoles | null | undefined,
  hunt: Pick<HuntType, "_id" | "defaultRoles"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  if (isAdmin(user)) {
    return true;
  }

  if (isOperatorForHunt(user, hunt)) {
    return true;
  }

  return false;
}

// Only admins and assigned operators may grant or revoke operator roles.
// Default roles don't count here, on purpose: they would let any member of
// such a hunt write a persistent role that outlives the hunt's configuration.
export function userMayMakeOperatorForHunt(
  user: UserWithRoles | null | undefined,
  hunt: Pick<HuntType, "_id"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  if (isAdmin(user)) {
    return true;
  }

  return userHasAssignedRoleForHunt(user, hunt, "operator");
}

export function userMaySeeUserInfoForHunt(
  user: UserWithRoles | null | undefined,
  hunt: Pick<HuntType, "_id" | "defaultRoles"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  if (isAdmin(user)) {
    return true;
  }

  if (isOperatorForHunt(user, hunt)) {
    return true;
  }

  return false;
}

export function userMayUseDiscordBotAPIs(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function checkAdmin(
  user: Pick<Meteor.User, "roles"> | null | undefined,
) {
  if (!isAdmin(user)) {
    throw new Meteor.Error(401, "Must be admin");
  }
}

export function userMayConfigureGdrive(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureGoogleOAuth(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureAWS(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureDiscordOAuth(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureDiscordBot(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureEmailBranding(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureServerLanguage(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureTeamName(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureDefaultHuntTags(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayConfigureAssets(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayUpdateGuessesForHunt(
  user: UserWithRoles | null | undefined,
  hunt: Pick<HuntType, "_id" | "defaultRoles"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  if (isOperatorForHunt(user, hunt)) {
    return true;
  }
  return false;
}

export function userMayWritePuzzlesForHunt(
  user: UserWithRoles | null | undefined,
  hunt: Pick<HuntType, "_id" | "defaultRoles"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  if (isOperatorForHunt(user, hunt)) {
    return true;
  }
  return false;
}

// What someone may do on a hunt's whiteboard. "edit" includes commenting,
// and "comment" includes viewing.
export type WhiteboardAccess = "edit" | "comment" | "view" | "none";
// Why someone has less than "edit". "narrow" is only ever set by the client,
// which keeps small screens to commenting.
export type WhiteboardAccessReason =
  | "archived"
  | "operators"
  | "operatorsAndEditors"
  | "narrow";

// Members only, admins included: every board publication is for members, so
// letting anyone else through would let them write to a board they can't
// see. An archived hunt's board is view-only. Otherwise the board's edit
// policy decides between editing and commenting.
export function whiteboardAccess(
  user: (UserWithRoles & Pick<Meteor.User, "_id">) | null | undefined,
  hunt:
    | Pick<HuntType, "_id" | "defaultRoles" | "isArchived">
    | null
    | undefined,
  board: Pick<WhiteboardType, "editPolicy" | "editors">,
): { access: WhiteboardAccess; reason?: WhiteboardAccessReason } {
  if (!user || !hunt || !user.hunts?.includes(hunt._id)) {
    return { access: "none" };
  }
  if (hunt.isArchived) {
    return { access: "view", reason: "archived" };
  }
  const policy = board.editPolicy ?? "members";
  switch (policy) {
    case "members":
      return { access: "edit" };
    case "operators":
      return userMayWritePuzzlesForHunt(user, hunt)
        ? { access: "edit" }
        : { access: "comment", reason: policy };
    case "operatorsAndEditors":
      return userMayWritePuzzlesForHunt(user, hunt) ||
        (board.editors?.includes(user._id) ?? false)
        ? { access: "edit" }
        : { access: "comment", reason: policy };
    default:
      return policy satisfies never;
  }
}

export function userMayCreateHunt(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayUpdateHunt(
  user: Pick<Meteor.User, "roles"> | null | undefined,
  _hunt: Pick<HuntType, "_id"> | null | undefined,
): boolean {
  // TODO: make this driven by if you're an operator of the hunt in question
  return isAdmin(user);
}

export function userMayPurgeHunt(
  user: Pick<Meteor.User, "roles"> | null | undefined,
  _hunt: Pick<HuntType, "_id"> | null | undefined,
): boolean {
  // TODO: make this driven by if you're an owner of the hunt in question
  return isAdmin(user);
}

export function userMayJoinCallsForHunt(
  user: Pick<Meteor.User, "roles" | "hunts"> | null | undefined,
  hunt: Pick<HuntType, "_id"> | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  if (user.hunts?.includes(hunt._id)) {
    return true;
  }
  return false;
}

export async function addUserToRole(
  userId: string,
  scope: string,
  role: string,
) {
  await MeteorUsers.updateAsync(
    {
      _id: userId,
    },
    {
      $addToSet: {
        [`roles.${scope}`]: {
          $each: [role],
        },
      },
    },
  );
}

export async function addUserToRoles(
  userId: string,
  scope: string,
  roles: string[],
) {
  await MeteorUsers.updateAsync(
    {
      _id: userId,
    },
    {
      $addToSet: {
        [`roles.${scope}`]: {
          $each: roles,
        },
      },
    },
  );
}

export async function removeUserFromRole(
  userId: string,
  scope: string,
  role: string,
) {
  await MeteorUsers.updateAsync(
    {
      _id: userId,
    },
    {
      $pullAll: {
        [`roles.${scope}`]: [role],
      },
    },
  );
}

export async function removeUserFromRoles(
  userId: string,
  scope: string,
  roles: string[],
) {
  await MeteorUsers.updateAsync(
    {
      _id: userId,
    },
    {
      $pullAll: {
        [`roles.${scope}`]: roles,
      },
    },
  );
}
