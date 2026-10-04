import { createContext } from "react";
import type { RoundState } from "../../../lib/whiteboard/rounds";

// Every frame's round state, worked out once for the board by the canvas
// (see useRoundStates). A frame missing from it shows no count.
const RoundStateContext = createContext<ReadonlyMap<string, RoundState>>(
  new Map(),
);

export default RoundStateContext;
