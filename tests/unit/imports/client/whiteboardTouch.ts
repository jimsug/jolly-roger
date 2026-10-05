import { assert } from "chai";
import sinon from "sinon";
import {
  CLICK_SLOP,
  LONG_PRESS_MS,
  LongPress,
  movedPastSlop,
  slopFor,
  TOUCH_SLOP,
} from "../../../../imports/client/components/whiteboard/touch";

describe("whiteboard touch", function () {
  describe("slop", function () {
    it("gives a finger more room than a mouse or a pen", function () {
      assert.equal(slopFor("touch"), TOUCH_SLOP);
      assert.equal(slopFor("mouse"), CLICK_SLOP);
      assert.equal(slopFor("pen"), CLICK_SLOP);
      assert.isAbove(TOUCH_SLOP, CLICK_SLOP);
    });

    it("counts a move as past the slop only once it's further than it", function () {
      const from = { x: 100, y: 100 };
      assert.isFalse(movedPastSlop(from, { x: 106, y: 108 }, "touch"));
      assert.isTrue(movedPastSlop(from, { x: 107, y: 108 }, "touch"));
      assert.isFalse(movedPastSlop(from, { x: 104, y: 100 }, "mouse"));
      assert.isTrue(movedPastSlop(from, { x: 103, y: 103 }, "mouse"));
    });
  });

  describe("LongPress", function () {
    let clock: sinon.SinonFakeTimers;
    let press: LongPress;
    let fired: sinon.SinonSpy;

    beforeEach(function () {
      clock = sinon.useFakeTimers();
      press = new LongPress();
      fired = sinon.spy();
    });

    afterEach(function () {
      press.cancel();
      clock.restore();
    });

    it("fires once the finger has been down for the long press time", function () {
      press.start(1, { x: 50, y: 50 }, fired);
      assert.isTrue(press.waiting);
      clock.tick(LONG_PRESS_MS - 1);
      assert.isFalse(fired.called);
      clock.tick(1);
      assert.isTrue(fired.calledOnce);
      assert.isFalse(press.waiting);
      clock.tick(LONG_PRESS_MS);
      assert.isTrue(fired.calledOnce);
    });

    it("still fires when the finger wobbles within the touch slop", function () {
      press.start(1, { x: 50, y: 50 }, fired);
      press.move(1, { x: 50 + TOUCH_SLOP, y: 50 });
      clock.tick(LONG_PRESS_MS);
      assert.isTrue(fired.calledOnce);
    });

    it("cancels when the finger moves past the touch slop", function () {
      press.start(1, { x: 50, y: 50 }, fired);
      clock.tick(LONG_PRESS_MS / 2);
      press.move(1, { x: 50 + TOUCH_SLOP + 1, y: 50 });
      assert.isFalse(press.waiting);
      clock.tick(LONG_PRESS_MS);
      assert.isFalse(fired.called);
    });

    it("cancels when the finger is lifted first", function () {
      press.start(1, { x: 50, y: 50 }, fired);
      clock.tick(LONG_PRESS_MS - 10);
      press.end(1);
      clock.tick(LONG_PRESS_MS);
      assert.isFalse(fired.called);
    });

    it("ignores other fingers moving or lifting", function () {
      press.start(1, { x: 50, y: 50 }, fired);
      press.move(2, { x: 500, y: 500 });
      press.end(2);
      clock.tick(LONG_PRESS_MS);
      assert.isTrue(fired.calledOnce);
    });

    it("watches only the latest press", function () {
      const first = sinon.spy();
      press.start(1, { x: 50, y: 50 }, first);
      clock.tick(LONG_PRESS_MS / 2);
      press.start(2, { x: 80, y: 80 }, fired);
      clock.tick(LONG_PRESS_MS);
      assert.isFalse(first.called);
      assert.isTrue(fired.calledOnce);
    });

    it("does nothing when cancelled with nothing pending", function () {
      press.cancel();
      press.end(1);
      press.move(1, { x: 0, y: 0 });
      assert.isFalse(press.waiting);
    });
  });
});
