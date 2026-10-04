import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "styled-components";
import RelatedPuzzleGroup from "../../../../imports/client/components/RelatedPuzzleGroup";
import { lightTheme } from "../../../../imports/client/theme";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";

const HUNT_ID = "relatedPuzzleGroupHunt";
const VIEW_KEY = "puzzleListView";

const tag: TagType = {
  _id: "groupTag",
  hunt: HUNT_ID,
  name: "group:events",
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
};

const puzzle = (id: string, answers: string[]): PuzzleType => ({
  _id: id,
  hunt: HUNT_ID,
  title: id,
  tags: [tag._id],
  answers,
  expectedAnswerCount: 1,
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
});

const renderGroup = (puzzles: PuzzleType[]) =>
  render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter>
        <RelatedPuzzleGroup
          huntId={HUNT_ID}
          group={{ sharedTag: tag, puzzles, subgroups: [] }}
          bookmarked={new Set()}
          allTags={[tag]}
          canUpdate={false}
          suppressedTagIds={[]}
          trackPersistentExpand
        />
      </MemoryRouter>
    </ThemeProvider>,
  );

describe("RelatedPuzzleGroup", function () {
  beforeEach(function () {
    // Collapsed, so only the header renders
    localStorage.setItem(
      VIEW_KEY,
      JSON.stringify({
        [HUNT_ID]: {
          displayMode: "group",
          showSolved: true,
          collapseGroups: { [tag._id]: true },
        },
      }),
    );
  });

  afterEach(function () {
    cleanup();
    localStorage.removeItem(VIEW_KEY);
  });

  it("counts unsolved puzzles in a mostly solved group", function () {
    renderGroup([
      puzzle("one", ["A"]),
      puzzle("two", ["B"]),
      puzzle("three", ["C"]),
      puzzle("four", []),
    ]);
    assert.exists(screen.getByText("1 of 4 puzzles unsolved"));
  });

  it("counts a fully solved group too", function () {
    renderGroup([puzzle("one", ["A"]), puzzle("two", ["B"])]);
    assert.exists(screen.getByText("0 of 2 puzzles unsolved"));
  });

  it("leaves the count off a group with nothing to solve", function () {
    renderGroup([{ ...puzzle("notes", []), expectedAnswerCount: 0 }]);
    assert.isNull(screen.queryByText(/puzzles unsolved/));
  });
});
