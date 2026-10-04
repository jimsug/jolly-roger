import { createContext } from "react";
import type { PuzzleViewers } from "../../../lib/puzzleViewers";

// Who is on each puzzle's call or has it open, keyed by puzzle id, worked out
// once for the board by the canvas's PuzzlePeopleProvider (see
// usePuzzleViewers) the way the puzzle list works it out, so a card shows the
// people its list row does.
const PeopleContext = createContext<Record<string, PuzzleViewers> | undefined>(
  undefined,
);

export default PeopleContext;
