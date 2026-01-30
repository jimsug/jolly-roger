import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzle: string;
    hunt: string;
    dismissUntil: Date;
  },
  void
>("Users.methods.dismissDingsForPuzzle");
