import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { assert } from "chai";
import { ThemeProvider } from "styled-components";
import PuzzleModalForm from "../../../../imports/client/components/PuzzleModalForm";
import { lightTheme } from "../../../../imports/client/theme";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";

const puzzle: PuzzleType = {
  _id: "puzzle",
  hunt: "hunt",
  title: "Crossword",
  url: "https://example.com/puzzles/crossword",
  tags: [],
  answers: [],
  expectedAnswerCount: 1,
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
};

const renderForm = async (editing?: PuzzleType) => {
  render(
    <ThemeProvider theme={lightTheme}>
      <PuzzleModalForm
        huntId="hunt"
        puzzle={editing}
        tags={[]}
        onSubmit={() => undefined}
        showOnMount
        ref={null}
      />
    </ThemeProvider>,
  );
  const title = (await screen.findByLabelText("Title", undefined, {
    timeout: 5000,
  })) as HTMLInputElement;
  const url = screen.getByLabelText("URL") as HTMLInputElement;
  const changeUrl = (value: string) =>
    fireEvent.change(url, { target: { value } });
  return { title, changeUrl };
};

describe("PuzzleModalForm", function () {
  this.timeout(10000);

  afterEach(function () {
    cleanup();
  });

  it("guesses the title from the URL when adding a puzzle", async function () {
    const { title, changeUrl } = await renderForm();
    changeUrl("https://example.com/puzzles/word-search");
    assert.equal(title.value, "Word Search");
    // A guess gives way to the next one
    changeUrl("https://example.com/puzzles/fill_in.html");
    assert.equal(title.value, "Fill In");
    // A typed title doesn't
    fireEvent.change(title, { target: { value: "My title" } });
    changeUrl("https://example.com/puzzles/sudoku");
    assert.equal(title.value, "My title");
  });

  it("keeps a puzzle's title when its URL is edited", async function () {
    const { title, changeUrl } = await renderForm(puzzle);
    assert.equal(title.value, "Crossword");
    // Even though the title is what the old URL would have guessed
    changeUrl("https://example.com/puzzles/word-search");
    assert.equal(title.value, "Crossword");
  });

  it("fills in an emptied title when a puzzle's URL is edited", async function () {
    const { title, changeUrl } = await renderForm(puzzle);
    fireEvent.change(title, { target: { value: "" } });
    changeUrl("https://example.com/puzzles/word-search");
    assert.equal(title.value, "Word Search");
  });

  it("lists a bare stuck tag with the functional tags", async function () {
    await renderForm();
    const content = screen.getByLabelText("Content tags");
    const functional = screen.getByLabelText("Functional tags");
    fireEvent.change(content, { target: { value: "stuck" } });
    fireEvent.keyDown(content, { key: "Enter", code: "Enter", keyCode: 13 });

    // The select itself, not the help text under it
    const box = (input: HTMLElement) =>
      input.closest<HTMLElement>("div[class*='-container']")!;
    assert.isNotNull(
      await within(box(functional)).findByText("stuck", undefined, {
        timeout: 5000,
      }),
    );
    assert.isNull(within(box(content)).queryByText("stuck"));
  });
});
