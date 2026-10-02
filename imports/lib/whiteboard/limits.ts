// Shared between the client (to avoid sending things the server will reject)
// and the server (which enforces them).
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
// On-board size of a line's free end.
export const POINT_SIZE = 12;
