import { Meteor } from "meteor/meteor";
import type z from "zod";
import isAdmin, { GLOBAL_SCOPE } from "./isAdmin";
import type { HuntType } from "./models/Hunts";
import MeteorUsers from "./models/MeteorUsers";
import type { User } from "./models/User";
import type { Selector } from "./typedModel/Model";

// A hunt may grant roles to every member by default (Hunts.defaultRoles).
// Callers that only have a hunt id can still pass `{ _id }`; default roles
// are only honoured when the caller supplies them.
type HuntWithDefaultRoles = Pick<HuntType, "_id"> & {
  defaultRoles?: readonly string[];
};

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

function isOperatorForHunt(
  user: UserWithRoles,
  hunt: HuntWithDefaultRoles,
): boolean {
  if (user.roles?.[hunt._id]?.includes("operator")) {
    return true;
  }
  return defaultRolesForHunt(user, hunt).includes("operator");
}

export function listAllRolesForHunt(
  user: UserWithRoles | null | undefined,
  hunt: HuntWithDefaultRoles | null | undefined,
): string[] {
  if (!user || !hunt) {
    return [];
  }

  const roles = new Set([
    ...(user.roles?.[GLOBAL_SCOPE] ?? []),
    ...(user.roles?.[hunt._id] ?? []),
    ...defaultRolesForHunt(user, hunt),
  ]);
  return [...roles];
}

export function userIsOperatorForHunt(
  user: UserWithRoles | null | undefined,
  hunt: HuntWithDefaultRoles | null | undefined,
): boolean {
  if (!user || !hunt) {
    return false;
  }

  return isOperatorForHunt(user, hunt);
}

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
  hunt: HuntWithDefaultRoles | null | undefined,
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

// Only admins and explicitly assigned operators may grant or revoke operator
// roles. Default roles don't count here: they would let any member of such a
// hunt write a persistent role that outlives the hunt's configuration.
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

  return user.roles?.[hunt._id]?.includes("operator") ?? false;
}

export function userMaySeeUserInfoForHunt(
  user: UserWithRoles | null | undefined,
  hunt: HuntWithDefaultRoles | null | undefined,
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

// Bulk invites follow the same policy as single invites.
export function userMayBulkAddToHunt(
  user: Pick<Meteor.User, "roles" | "hunts"> | null | undefined,
  hunt: Pick<HuntType, "_id" | "openSignups"> | null | undefined,
): boolean {
  return userMayAddUsersToHunt(user, hunt);
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

export function userMayConfigureAssets(
  user: Pick<Meteor.User, "roles"> | null | undefined,
): boolean {
  return isAdmin(user);
}

export function userMayUpdateGuessesForHunt(
  user: UserWithRoles | null | undefined,
  hunt: HuntWithDefaultRoles | null | undefined,
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
  hunt: HuntWithDefaultRoles | null | undefined,
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
