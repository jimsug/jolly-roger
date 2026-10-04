import type { TagSynonymRule } from "../lib/tagNames";
import TypedMethod from "./TypedMethod";

// Saves the server-wide tag synonym table, which replaces the built-in one.
export default new TypedMethod<{ rules: TagSynonymRule[] }, void>(
  "Setup.methods.configureTagSynonyms",
);
