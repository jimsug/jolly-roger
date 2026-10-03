import { cleanup, render, screen, within } from "@testing-library/react";
import { assert } from "chai";
import type React from "react";
import {
  BreadcrumbsProvider,
  useBreadcrumb,
  useBreadcrumbItems,
} from "../../../../imports/client/hooks/breadcrumb";

const Crumb = ({
  path,
  title,
  hoverText,
}: {
  path: string;
  title: React.ReactNode;
  hoverText?: string;
}) => {
  useBreadcrumb({ path, title, hoverText });
  return null;
};

// Renders what App's navbar reads from the hook
const CrumbList = () => {
  const crumbs = useBreadcrumbItems();
  return (
    <ol>
      {crumbs.map((crumb) => (
        <li key={crumb.id} title={crumb.hoverText}>
          {crumb.title}
        </li>
      ))}
    </ol>
  );
};

describe("breadcrumb hooks", function () {
  afterEach(function () {
    cleanup();
  });

  it("publish element titles and hover text in path order", function () {
    render(
      <BreadcrumbsProvider>
        <CrumbList />
        <Crumb path="/hunts/abc" title="Some hunt" />
        <Crumb
          path="/hunts"
          title={<span data-testid="home-icon" />}
          hoverText="List of hunts"
        />
      </BreadcrumbsProvider>,
    );
    const items = screen.getAllByRole("listitem");
    assert.lengthOf(items, 2);
    assert.exists(within(items[0]!).getByTestId("home-icon"));
    assert.equal(items[0]!.getAttribute("title"), "List of hunts");
    assert.equal(items[1]!.textContent, "Some hunt");
    assert.isNull(items[1]!.getAttribute("title"));
  });

  it("republish a crumb whose hover text changes", function () {
    const { rerender } = render(
      <BreadcrumbsProvider>
        <CrumbList />
        <Crumb path="/hunts" title="Hunts" hoverText="List of hunts" />
      </BreadcrumbsProvider>,
    );
    assert.equal(
      screen.getByRole("listitem").getAttribute("title"),
      "List of hunts",
    );

    rerender(
      <BreadcrumbsProvider>
        <CrumbList />
        <Crumb path="/hunts" title="Hunts" hoverText="Every hunt" />
      </BreadcrumbsProvider>,
    );
    assert.equal(
      screen.getByRole("listitem").getAttribute("title"),
      "Every hunt",
    );
  });

  it("drop a crumb when its page unmounts", function () {
    const { rerender } = render(
      <BreadcrumbsProvider>
        <CrumbList />
        <Crumb path="/hunts" title="Hunts" />
        <Crumb path="/hunts/abc" title="Some hunt" />
      </BreadcrumbsProvider>,
    );
    assert.lengthOf(screen.getAllByRole("listitem"), 2);

    rerender(
      <BreadcrumbsProvider>
        <CrumbList />
        <Crumb path="/hunts" title="Hunts" />
      </BreadcrumbsProvider>,
    );
    assert.equal(screen.getByRole("listitem").textContent, "Hunts");
  });
});
