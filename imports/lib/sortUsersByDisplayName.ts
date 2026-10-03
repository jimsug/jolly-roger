import type { Meteor } from "meteor/meteor";

// Sorts hunters by display name ignoring case and accents, which Mongo's
// default collation on the publication can't do.
export default function sortUsersByDisplayName<
  T extends Pick<Meteor.User, "displayName">,
>(users: T[]): T[] {
  return users.toSorted((a, b) =>
    (a.displayName ?? "").localeCompare(b.displayName ?? "", undefined, {
      sensitivity: "base",
    }),
  );
}
