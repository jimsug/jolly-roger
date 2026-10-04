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

  type OnCommit = (text: string, onSaved: (refused: boolean) => void) => void;

  const renderText = (
    onCommit: OnCommit,
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

  it("keeps what was typed, unsaved, when edit rights go", function () {
    const onCommit = typeThenLock(false);
    assert.isFalse(onCommit.called);
    assert.exists(screen.getByText("after"));
    assert.exists(screen.getByText("Not saved"));
  });

  it("saves what was typed when only the screen narrows", function () {
    const onCommit = typeThenLock(true);
    assert.isTrue(onCommit.calledOnce);
    assert.equal(onCommit.firstCall.args[0], "after");
    assert.exists(screen.getByText("after"));
  });

  const typeAndSave = (onCommit: OnCommit) => {
    const view = render(renderText(onCommit, false, false));
    fireEvent.doubleClick(screen.getByText("before"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "after" },
    });
    fireEvent.blur(screen.getByRole("textbox"));
    return view;
  };

  it("keeps refused text with a Retry button, and retries it", function () {
    const answers: ((refused: boolean) => void)[] = [];
    const onCommit = sinon.spy((_text: string, onSaved) => {
      answers.push(onSaved);
    }) as sinon.SinonSpy<Parameters<OnCommit>, void>;
    typeAndSave(onCommit);
    act(() => answers[0]!(true));
    assert.exists(screen.getByText("after"));
    const retry = screen.getByRole("button", { name: "Retry" });

    fireEvent.click(retry);
    assert.equal(onCommit.callCount, 2);
    assert.equal(onCommit.secondCall.args[0], "after");
    assert.isNull(screen.queryByRole("button", { name: "Retry" }));
    act(() => answers[1]!(false));
    assert.isNull(screen.queryByRole("button", { name: "Retry" }));
    assert.exists(screen.getByText("after"));
  });

  it("doesn't go back to the old text while a refused edit waits", function () {
    const clock = sinon.useFakeTimers();
    try {
      let answer: ((refused: boolean) => void) | undefined;
      typeAndSave((_text, onSaved) => {
        answer = onSaved;
      });
      act(() => answer!(true));
      act(() => {
        clock.tick(10_000);
      });
      assert.exists(screen.getByText("after"));
      assert.exists(screen.getByRole("button", { name: "Retry" }));
    } finally {
      clock.restore();
    }
  });

  it("drops a refused edit once it's edited back to what's saved", function () {
    let answer: ((refused: boolean) => void) | undefined;
    typeAndSave((_text, onSaved) => {
      answer = onSaved;
    });
    act(() => answer!(true));
    fireEvent.doubleClick(screen.getByText("after"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "before" },
    });
    fireEvent.blur(screen.getByRole("textbox"));
    assert.exists(screen.getByText("before"));
    assert.isNull(screen.queryByRole("button", { name: "Retry" }));
  });
});
