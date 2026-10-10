import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Logger from "../Logger";
import MeteorUsers from "../lib/models/MeteorUsers";
import { primaryEmail } from "../lib/models/User";
import type { BoardServiceCredentials } from "../methods/configureBoardService";

// The account the board service logs in to Jolly Roger as. Jolly Roger
// makes it when the service is configured: an ordinary user, no roles,
// flagged serviceAccount so the profile lists leave it out. Its password is
// handed back once; only the hash is kept, as for anyone else.

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
