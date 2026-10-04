import React from "react";
import PuzzleAnswer from "./PuzzleAnswer";

// A puzzle's answers, comma separated.
const PuzzleAnswers = ({ answers }: { answers: readonly string[] }) => (
  <>
    {answers.map((answer, i) => (
      <React.Fragment key={answer}>
        {i > 0 && ", "}
        <PuzzleAnswer answer={answer} />
      </React.Fragment>
    ))}
  </>
);

export default PuzzleAnswers;
