import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import Logger from "../Logger";
import MeteorUsers from "../lib/models/MeteorUsers";

// Whether the account is a placeholder that an operator's email invite
// created and nobody has claimed: nobody has ever signed in to it, and
// nobody can, since it has no password hash (an unfinished enrollment leaves
// services.password with only its token) and no linked Google account. An
// account its owner has emptied of login methods (by unlinking Google, say)
// has still been signed in to, so it doesn't count.
function isUnclaimedPlaceholder(user: Meteor.User): boolean {
  const services = user.services as
    | {
        password?: { bcrypt?: unknown; argon2?: unknown };
        resume?: { loginTokens?: unknown[] };
      }
    | undefined;
  return (
    !services?.password?.bcrypt &&
    !services?.password?.argon2 &&
    !user.googleAccountId &&
    !user.lastLogin &&
    !services?.resume?.loginTokens?.length
  );
}

// The account a Google sign-in through a hunt invitation logs in to when no
// account is linked to that Google account yet.
//
// When Google has verified the address, an account with that address takes
// the sign-in if the address is verified there too, or if the account is an
// unclaimed placeholder. An account that already has a different Google
// account linked refuses rather than losing that link. An unverified address
// on an account someone has signed in to doesn't count, since anyone can add
// any address to their own account from the profile page.
//
// Otherwise the Google account gets a new account: with the address if no
// account has it, or without it, since Meteor won't let two accounts share an
// address.
export default async function accountForGoogleInvitation({
  email,
  verifiedByGoogle,
  id,
  name,
  picture,
}: {
  email: string;
  verifiedByGoogle: boolean;
  id: string;
  name: string;
  picture?: string;
}): Promise<string> {
  const google = {
    googleAccount: email,
    googleAccountId: id,
    googleProfilePicture: picture,
  };
  const existing = await Accounts.findUserByEmail(email);
  if (!existing) {
    const userId = await Accounts.createUserAsync({ email });
    await MeteorUsers.updateAsync(userId, {
      $set: { ...google, displayName: name },
    });
    return userId;
  }

  if (verifiedByGoogle) {
    const lowered = email.toLowerCase();
    const verifiedHere = !!existing.emails?.some(
      (e) => e.address.toLowerCase() === lowered && e.verified,
    );
    const placeholder = isUnclaimedPlaceholder(existing);
    if (verifiedHere || placeholder) {
      if (existing.googleAccountId) {
        Logger.info(
          "Not linking Google sign-in from an invitation to an account linked to another Google account",
          { user: existing._id },
        );
        throw new Meteor.Error(
          403,
          "This email address belongs to an account that is linked to a different Google account. Sign in with that Google account, or sign in another way and link this one from your profile.",
        );
      }

      Logger.info("Linking Google sign-in from an invitation to an account", {
        user: existing._id,
        placeholder,
      });
      // A placeholder's invite links stop working once it's claimed, as
      // they would had it been claimed through one of them.
      await MeteorUsers.updateAsync(existing._id, {
        $set: {
          ...google,
          ...(existing.displayName ? {} : { displayName: name }),
        },
        ...(placeholder
          ? {
              $unset: {
                "services.password.enroll": 1,
                "services.password.reset": 1,
              },
            }
          : {}),
      });
      return existing._id;
    }
  }

  Logger.info("Not linking Google sign-in from an invitation to an account", {
    user: existing._id,
    verifiedByGoogle,
  });
  return MeteorUsers.insertAsync({
    createdAt: new Date(),
    ...google,
    displayName: name,
  });
}
