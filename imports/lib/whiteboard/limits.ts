// The server enforces these. The client keeps to the ones it can (batch
// sizes, text and label lengths, ink segments, live drags) so it doesn't send
// what would be refused.
export const MAX_BATCH = 100;
export const MAX_NODES_PER_BOARD = 5000;
export const MAX_EDGES_PER_BOARD = 3000;
export const MAX_TEXT_LENGTH = 2000;
export const MAX_LABEL_LENGTH = 200;
export const MAX_INK_POINTS = 500;
export const MAX_COORDINATE = 1_000_000;
export const MAX_DIMENSION = 100_000;
export const MAX_CONTRIBUTORS = 50;
export const MAX_LIVE_DRAG_NODES = 50;
// How deep frames can nest. A longer chain of parents is taken to be a loop
// (which frames moved into each other at the same time can briefly make), so
// nothing that walks up one can hang.
export const MAX_FRAME_DEPTH = 64;
// How many people a board's edit policy can name.
export const MAX_WHITEBOARD_EDITORS = 500;
