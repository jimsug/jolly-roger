import { createContext } from "react";

export interface BoardFocus {
  // Pans the board to a comment, opens it and pulses its pin.
  focusComment: (threadId: string) => void;
}

// Lets the board's chat (a sibling of the canvas) jump to a comment.
const BoardFocusContext = createContext<BoardFocus | undefined>(undefined);

export default BoardFocusContext;
