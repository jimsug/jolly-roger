import type { Meteor } from "meteor/meteor";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter } from "react-router";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import DocumentDisplay from "../../../../imports/client/components/DocumentDisplay";
import { lightTheme } from "../../../../imports/client/theme";
import type { DocumentType } from "../../../../imports/lib/models/Documents";
import boardToken from "../../../../imports/methods/boardToken";

const spreadsheet: DocumentType = {
  _id: "document",
  hunt: "hunt",
  puzzle: "puzzle",
  provider: "google",
  value: { type: "spreadsheet", id: "sheet" },
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
};

// A board on a service that isn't there; the iframe never loads, which is
// fine for what these tests look at
const BOARD_ORIGIN = "https://board.invalid";
const board: DocumentType = {
  _id: "board",
  hunt: "hunt",
  provider: "board",
  value: { id: "b1", url: `${BOARD_ORIGIN}/boards/b1` },
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
};

const user: Meteor.User = { _id: "user" };

describe("DocumentDisplay", function () {
  afterEach(function () {
    cleanup();
    sinon.restore();
  });

  it("doesn't watch for Sheets taking focus when it only links to a spreadsheet", function () {
    const requestAnimationFrame = sinon.stub(window, "requestAnimationFrame");
    render(
      <ThemeProvider theme={lightTheme}>
        <DocumentDisplay
          document={spreadsheet}
          displayMode="link"
          user={user}
        />
      </ThemeProvider>,
    );
    assert.isTrue(requestAnimationFrame.notCalled);
  });

  describe("board", function () {
    const renderBoard = (
      displayMode: "link" | "embed",
      path = "/hunts/hunt/board",
    ) =>
      render(
        <ThemeProvider theme={lightTheme}>
          <MemoryRouter initialEntries={[path]}>
            <DocumentDisplay
              document={board}
              displayMode={displayMode}
              user={user}
            />
          </MemoryRouter>
        </ThemeProvider>,
      );

    const iframeSrc = async () => {
      const iframe = await screen.findByTitle("Board");
      return new URL(iframe.getAttribute("src")!);
    };

    const askForToken = (origin: string) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { t: "token" },
          origin,
          source: window,
        }),
      );

    it("links to the board page without minting a token", function () {
      const mint = sinon.stub(boardToken, "callPromise");
      renderBoard("link");
      const link = screen.getByRole("link", { name: "Board" });
      assert.equal(link.getAttribute("href"), "/hunts/hunt/board");
      assert.isTrue(mint.notCalled);
    });

    it("embeds the board with a token for the hunt, passing on what the page's URL asks to show", async function () {
      const mint = sinon.stub(boardToken, "callPromise").resolves("tok1");
      renderBoard("embed", "/hunts/hunt/board?comment=c1&node=n1&other=x");
      const src = await iframeSrc();
      assert.equal(src.origin, BOARD_ORIGIN);
      assert.equal(src.pathname, "/boards/b1");
      assert.equal(src.searchParams.get("token"), "tok1");
      assert.equal(src.searchParams.get("comment"), "c1");
      assert.equal(src.searchParams.get("node"), "n1");
      assert.isNull(src.searchParams.get("other"));
      assert.deepEqual(mint.firstCall.args, [{ huntId: "hunt" }]);
    });

    it("answers the board's request for a fresh token at its own origin, without reloading it", async function () {
      const mint = sinon.stub(boardToken, "callPromise");
      mint.onFirstCall().resolves("tok1");
      mint.onSecondCall().resolves("tok2");
      const postMessage = sinon.stub(window, "postMessage");
      renderBoard("embed");
      await iframeSrc();

      askForToken(BOARD_ORIGIN);
      await waitFor(() => assert.isTrue(postMessage.calledOnce));
      assert.deepEqual(postMessage.firstCall.args as unknown[], [
        { t: "token", token: "tok2" },
        BOARD_ORIGIN,
      ]);
      assert.equal((await iframeSrc()).searchParams.get("token"), "tok1");
    });

    it("ignores a request from any other origin, and messages that aren't for it", async function () {
      const mint = sinon.stub(boardToken, "callPromise").resolves("tok1");
      const postMessage = sinon.stub(window, "postMessage");
      renderBoard("embed");
      await iframeSrc();

      askForToken("https://elsewhere.invalid");
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { t: "hello" },
          origin: BOARD_ORIGIN,
          source: window,
        }),
      );
      // Give a reply that shouldn't come a chance to turn up
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      assert.isTrue(postMessage.notCalled);
      assert.isTrue(mint.calledOnce);
    });

    it("says why when no token can be had", async function () {
      sinon
        .stub(boardToken, "callPromise")
        .rejects(Object.assign(new Error("x"), { reason: "Not a member" }));
      renderBoard("embed");
      await screen.findByText(/Couldn't open the board: Not a member/);
      assert.isNull(screen.queryByTitle("Board"));
    });
  });
});
