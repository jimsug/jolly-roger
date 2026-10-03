import type { PuzzleType } from "./models/Puzzles";

export type Solvedness = "noAnswers" | "solved" | "unsolved";
export const computeSolvedness = (
  puzzle: Pick<
    PuzzleType,
    "answers" | "expectedAnswerCount" | "completedWithNoAnswer"
  >,
): Solvedness => {
  if (puzzle.expectedAnswerCount === 0) {
    return puzzle.completedWithNoAnswer ? "solved" : "noAnswers";
  } else if (puzzle.expectedAnswerCount < 0) {
    // Nobody knows how many answers there are, so it can't be known to be done
    return "unsolved";
  } else if (puzzle.answers.length < puzzle.expectedAnswerCount) {
    return "unsolved";
  } else {
    return "solved";
  }
};
