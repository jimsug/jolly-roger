import CallActivities from "../../lib/models/CallActivities";
import Migrations from "./Migrations";

// The Palindrome fork's database recorded its own migration 53 (the
// googleAccountId index, now 57), so upstream's 53 never runs there and its
// older call activity rows would stay without the speaking flag. Repeat the
// backfill; it does nothing where 53 already ran.
Migrations.add({
  version: 59,
  name: "Backfill speaking flag on call activities for fork databases",
  async up() {
    await CallActivities.updateAsync(
      { speaking: { $exists: false } },
      { $set: { speaking: true } },
      { multi: true },
    );
  },
});
