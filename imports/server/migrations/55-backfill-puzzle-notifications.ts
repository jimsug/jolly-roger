import backfillPuzzleNotifications from "../backfillPuzzleNotifications";
import Migrations from "./Migrations";

Migrations.add({
  version: 55,
  name: "Backfill puzzle notification backgrounds and drop className",
  async up() {
    await backfillPuzzleNotifications();
  },
});
