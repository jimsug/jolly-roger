import { cleanup, renderHook } from "@testing-library/react";
import { assert } from "chai";
import type {
  Action,
  AudioControls,
} from "../../../../imports/client/hooks/useCallState";
import usePushToTalk, {
  isTypingTarget,
} from "../../../../imports/client/hooks/usePushToTalk";

const MUTED: AudioControls = { muted: true, deafened: false };
const UNMUTE: Action = { type: "set-muted", muted: false };
const MUTE: Action = { type: "set-muted", muted: true };

describe("usePushToTalk", function () {
  let actions: Action[];
  const callDispatch = (action: Action) => {
    actions.push(action);
  };

  const renderPushToTalk = (audioControls: AudioControls, inCall = true) =>
    renderHook(() => usePushToTalk({ inCall, audioControls, callDispatch }));

  // Dispatched on the window, where the hook listens; returns the event so a
  // test can see whether the hook claimed it
  const press = (init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key: " ",
      ctrlKey: true,
      cancelable: true,
      ...init,
    });
    window.dispatchEvent(event);
    return event;
  };
  const release = () => {
    const event = new KeyboardEvent("keyup", { key: " ", cancelable: true });
    window.dispatchEvent(event);
    return event;
  };

  // Elements in the page, since editability and focus need a document
  let attached: HTMLElement[] = [];
  const attach = <T extends HTMLElement>(element: T) => {
    document.body.append(element);
    attached.push(element);
    return element;
  };

  beforeEach(function () {
    actions = [];
    // Whatever an earlier test left focused could look like a text field
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  afterEach(function () {
    cleanup();
    attached.forEach((element) => {
      element.remove();
    });
    attached = [];
  });

  describe("isTypingTarget", function () {
    it("is true for anything that takes text", function () {
      const editor = attach(document.createElement("div"));
      editor.contentEditable = "true";
      assert.isTrue(isTypingTarget(editor));
      assert.isTrue(isTypingTarget(attach(document.createElement("input"))));
      assert.isTrue(isTypingTarget(attach(document.createElement("textarea"))));
      assert.isTrue(isTypingTarget(attach(document.createElement("select"))));
    });

    it("is false for anything else", function () {
      assert.isFalse(isTypingTarget(null));
      assert.isFalse(isTypingTarget(document.body));
      assert.isFalse(isTypingTarget(attach(document.createElement("button"))));
      for (const type of ["button", "checkbox", "radio", "range"]) {
        const input = attach(document.createElement("input"));
        input.type = type;
        assert.isFalse(isTypingTarget(input), type);
      }
    });
  });

  it("unmutes while Ctrl+Space is held and mutes again on release", function () {
    renderPushToTalk(MUTED);
    assert.isTrue(press().defaultPrevented);
    assert.deepEqual(actions, [UNMUTE]);
    assert.isTrue(release().defaultPrevented);
    assert.deepEqual(actions, [UNMUTE, MUTE]);
  });

  it("ignores key repeats and a second press while held", function () {
    renderPushToTalk(MUTED);
    press();
    press({ repeat: true });
    press();
    assert.deepEqual(actions, [UNMUTE]);
  });

  it("ignores a fresh repeat and Space without Ctrl", function () {
    renderPushToTalk(MUTED);
    press({ repeat: true });
    press({ ctrlKey: false });
    assert.deepEqual(actions, []);
  });

  it("does nothing while deafened or already talking", function () {
    const { unmount } = renderPushToTalk({ muted: true, deafened: true });
    assert.isFalse(press().defaultPrevented);
    unmount();
    renderPushToTalk({ muted: false, deafened: false });
    assert.isFalse(press().defaultPrevented);
    release();
    assert.deepEqual(actions, []);
  });

  it("stays out of the way of typing", function () {
    renderPushToTalk(MUTED);
    attach(document.createElement("textarea")).focus();
    assert.isFalse(press().defaultPrevented);
    assert.deepEqual(actions, []);
  });

  it("only mutes on a release it started", function () {
    renderPushToTalk(MUTED);
    assert.isFalse(release().defaultPrevented);
    assert.deepEqual(actions, []);
  });

  it("mutes again when the window loses focus mid-press", function () {
    renderPushToTalk(MUTED);
    press();
    window.dispatchEvent(new Event("blur"));
    assert.deepEqual(actions, [UNMUTE, MUTE]);
    release();
    assert.deepEqual(actions, [UNMUTE, MUTE]);
  });

  it("only listens during a call", function () {
    renderPushToTalk(MUTED, false);
    press();
    release();
    assert.deepEqual(actions, []);
  });
});
