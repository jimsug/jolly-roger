import type {
  PresenceStatus,
  PuzzleStatusSource,
  UserStatusKind,
} from "../lib/models/UserStatuses";
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    hunt: string;
    type: UserStatusKind;
    status: PresenceStatus | PuzzleStatusSource;
    puzzle?: string;
  },
  void
>("UserStatus.methods.setStatus");
