import { createContext } from "react";
import type { PuzzlePeople } from "../../../lib/whiteboard/puzzlePeople";

// Who is on each puzzle's call or has it open, for the board's cards.
const PeopleContext = createContext<Map<string, PuzzlePeople>>(new Map());

export default PeopleContext;
