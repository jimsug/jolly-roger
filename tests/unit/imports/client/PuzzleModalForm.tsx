import { Meteor } from "meteor/meteor";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { assert } from "chai";
import { ThemeProvider } from "styled-components";
import type { PuzzleModalFormSubmitPayload } from "../../../../imports/client/components/PuzzleModalForm";
import PuzzleModalForm from "../../../../imports/client/components/PuzzleModalForm";
import { lightTheme } from "../../../../imports/client/theme";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";

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

const tag = (_id: string, name: string, aliases?: string[]): TagType => ({
  _id,
  hunt: "hunt",
  name,
  aliases,
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
});

const renderForm = async (
  editing?: PuzzleType,
  {
    tags = [],
    onSubmit = () => undefined,
  }: {
    tags?: TagType[];
    onSubmit?: (
      payload: PuzzleModalFormSubmitPayload,
      callback: (error?: Error) => void,
    ) => void;
  } = {},
) => {
  const form = (shown?: PuzzleType) => (
    <ThemeProvider theme={lightTheme}>
      <PuzzleModalForm
        huntId="hunt"
        puzzle={shown}
        tags={tags}
        onSubmit={onSubmit}
        showOnMount
        ref={null}
      />
    </ThemeProvider>
  );
  const { rerender } = render(form(editing));
  // Shows the puzzle as it is now, as when someone else changes it
  const updatePuzzle = (updated: PuzzleType) => rerender(form(updated));
  const title = (await screen.findByLabelText("Title", undefined, {
    timeout: 5000,
  })) as HTMLInputElement;
  const url = screen.getByLabelText("URL") as HTMLInputElement;
  const changeUrl = (value: string) =>
    fireEvent.change(url, { target: { value } });
  return { title, changeUrl, updatePuzzle };
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

  describe("recent tags", function () {
    const RECENT_KEY = "huntRecentTags";
    const huntTags = [
      tag("atrium", "where:atrium"),
      tag("cryptic", "cryptic", ["cryptics"]),
      tag("events", "group:events"),
      tag("stuck", "is:stuck"),
    ];
    const remember = (names: string[]) =>
      localStorage.setItem(RECENT_KEY, JSON.stringify({ hunt: names }));
    const remembered = (): string[] | undefined =>
      (
        JSON.parse(localStorage.getItem(RECENT_KEY) ?? "{}") as Record<
          string,
          string[]
        >
      ).hunt;
    const recentRow = () => screen.queryByRole("group", { name: "Recent:" });
    const offered = () =>
      within(screen.getByRole("group", { name: "Recent:" }))
        .getAllByRole("button")
        .map((button) => button.textContent);
    const save = () =>
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const addContentTag = (name: string) => {
      const content = screen.getByLabelText("Content tags");
      fireEvent.change(content, { target: { value: name } });
      fireEvent.keyDown(content, { key: "Enter", code: "Enter", keyCode: 13 });
    };
    const shownTags = (label: string) => {
      const box = screen
        .getByLabelText(label)
        .closest<HTMLElement>("div[class*='-container']");
      assert.exists(box);
      return box;
    };

    beforeEach(function () {
      localStorage.removeItem(RECENT_KEY);
    });

    afterEach(function () {
      localStorage.removeItem(RECENT_KEY);
    });

    it("shows no row when nothing is remembered", async function () {
      await renderForm(undefined, { tags: huntTags });
      assert.isNull(recentRow());
    });

    it("offers remembered tags by canonical name, without ones already on the puzzle", async function () {
      remember(["loc:atrium", "cryptic", "gone", "group:events"]);
      await renderForm({ ...puzzle, tags: ["cryptic"] }, { tags: huntTags });
      assert.deepEqual(offered(), ["+where:atrium", "+group:events"]);
    });

    it("adds a tag when it's clicked", async function () {
      remember(["group:events", "cryptic"]);
      await renderForm(undefined, { tags: huntTags });
      fireEvent.click(screen.getByRole("button", { name: "+group:events" }));
      assert.exists(
        within(shownTags("Functional tags")).getByText("group:events"),
      );
      assert.deepEqual(offered(), ["+cryptic"]);
    });

    it("adds a tag still under a synonym by the name the pickers list", async function () {
      remember(["where:basement"]);
      await renderForm(undefined, {
        tags: [...huntTags, tag("basement", "loc:basement")],
      });
      fireEvent.click(screen.getByRole("button", { name: "+where:basement" }));
      const functional = shownTags("Functional tags");
      assert.exists(within(functional).getByText("loc:basement"));
      assert.isNull(within(functional).queryByText("where:basement"));
      assert.isNull(recentRow());
    });

    it("remembers a new puzzle's tags by canonical name", async function () {
      remember(["group:events"]);
      let submitted: string[] = [];
      await renderForm(undefined, {
        tags: huntTags,
        onSubmit: (payload, callback) => {
          submitted = payload.tags;
          callback();
        },
      });
      addContentTag("cryptics");
      addContentTag("stuck");
      save();
      assert.deepEqual(submitted, ["cryptics", "stuck"]);
      assert.deepEqual(remembered(), ["cryptic", "is:stuck", "group:events"]);
    });

    it("remembers nothing when the save fails", async function () {
      await renderForm(undefined, {
        tags: huntTags,
        onSubmit: (_payload, callback) =>
          callback(new Meteor.Error(409, "Duplicate URL")),
      });
      addContentTag("cryptic");
      save();
      assert.isUndefined(remembered());
    });

    it("remembers only the tags an edit adds", async function () {
      await renderForm(
        { ...puzzle, tags: ["cryptic"] },
        { tags: huntTags, onSubmit: (_payload, callback) => callback() },
      );
      save();
      assert.isUndefined(remembered());

      cleanup();
      await renderForm(
        { ...puzzle, tags: ["cryptic"] },
        { tags: huntTags, onSubmit: (_payload, callback) => callback() },
      );
      addContentTag("loc:atrium");
      save();
      assert.deepEqual(remembered(), ["where:atrium"]);
    });

    it("remembers nothing from an edit that leaves the tags alone", async function () {
      const { title, updatePuzzle } = await renderForm(
        { ...puzzle, tags: ["cryptic", "stuck"] },
        { tags: huntTags, onSubmit: (_payload, callback) => callback() },
      );
      // Someone else takes a tag off after the form opened
      updatePuzzle({ ...puzzle, tags: ["cryptic"] });
      fireEvent.change(title, { target: { value: "Renamed" } });
      save();
      assert.isUndefined(remembered());
    });
  });
});
