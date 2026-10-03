import { answerify } from "../model-helpers";

const withoutSpacing = (answer: string) =>
  answerify(answer.replaceAll(/\s/g, ""));

// The correction to send when an operator marks a guess correct with an
// edited answer, or undefined when the edit is blank or matches the guess
// apart from letter case, so the guess is marked correct as it stands. A
// correction that changes more than the spacing is flagged, since the toast
// asks for it to be submitted twice.
export default function correctedAnswer(
  edit: string,
  guess: string,
): { answer: string; changesMoreThanSpacing: boolean } | undefined {
  const answer = edit.trim();
  if (answer === "" || answerify(answer) === guess) {
    return undefined;
  }
  return {
    answer,
    changesMoreThanSpacing: withoutSpacing(answer) !== withoutSpacing(guess),
  };
}
