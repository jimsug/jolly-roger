import TypedMethod from "./TypedMethod";

// Removes one of a tag's aliases, so adding a tag by that name no longer finds
// this tag.
export default new TypedMethod<{ tagId: string; alias: string }, void>(
  "Tags.methods.removeAlias",
);
