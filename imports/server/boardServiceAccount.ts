import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Logger from "../Logger";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import { primaryEmail } from "../lib/models/User";
import type { BoardServiceCredentials } from "../methods/configureBoardService";

// The account the board service logs in to Jolly Roger as. Jolly Roger
// makes it when the service is configured: an ordinary user, no roles,
// flagged serviceAccount so the profile lists leave it out. Its password is
// handed back once; only the hash is kept, as for anyone else.
//
// The account is a member of every hunt, put there when the service is
// configured and whenever a hunt is created. A hunt board shows the hunt's
// puzzles, which the service reads over DDP through the ordinary member
// publications; those are gated on membership when the subscription starts
// and never re-run, so the account has to be in the hunt before the service
// subscribes, and being in every hunt is simpler than joining per board.

export const SERVICE_ACCOUNT_DISPLAY_NAME = "Board service";

const PASSWORD_LENGTH = 32;

// A dotted host name, not an IP; what can follow the @ of the address
const DOMAIN = /^(?!\d+(\.\d+){3}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

// board-service+<random>@<this site's host>, or a reserved domain when the
// site's host isn't a domain name (localhost, an address). Nothing is ever
// sent to it.
function serviceAccountEmail(): string {
  const host = new URL(Meteor.absoluteUrl()).hostname;
  const domain = DOMAIN.test(host) ? host : "jolly-roger.invalid";
  return `board-service+${Random.id(8).toLowerCase()}@${domain}`;
}

export async function createBoardServiceAccount(): Promise<
  BoardServiceCredentials & { userId: string }
> {
  const email = serviceAccountEmail();
  const password = Random.secret(PASSWORD_LENGTH);
  const userId = await Accounts.createUserAsync({ email, password });
  await MeteorUsers.updateAsync(userId, {
    $set: { displayName: SERVICE_ACCOUNT_DISPLAY_NAME, serviceAccount: true },
  });
  Logger.info("Created the board service's account", { userId, email });
  return { userId, email, password };
}

// A new password for the account; its sessions are logged out with the old
// one.
export async function rotateBoardServiceCredentials(
  userId: string,
): Promise<BoardServiceCredentials> {
  const account = await MeteorUsers.findOneAsync(userId);
  const email = account && primaryEmail(account);
  if (!account?.serviceAccount || !email) {
    throw new Meteor.Error(400, "The board service's account is missing");
  }
  const password = Random.secret(PASSWORD_LENGTH);
  await Accounts.setPasswordAsync(userId, password, { logout: true });
  Logger.info("Rotated the board service's password", { userId });
  return { email, password };
}

// Puts the account in the hunts as an ordinary member: no role, no email,
// no mailing list, no Discord role (so not addUserToHunt)
export async function addServiceAccountToHunts(
  userId: string,
  huntIds: string[],
): Promise<void> {
  if (huntIds.length === 0) return;
  await MeteorUsers.updateAsync(userId, {
    $addToSet: { hunts: { $each: huntIds } },
  });
}

// Every hunt that isn't deleted
export async function addServiceAccountToAllHunts(
  userId: string,
): Promise<void> {
  const hunts = await Hunts.find({}, { projection: { _id: 1 } }).mapAsync(
    (hunt) => hunt._id,
  );
  Logger.info("Putting the board service's account in every hunt", {
    userId,
    hunts: hunts.length,
  });
  await addServiceAccountToHunts(userId, hunts);
}
