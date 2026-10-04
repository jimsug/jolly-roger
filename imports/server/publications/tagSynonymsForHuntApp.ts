import Settings from "../../lib/models/Settings";
import tagSynonymsForHuntApp from "../../lib/publications/tagSynonymsForHuntApp";
import definePublication from "./definePublication";

definePublication(tagSynonymsForHuntApp, {
  run() {
    if (!this.userId) {
      return [];
    }

    return Settings.find(
      { name: "tag.synonyms" },
      { projection: { name: 1, value: 1, deleted: 1 } },
    );
  },
});
