import { z } from "zod";
import {
  foreignKey,
  nonEmptyString,
  stringId,
} from "../typedModel/customTypes";
import validateSchema from "../typedModel/validateSchema";
import type { DiscordAccountType } from "./DiscordAccount";
import DiscordAccount from "./DiscordAccount";

declare module "meteor/meteor" {
  namespace Meteor {
    interface UserProfile {
      [key: string]: never;
    }
    interface User {
      lastLogin?: Date;
      hunts?: string[];
      huntTermsAcceptedAt?: Record<string, Date>;
      roles?: Record<string, string[]>; // scope -> roles
      displayName?: string;
      googleAccount?: string;
      /**
       * A historical note: we have not always collected googleAccountId, so it
       * is possible that googleAccount is populated while googleAccountId is
       * not. However, the reverse should not happen
       */
      googleAccountId?: string;
      googleProfilePicture?: string; // Never guaranteed to be set, even if googleAccount and googleAccountId are
      discordAccount?: DiscordAccountType;
      phoneNumber?: string;
      dingwords?: string[];
      // How dingwords match: set for "prefix" (Match word starts, so "logic"
      // dings on "logician"), unset or false for "word" (Match whole words).
      dingwordsOpenMatch?: boolean;
      // Dingwords muted per puzzle: hunt id -> puzzle id -> words (or the
      // SUPPRESS_ALL_DINGWORDS sentinel for every dingword on that puzzle).
      suppressedDingwords?: Record<string, Record<string, string[]>>;
      // Hunting remotely: puzzles that need someone on site sort below the
      // rest of their group for this user
      isOffsite?: boolean;
      mergedInto?: string;
    }
  }
}

// Note: this needs to exactly match the type of Meteor.User, otherwise we will
// fail typechecking when we use our attachSchema function. Also, because
// Meteor.users isn't a Model, we can't rely on transforms or defaults in this
// schema.
export const User = z.object({
  _id: stringId,
  username: z
    .string()
    .regex(/^[a-z0-9A-Z_]{3,15}$/)
    .optional(),
  emails: z
    .object({ address: z.email(), verified: z.boolean() })
    .array()
    .optional(),
  createdAt: z.date().optional(),
  lastLogin: z.date().optional(),
  services: z.any().optional(),
  profile: z.object({}).optional(),
  roles: z.record(z.string(), nonEmptyString.array()).optional(),
  hunts: foreignKey.array().optional(),
  huntTermsAcceptedAt: z.record(z.string(), z.date()).optional(),
  displayName: nonEmptyString.optional(),
  googleAccount: nonEmptyString.optional(),
  googleAccountId: nonEmptyString.optional(),
  googleProfilePicture: nonEmptyString.optional(),
  discordAccount: DiscordAccount.optional(),
  phoneNumber: nonEmptyString.optional(),
  dingwords: nonEmptyString.array().optional(),
  dingwordsOpenMatch: z.boolean().optional(),
  suppressedDingwords: z
    .record(z.string(), z.record(z.string(), nonEmptyString.array()))
    .optional(),
  isOffsite: z.boolean().optional(),
  mergedInto: foreignKey.optional(),
});
validateSchema(User);

export function primaryEmail(user: {
  emails?: { address: string }[];
}): string | undefined {
  return user.emails?.[0]?.address;
}

export type PendingEnrollment = {
  email?: string;
  when?: Date;
};

// The enrollment record Meteor keeps on a user who has been invited but has
// not yet finished creating their account. `services` is untyped in Meteor's
// declarations, so narrow it here in one place.
export function pendingEnrollment(user: {
  services?: unknown;
}): PendingEnrollment | undefined {
  const services = user.services as
    | { password?: { enroll?: PendingEnrollment } }
    | undefined;
  return services?.password?.enroll;
}

export type ProfileFields =
  | "displayName"
  | "googleAccount"
  | "discordAccount"
  | "phoneNumber"
  | "dingwords";
