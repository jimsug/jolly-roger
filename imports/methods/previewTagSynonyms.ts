import TypedMethod from "./TypedMethod";

export type TagSynonymPreview = {
  huntId: string;
  huntName: string;
  renamed: number;
  merged: number;
};

// What applying the current synonym table to existing tags would change, per
// hunt, leaving out hunts it wouldn't touch. Nothing is written.
export default new TypedMethod<void, TagSynonymPreview[]>(
  "Setup.methods.previewTagSynonyms",
);
