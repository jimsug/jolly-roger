import { cleanup, render, screen } from "@testing-library/react";
import { assert } from "chai";
import { UnlinkedServicesBadge } from "../../../../imports/client/components/LinkAccountsNudge";
import unlinkedServices from "../../../../imports/lib/unlinkedServices";

const bothOn = { google: true, discord: true };
const linked = {
  googleAccount: "hunter@example.com",
  discordAccount: { id: "1", username: "hunter" },
};

describe("LinkAccountsNudge", function () {
  afterEach(function () {
    cleanup();
  });

  it("shows the badge for a user who hasn't linked Google or Discord", function () {
    render(<UnlinkedServicesBadge missing={unlinkedServices({}, bothOn)} />);
    assert.exists(screen.getByTitle("Link your accounts from My profile"));
    assert.include(
      screen.getByTitle("Link your accounts from My profile").textContent,
      "2",
    );
  });

  it("shows no badge for a user who has linked both", function () {
    const { container } = render(
      <UnlinkedServicesBadge missing={unlinkedServices(linked, bothOn)} />,
    );
    assert.equal(container.innerHTML, "");
  });
});
