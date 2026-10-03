import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    hunt: string;
    puzzle: string;
    // Only notifications created up to this point are dismissed, so a ding
    // that arrives while the request is in flight still gets seen. Send the
    // newest createdAt the client holds for the puzzle (the server's clock),
    // not the client's own clock.
    dismissUntil: Date;
  },
  void
>("ChatNotifications.methods.dismissForPuzzle");
