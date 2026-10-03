import MeteorUsers from "../../lib/models/MeteorUsers";
import dropIndex from "./dropIndex";
import Migrations from "./Migrations";

// Google logins look users up by googleAccountId alone, and the Drive activity
// fetcher adds a hunts filter and a createdAt sort to that; a googleAccountId
// index serves both. Migration 46's index keys on hunt, a field users don't
// have, so it serves neither and goes. Meteor.users isn't a typed Model, so the
// index reconciler doesn't manage it and a migration is the place to change its
// indexes.
Migrations.add({
  version: 57,
  name: "Add googleAccountId index to users",
  async up() {
    await dropIndex(MeteorUsers, "hunt_1_googleAccountId_1_createdAt_1");
    await MeteorUsers.createIndexAsync({ googleAccountId: 1 });
  },
});
