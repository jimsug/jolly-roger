import TypedMethod from "./TypedMethod";

// Queues a job that renames every existing tag a synonym rule covers to its
// canonical name, in every hunt, merging where that name is already taken.
export default new TypedMethod<void, void>("Setup.methods.applyTagSynonyms");
