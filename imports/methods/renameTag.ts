import TypedMethod from "./TypedMethod";

// Renames a tag. If another tag in the hunt already has the new name (or has it
// as an alias), the two are merged into that tag instead. With
// keepOldNameAsAlias, the old name is kept as an alias so it keeps resolving to
// the surviving tag.
export default new TypedMethod<
  { tagId: string; name: string; keepOldNameAsAlias: boolean },
  void
>("Tags.methods.rename");
