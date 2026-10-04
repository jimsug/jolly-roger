import type { TagSynonymRule } from "../lib/tagNames";
import TypedMethod from "./TypedMethod";

// Saves the server-wide tag synonym table, which replaces the built-in one.
// With reset, the saved table goes (rules are ignored) and the built-in one
// applies again.
export default new TypedMethod<
  { rules: TagSynonymRule[]; reset?: boolean },
  void
>("Setup.methods.configureTagSynonyms");
