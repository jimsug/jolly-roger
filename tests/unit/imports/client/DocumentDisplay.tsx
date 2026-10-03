import type { Meteor } from "meteor/meteor";
import { cleanup, render } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import DocumentDisplay from "../../../../imports/client/components/DocumentDisplay";
import { lightTheme } from "../../../../imports/client/theme";
import type { DocumentType } from "../../../../imports/lib/models/Documents";

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
});
