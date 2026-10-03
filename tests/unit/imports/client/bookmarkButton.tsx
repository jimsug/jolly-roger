import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { ThemeProvider } from "styled-components";
import BookmarkButton from "../../../../imports/client/components/BookmarkButton";
import { lightTheme } from "../../../../imports/client/theme";

const renderButton = (bookmarked: boolean) =>
  render(
    <ThemeProvider theme={lightTheme}>
      <BookmarkButton puzzleId="puzzle" bookmarked={bookmarked} />
    </ThemeProvider>,
  );

describe("BookmarkButton", function () {
  afterEach(function () {
    cleanup();
  });

  it("shows an outlined bookmark in the text colour until bookmarked", function () {
    renderButton(false);
    const icon = screen.getByTitle("Bookmark puzzle").querySelector("svg");
    assert.equal(icon?.dataset.icon, "bookmark");
    assert.equal(icon?.dataset.prefix, "far");
    assert.equal(icon?.getAttribute("color"), lightTheme.colors.text);
  });

  it("shows a solid bookmark in the bookmarked colour once bookmarked", function () {
    renderButton(true);
    const icon = screen.getByTitle("Unbookmark puzzle").querySelector("svg");
    assert.equal(icon?.dataset.icon, "bookmark");
    assert.equal(icon?.dataset.prefix, "fas");
    assert.equal(icon?.getAttribute("color"), lightTheme.colors.bookmarkedIcon);
  });
});
