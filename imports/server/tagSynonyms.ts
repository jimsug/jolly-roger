import { Meteor } from "meteor/meteor";
import Settings from "../lib/models/Settings";
import { TAG_SYNONYMS, type TagSynonymRule } from "../lib/tagNames";
import onExit from "./onExit";

let serverTagSynonyms: readonly TagSynonymRule[] = TAG_SYNONYMS;

// The synonym table the server applies: the tag.synonyms setting, or the
// built-in table without one. Server code passes it to the tag helpers in
// imports/lib/tagNames.ts.
export default function currentTagSynonyms(): readonly TagSynonymRule[] {
  return serverTagSynonyms;
}

Meteor.startup(async () => {
  const observer = await Settings.find({ name: "tag.synonyms" }).observeAsync({
    added: (doc) => {
      if (doc.name === "tag.synonyms") {
        serverTagSynonyms = doc.value.rules;
      }
    },
    changed: (doc) => {
      if (doc.name === "tag.synonyms") {
        serverTagSynonyms = doc.value.rules;
      }
    },
    removed: () => {
      serverTagSynonyms = TAG_SYNONYMS;
    },
  });
  onExit(() => observer.stop());
});
