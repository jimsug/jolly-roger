import { assert } from "chai";
import { calendarTimeFormat } from "../../../../imports/lib/calendarTimeFormat";

describe("calendarTimeFormat", function () {
  const todayFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const thisWeekFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  const defaultFormatter = new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  it("formats dates today correctly", function () {
    const now = new Date(2021, 7, 6, 19, 26);
    const d1 = now;
    assert.equal(
      calendarTimeFormat(d1, now),
      `Today at ${todayFormatter.format(d1)}`,
    );

    const d2 = new Date(2021, 7, 6, 11, 10);
    assert.equal(
      calendarTimeFormat(d2, now),
      `Today at ${todayFormatter.format(d2)}`,
    );

    const d3 = new Date(2021, 7, 6, 22, 50);
    assert.equal(
      calendarTimeFormat(d3, now),
      `Today at ${todayFormatter.format(d3)}`,
    );
  });

  it("formats dates from the last week correctly", function () {
    const now = new Date(2021, 7, 6, 19, 26);
    const d1 = new Date(2021, 7, 4, 10, 5);
    assert.equal(calendarTimeFormat(d1, now), thisWeekFormatter.format(d1));
  });

  it("formats dates from more than a week ago long-format", function () {
    const now = new Date(2021, 7, 6, 19, 26);
    const d1 = new Date(2021, 6, 20, 15, 25);
    assert.equal(calendarTimeFormat(d1, now), defaultFormatter.format(d1));

    // including the boundary condition, which is a bit odd but ok
    const d2 = new Date(2021, 6, 31, 9, 40);
    assert.equal(calendarTimeFormat(d2, now), defaultFormatter.format(d2));
  });

  it("formats future dates in long-format", function () {
    const now = new Date(2021, 7, 6, 19, 26);
    const d1 = new Date(2021, 7, 7, 2, 27);
    assert.equal(calendarTimeFormat(d1, now), defaultFormatter.format(d1));

    const d2 = new Date(2022, 0, 15, 16, 2);
    assert.equal(calendarTimeFormat(d2, now), defaultFormatter.format(d2));
  });
});
