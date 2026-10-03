import type { Mongo } from "meteor/mongo";
import i18n from "i18next";
import { contentFromMessage } from "../lib/models/ChatMessages";
import type { GuessType } from "../lib/models/Guesses";
import Guesses from "../lib/models/Guesses";
import Puzzles from "../lib/models/Puzzles";
import { answerify } from "../model-helpers";
import GlobalHooks from "./GlobalHooks";
import { serverLanguage } from "./lang";
import sendChatMessageInternal from "./sendChatMessageInternal";

export default async function transitionGuess(
  guess: GuessType,
  newState: GuessType["state"],
  additionalNotes?: string,
  correctAnswer?: string,
) {
  if (newState === guess.state) return;

  // Marking a guess correct with changes replaces its text with the answer
  // game control accepted, so the puzzle records that rather than what was
  // typed. The original text survives in the chat message below.
  const correctedAnswer =
    newState === "correct" && correctAnswer !== undefined
      ? answerify(correctAnswer)
      : undefined;
  const withChanges =
    correctedAnswer !== undefined && correctedAnswer !== guess.guess;
  const guessText = correctedAnswer ?? guess.guess;

  const update: Mongo.Modifier<GuessType> = {
    $set: {
      state: newState,
      additionalNotes,
      ...(withChanges ? { guess: guessText } : {}),
    },
  };
  if (!additionalNotes) {
    update.$unset = {
      additionalNotes: 1,
    };
  }
  await Guesses.updateAsync(guess._id, update);

  let stateDescription;
  switch (newState) {
    case "intermediate":
      stateDescription = i18n.t(
        "puzzle.answerOrGuess.guessState.intermediate",
        "as a correct intermediate answer",
        { lng: serverLanguage },
      );
      break;
    case "correct":
      stateDescription = withChanges
        ? i18n.t(
            "puzzle.answerOrGuess.guessState.correctWithChanges",
            "as correct with changes (submitted as `{{submitted}}`)",
            {
              lng: serverLanguage,
              submitted: guess.guess,
              // Escaped once by the message below, like the guess itself
              interpolation: { escapeValue: false },
            },
          )
        : i18n.t("puzzle.answerOrGuess.guessState.correct", "as correct", {
            lng: serverLanguage,
          });
      break;
    case "incorrect":
      stateDescription = i18n.t(
        "puzzle.answerOrGuess.guessState.incorrect",
        "as incorrect",
        { lng: serverLanguage },
      );
      break;
    default:
      stateDescription = `as ${newState}`;
      break;
  }

  const message = i18n.t(
    "puzzle.answerOrGuess.guessStateChanged",
    `Guess \`{{guess}}\` was marked {{state}}{{notes}}`,
    {
      lng: serverLanguage,
      guess: guessText,
      state: stateDescription,
      notes: additionalNotes ? `: ${additionalNotes}` : "",
    },
  );
  const content = contentFromMessage(message);
  await sendChatMessageInternal({
    puzzleId: guess.puzzle,
    content,
    sender: undefined,
  });

  if (newState === "correct") {
    // Mark this puzzle as solved.
    await Puzzles.updateAsync(
      {
        _id: guess.puzzle,
      },
      {
        $addToSet: {
          answers: guessText,
        },
      },
    );
    await GlobalHooks.runPuzzleSolvedHooks(guess.puzzle, guessText);
  } else if (guess.state === "correct") {
    // Transitioning from correct -> something else. Only pull the answer
    // from the puzzle if no other correct guess for the same answer remains
    // (which can happen if duplicate guesses were created by a race).
    const otherCorrectGuess = await Guesses.findOneAsync({
      _id: { $ne: guess._id },
      hunt: guess.hunt,
      puzzle: guess.puzzle,
      guess: guess.guess,
      state: "correct",
    });

    if (!otherCorrectGuess) {
      await Puzzles.updateAsync(
        {
          _id: guess.puzzle,
        },
        {
          $pull: {
            answers: guess.guess,
          },
        },
      );
      await GlobalHooks.runPuzzleNoLongerSolvedHooks(guess.puzzle, guess.guess);
    }
  }
}
