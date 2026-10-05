import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import { ThemeProvider } from "styled-components";
import ColorPicker from "../../../../imports/client/components/whiteboard/ColorPicker";
import colors from "../../../../imports/client/components/whiteboard/colors";
import { lightTheme } from "../../../../imports/client/theme";

describe("whiteboard colour picker", function () {
  afterEach(function () {
    cleanup();
  });

  const renderPicker = (props: Partial<Parameters<typeof ColorPicker>[0]>) =>
    render(
      <ThemeProvider theme={lightTheme}>
        <ColorPicker
          value={undefined}
          palette={colors.fill}
          onChange={sinon.fake()}
          {...props}
        />
      </ThemeProvider>,
    );

  it("has no No fill swatch unless it can clear", function () {
    renderPicker({ value: "blue" });
    assert.isNull(screen.queryByRole("button", { name: "No fill" }));
    assert.equal(
      screen.getByRole("button", { name: "Blue" }).getAttribute("aria-pressed"),
      "true",
    );
  });

  it("offers No fill, picked while there's no colour", function () {
    const onChange = sinon.fake();
    const onClear = sinon.fake();
    const { rerender } = renderPicker({ value: "blue", onChange, onClear });
    const none = screen.getByRole("button", { name: "No fill" });
    assert.equal(none.getAttribute("aria-pressed"), "false");
    fireEvent.click(none);
    assert.isTrue(onClear.calledOnce);
    assert.isTrue(onChange.notCalled);

    rerender(
      <ThemeProvider theme={lightTheme}>
        <ColorPicker
          value={undefined}
          palette={colors.fill}
          onChange={onChange}
          onClear={onClear}
        />
      </ThemeProvider>,
    );
    assert.equal(
      screen
        .getByRole("button", { name: "No fill" })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      screen.getByRole("button", { name: "Blue" }).getAttribute("aria-pressed"),
      "false",
    );
  });
});
