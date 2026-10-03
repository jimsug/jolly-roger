import MeteorUsers from "../../lib/models/MeteorUsers";
import Migrations from "./Migrations";

// Google logins and the Drive activity fetcher look users up by
// googleAccountId on its own, which migration 46's compound index (hunt
// first) can't serve. Meteor.users isn't a typed Model, so the index
// reconciler doesn't manage it and a migration is the place to create it.
export async function addGoogleAccountIdIndex() {
  await MeteorUsers.createIndexAsync({ googleAccountId: 1 });
}

Migrations.add({
  version: 57,
  name: "Add googleAccountId index to users",
  up: addGoogleAccountIdIndex,
});
