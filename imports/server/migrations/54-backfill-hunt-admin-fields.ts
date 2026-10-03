import backfillHuntAdminFields from "../backfillHuntAdminFields";
import Migrations from "./Migrations";

Migrations.add({
  version: 54,
  name: "Backfill hunt admin fields and drop removed ones",
  async up() {
    await backfillHuntAdminFields();
  },
});
