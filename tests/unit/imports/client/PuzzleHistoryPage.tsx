import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";
import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter } from "react-router";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import ContributionGraph from "../../../../imports/client/components/ContributionGraph";
import PuzzleHistoryPage from "../../../../imports/client/components/PuzzleHistoryPage";
import { lightTheme } from "../../../../imports/client/theme";
import puzzleHistorySummaryForUser from "../../../../imports/lib/publications/puzzleHistorySummaryForUser";

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

describe("PuzzleHistoryPage", function () {
  afterEach(function () {
    cleanup();
    sinon.restore();
  });

  it("stops rendering once its subscriptions are ready", async function () {
    sinon.stub(Meteor, "userId").returns("historyUser");
    // Subscriptions that come ready after the first render, as real ones do
    let ready = false;
    const readyDep = new Tracker.Dependency();
    const subscribe = sinon.stub(Meteor, "subscribe").callsFake(() => ({
      ready: () => {
        readyDep.depend();
        return ready;
      },
      stop: () => undefined,
    }));
    // The history table subscribes afresh each time it renders
    const tableRenders = () =>
      subscribe
        .getCalls()
        .filter((call) => call.args[0] === puzzleHistorySummaryForUser.name)
        .length;

    render(
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter>
          <PuzzleHistoryPage />
        </MemoryRouter>
      </ThemeProvider>,
    );
    ready = true;
    readyDep.changed();
    await screen.findByText("No puzzle history matches your filters.");
    await wait(100);

    const settled = tableRenders();
    await wait(500);
    assert.equal(tableRenders(), settled, "the table kept rendering");
  });
});

describe("ContributionGraph", function () {
  afterEach(function () {
    cleanup();
  });

  // Positioned anywhere else, they'd stretch the page past a phone's width
  it("positions its cells' hidden labels inside its own scroll area", function () {
    const { container } = render(
      <ThemeProvider theme={lightTheme}>
        <ContributionGraph data={[]} />
      </ThemeProvider>,
    );
    const label = container.querySelector<HTMLElement>(".visually-hidden");
    assert.exists(label);
    assert.strictEqual(label?.offsetParent, container.firstElementChild);
  });
});
