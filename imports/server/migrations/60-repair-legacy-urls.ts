import repairLegacyUrls from "../repairLegacyUrls";
import Migrations from "./Migrations";

Migrations.add({
  version: 60,
  name: "Repair or clear URLs the schema's Url pattern rejects",
  async up() {
    await repairLegacyUrls();
  },
});
