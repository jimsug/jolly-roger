import type { GuessType } from "./models/Guesses";

// The states the guess queue lets you hide. Pending guesses are always
// listed: the queue exists to get them looked at.
export const GUESS_QUEUE_FILTERABLE_STATES = [
  "correct",
  "intermediate",
  "incorrect",
  "rejected",
] as const satisfies readonly GuessType["state"][];

export type GuessQueueFilterableState =
  (typeof GUESS_QUEUE_FILTERABLE_STATES)[number];

export default function guessShownInQueue(
  guess: Pick<GuessType, "state">,
  shownStates: readonly GuessQueueFilterableState[],
): boolean {
  return (
    guess.state === "pending" ||
    shownStates.some((state) => state === guess.state)
  );
}
