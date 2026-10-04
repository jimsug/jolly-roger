import { useTracker } from "meteor/react-meteor-data";
import Settings from "../../lib/models/Settings";
import { TAG_SYNONYMS, type TagSynonymRule } from "../../lib/tagNames";

// The server-wide synonym table for a component to pass to the tag helpers,
// once a subscription has brought it (HuntApp's for every hunt page, the
// Setup page's for admins), else the built-in one. The component renders
// again when an admin changes it.
export default function useTagSynonyms(): readonly TagSynonymRule[] {
  return useTracker(
    () =>
      Settings.findOne({ name: "tag.synonyms" })?.value.rules ?? TAG_SYNONYMS,
    [],
  );
}
