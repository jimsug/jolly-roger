import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import {
  GUESS_CONFIDENCE_LEVELS,
  GUESS_DIRECTION_LEVELS,
  GuessConfidenceBadge,
  GuessDirectionBadge,
  guessConfidenceLevel,
  guessDirectionLevel,
} from "../../../../imports/client/components/guessDetails";

describe("guess detail badges", function () {
  afterEach(function () {
    cleanup();
  });

  it("sort a stored direction into five levels", function () {
    assert.equal(guessDirectionLevel(10), "forward");
    assert.equal(guessDirectionLevel(6), "forward");
    assert.equal(guessDirectionLevel(5), "mostlyForward");
    assert.equal(guessDirectionLevel(1), "mostlyForward");
    assert.equal(guessDirectionLevel(0), "mixed");
    assert.equal(guessDirectionLevel(-1), "mostlyBack");
    assert.equal(guessDirectionLevel(-5), "mostlyBack");
    assert.equal(guessDirectionLevel(-6), "back");
    assert.equal(guessDirectionLevel(-10), "back");
  });

  it("read an unset direction as mixed", function () {
    assert.equal(guessDirectionLevel(undefined), "mixed");
  });

  it("sort a stored confidence into three levels", function () {
    assert.equal(guessConfidenceLevel(100), "high");
    assert.equal(guessConfidenceLevel(51), "high");
    assert.equal(guessConfidenceLevel(50), "medium");
    assert.equal(guessConfidenceLevel(49), "low");
    assert.equal(guessConfidenceLevel(0), "low");
  });

  it("read an unset confidence as medium", function () {
    assert.equal(guessConfidenceLevel(undefined), "medium");
  });

  it("list each level in the guess modal's order, at a value that reads as it", function () {
    assert.deepEqual(
      GUESS_DIRECTION_LEVELS.map(({ value }) => value),
      [-10, -5, 0, 5, 10],
    );
    GUESS_DIRECTION_LEVELS.forEach(({ level, value }) => {
      assert.equal(guessDirectionLevel(value), level);
    });
    assert.deepEqual(
      GUESS_CONFIDENCE_LEVELS.map(({ value }) => value),
      [0, 50, 100],
    );
    GUESS_CONFIDENCE_LEVELS.forEach(({ level, value }) => {
      assert.equal(guessConfidenceLevel(value), level);
    });
  });

  it("render each level with its own colour", function () {
    render(
      <>
        <GuessDirectionBadge value={3} />
        <GuessDirectionBadge value={-10} />
        <GuessConfidenceBadge value={20} />
        <GuessConfidenceBadge value={50} />
      </>,
    );
    assert.include(screen.getByText("Forward*").className, "bg-primary");
    assert.include(screen.getByText("Back").className, "bg-danger");
    assert.include(screen.getByText("Low").className, "bg-danger");
    assert.include(screen.getByText("Medium").className, "bg-warning");
    // White on yellow is too faint to read
    assert.include(screen.getByText("Medium").className, "text-dark");
  });

  it("keep the exact value in the tooltip", function () {
    render(
      <>
        <GuessDirectionBadge value={7} />
        <GuessConfidenceBadge value={80} />
      </>,
    );
    assert.equal(
      screen.getByText("Forward").getAttribute("title"),
      "Solve direction: Forward 7",
    );
    assert.equal(
      screen.getByText("High").getAttribute("title"),
      "Confidence: 80%",
    );
  });
});
