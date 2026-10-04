import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { assert } from "chai";
import sinon from "sinon";
import EditableText from "../../../../imports/client/components/whiteboard/EditableText";

describe("whiteboard editable text", function () {
  afterEach(function () {
    cleanup();
  });

  const renderText = (
    onCommit: (text: string) => void,
    readOnly: boolean,
    saveOnReadOnly: boolean,
  ) => (
    <EditableText
      value="before"
      onCommit={onCommit}
      readOnly={readOnly}
      multiline={false}
      maxLength={100}
      placeholder="Label"
      saveOnReadOnly={saveOnReadOnly}
    />
  );

  const typeThenLock = (saveOnReadOnly: boolean) => {
    const onCommit = sinon.fake();
    const { rerender } = render(renderText(onCommit, false, saveOnReadOnly));
    fireEvent.doubleClick(screen.getByText("before"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "after" },
    });
    act(() => {
      rerender(renderText(onCommit, true, saveOnReadOnly));
    });
    assert.isNull(screen.queryByRole("textbox"));
    return onCommit;
  };

  it("drops what was typed when edit rights go", function () {
    const onCommit = typeThenLock(false);
    assert.isFalse(onCommit.called);
    assert.exists(screen.getByText("before"));
  });

  it("saves what was typed when only the screen narrows", function () {
    const onCommit = typeThenLock(true);
    assert.isTrue(onCommit.calledOnceWithExactly("after"));
    assert.exists(screen.getByText("after"));
  });
});
