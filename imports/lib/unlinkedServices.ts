import type { Meteor } from "meteor/meteor";

export type LinkableService = "google" | "discord";

// The services the server has turned on that the user hasn't linked.
export default function unlinkedServices(
  user:
    | Pick<Meteor.User, "googleAccount" | "discordAccount">
    | null
    | undefined,
  enabled: { google: boolean; discord: boolean },
): LinkableService[] {
  if (!user) {
    return [];
  }
  const missing: LinkableService[] = [];
  if (enabled.google && !user.googleAccount) {
    missing.push("google");
  }
  if (enabled.discord && !user.discordAccount) {
    missing.push("discord");
  }
  return missing;
}
