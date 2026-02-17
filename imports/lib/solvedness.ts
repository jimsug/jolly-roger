import type { PuzzleType } from "./models/Puzzles";

export type Solvedness = "noAnswers" | "solved" | "unsolved";
export const computeSolvedness = (puzzle: PuzzleType): Solvedness => {
  if (puzzle.expectedAnswerCount === 0) {
    if (puzzle.completedWithNoAnswer && puzzle.markedComplete) {
      return "solved";
    } else if (puzzle.completedWithNoAnswer && !puzzle.markedComplete) {
      return "unsolved";
    } else {
      return "noAnswers";
    }
  }

  if (
    puzzle.markedComplete ||
    (puzzle.expectedAnswerCount !== -1 &&
      puzzle.answers.length >= puzzle.expectedAnswerCount)
  ) {
    return "solved";
  }

  return "unsolved";
};
