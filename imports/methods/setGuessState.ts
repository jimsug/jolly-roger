import type { GuessType } from "../lib/models/Guesses";
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    guessId: string;
    state: GuessType["state"];
    additionalNotes?: string;
    // Only with state "correct": the answer as HQ actually accepted it, when
    // it differs from what was submitted.
    correctAnswer?: string;
  },
  void
>("Guesses.methods.setState");
