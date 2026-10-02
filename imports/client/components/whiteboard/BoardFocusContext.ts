import { createContext } from "react";

export interface BoardFocus {
  // Pans the board to a comment, opens it and pulses its pin. Returns false
  // if the comment isn't on the board.
  focusComment: (threadId: string) => boolean;
}

// Lets the board's chat (a sibling of the canvas) jump to a comment.
const BoardFocusContext = createContext<BoardFocus | undefined>(undefined);

export default BoardFocusContext;
