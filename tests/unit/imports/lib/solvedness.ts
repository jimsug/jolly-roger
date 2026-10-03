import { assert } from "chai";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import { computeSolvedness } from "../../../../imports/lib/solvedness";

const puzzle = (fields: Partial<PuzzleType>): PuzzleType => ({
  _id: "puzzle",
  hunt: "hunt",
  title: "A puzzle",
  tags: [],
  answers: [],
  expectedAnswerCount: 1,
  deleted: false,
  createdAt: new Date(),
  createdBy: "user",
  updatedAt: new Date(),
  ...fields,
});

describe("computeSolvedness", function () {
  it("treats 0-answer items as administrivia unless marked complete", function () {
    assert.equal(
      computeSolvedness(puzzle({ expectedAnswerCount: 0 })),
      "noAnswers",
    );
    assert.equal(
      computeSolvedness(
        puzzle({ expectedAnswerCount: 0, completedWithNoAnswer: true }),
      ),
      "solved",
    );
  });

  it("compares answers found against the expected count", function () {
    assert.equal(
      computeSolvedness(puzzle({ expectedAnswerCount: 1 })),
      "unsolved",
    );
    assert.equal(
      computeSolvedness(puzzle({ expectedAnswerCount: 1, answers: ["FOO"] })),
      "solved",
    );
    assert.equal(
      computeSolvedness(puzzle({ expectedAnswerCount: 2, answers: ["FOO"] })),
      "unsolved",
    );
    assert.equal(
      computeSolvedness(
        puzzle({ expectedAnswerCount: 2, answers: ["FOO", "BAR", "BAZ"] }),
      ),
      "solved",
    );
  });

  it("never considers an unknown answer count solved", function () {
    assert.equal(
      computeSolvedness(puzzle({ expectedAnswerCount: -1 })),
      "unsolved",
    );
    assert.equal(
      computeSolvedness(
        puzzle({ expectedAnswerCount: -1, answers: ["FOO", "BAR"] }),
      ),
      "unsolved",
    );
  });
});
