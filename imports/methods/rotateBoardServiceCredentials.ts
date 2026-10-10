import type { BoardServiceCredentials } from "./configureBoardService";
import TypedMethod from "./TypedMethod";

// Gives the board service's account a new password and hands it back once
export default new TypedMethod<void, BoardServiceCredentials>(
  "Setup.methods.rotateBoardServiceCredentials",
);
