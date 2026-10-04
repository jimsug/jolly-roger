import { createContext } from "react";

// Whether the chat of the puzzle page showing some content (the board, on the
// whiteboard page) has loaded. The board's comments are in that chat.
const ChatLoadedContext = createContext(false);

export default ChatLoadedContext;
