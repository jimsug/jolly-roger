import type { PuzzleType } from "../models/Puzzles";

export default function isWhiteboardPuzzle(
  puzzle: Pick<PuzzleType, "kind"> | undefined,
): boolean {
  return puzzle?.kind === "whiteboard";
}
