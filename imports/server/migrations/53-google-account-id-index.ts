import MeteorUsers from "../../lib/models/MeteorUsers";
import Migrations from "./Migrations";

Migrations.add({
  version: 53,
  name: "Add googleAccountId index to users",
  async up() {
    await MeteorUsers.createIndexAsync({ googleAccountId: 1 });
  },
});
