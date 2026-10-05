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
// How many selected nodes a live update can show to others.
export const MAX_LIVE_SELECTION = 50;
// How deep frames can nest. A longer chain of parents is taken to be a loop
// (which frames moved into each other at the same time can briefly make), so
// nothing that walks up one can hang.
export const MAX_FRAME_DEPTH = 64;
// How many people a board's edit policy can name.
export const MAX_WHITEBOARD_EDITORS = 500;

// Board history (see versions.ts). A version is a snapshot of the board taken
// just before an edit. A person's edits within VERSION_INTERVAL_MS of their
// first one share a version, as do the edits of anyone who joins in within
// VERSION_JOIN_MS of it starting.
export const VERSION_INTERVAL_MS = 10 * 60 * 1000;
export const VERSION_JOIN_MS = 60 * 1000;
// Every version this new is kept; older ones thin to one an hour.
export const VERSION_KEEP_ALL_MS = 2 * 60 * 60 * 1000;
// A version's compressed payload is stored, and fetched, in pieces this big.
export const VERSION_CHUNK_BYTES = 4 * 1024 * 1024;
// The most a board's history can take up, compressed. The oldest versions go
// first, but never the newest.
export const MAX_VERSION_BYTES_PER_BOARD = 256 * 1024 * 1024;
// Once a hunt is archived, or a board has gone this long without a new
// version, its history thins to the newest VERSION_KEEP_AFTER_HUNT versions
// plus every reset and restore.
export const VERSION_IDLE_MS = 14 * 24 * 60 * 60 * 1000;
export const VERSION_KEEP_AFTER_HUNT = 10;
