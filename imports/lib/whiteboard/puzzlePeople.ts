// Who is on a puzzle's call, and who has it open (passive if only in hidden
// tabs), as the board's puzzle cards show them.
export interface PuzzlePeople {
  callers: string[];
  viewers: { user: string; passive: boolean }[];
}
