// How presses on the board are told apart: a click or tap from a drag, and
// a long press from either.

// A press that moves less than this (in screen pixels) is a click.
export const CLICK_SLOP = 4;
// A finger wobbles more than a mouse or pen does, so a touch gets more room
// before it counts as a pan or a drag rather than a tap.
export const TOUCH_SLOP = 10;
// How long a finger has to stay on something, without moving past the touch
// slop, to select it.
export const LONG_PRESS_MS = 500;

export const slopFor = (pointerType: string) =>
  pointerType === "touch" ? TOUCH_SLOP : CLICK_SLOP;

interface ScreenPoint {
  x: number;
  y: number;
}

// Whether a press that started at `from` has moved too far to be a click or
// a tap.
export const movedPastSlop = (
  from: ScreenPoint,
  to: ScreenPoint,
  pointerType: string,
) => Math.hypot(to.x - from.x, to.y - from.y) > slopFor(pointerType);

// One finger held down, which fires `onFire` once it has stayed within the
// touch slop for LONG_PRESS_MS. Moving further, letting go or a second
// finger first cancels it. Only one press is watched at a time: starting
// another cancels the last.
export class LongPress {
  private pending:
    | { pointerId: number; at: ScreenPoint; timer: number }
    | undefined;

  start(pointerId: number, at: ScreenPoint, onFire: () => void) {
    this.cancel();
    const timer = window.setTimeout(() => {
      this.pending = undefined;
      onFire();
    }, LONG_PRESS_MS);
    this.pending = { pointerId, at, timer };
  }

  move(pointerId: number, to: ScreenPoint) {
    const { pending } = this;
    if (
      pending?.pointerId === pointerId &&
      movedPastSlop(pending.at, to, "touch")
    ) {
      this.cancel();
    }
  }

  end(pointerId: number) {
    if (this.pending?.pointerId === pointerId) this.cancel();
  }

  cancel() {
    if (!this.pending) return;
    window.clearTimeout(this.pending.timer);
    this.pending = undefined;
  }

  get waiting() {
    return !!this.pending;
  }
}
