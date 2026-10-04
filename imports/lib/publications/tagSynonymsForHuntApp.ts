import TypedPublication from "./TypedPublication";

// The tag.synonyms setting, for anyone logged in: HuntApp subscribes so tag
// chips, sorting and search read tags through the server's table. Without a
// saved setting nothing is published and the client uses TAG_SYNONYMS.
export default new TypedPublication<void>(
  "Settings.publications.tagSynonymsForHuntApp",
);
