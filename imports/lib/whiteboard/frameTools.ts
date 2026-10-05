import type { Occupied, Point, Rect, Size } from "./layout";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FRAME_HEADER,
  FRAME_PADDING,
  placeIntoFrame,
} from "./layout";

// A node's box in its frame's coordinates (or the board's, at the top
// level), whether it's locked, and whether it's background (a shape), which
// Tidy lays cards over rather than going round.
export interface Box extends Rect {
  id: string;
  locked?: boolean;
  background?: boolean;
}

// A frame around the one being changed, innermost first, with everything
// directly inside it (the frame below it included).
export interface FrameAround {
  frame: Box;
  children: Box[];
}

export interface BoxChange {
  id: string;
  position?: Point;
  width?: number;
  height?: number;
}

export interface FrameToolResult {
  changes: BoxChange[];
  // Locked nodes the changes would move or resize. Fit to contents also
  // lists the frame it's fitting whenever that's locked, whether or not it
  // would change.
  locked: string[];
}

// A card being tidied, with its puzzle's creation time.
export interface TidyCard extends Box {
  createdAt: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const differs = (a: number, b: number) => Math.abs(a - b) >= 0.05;

// Changes to boxes, kept only where they differ from the box as it was.
function makePlan() {
  const boxes = new Map<string, Box>();
  const changes = new Map<string, Omit<BoxChange, "id">>();
  const set = (box: Box, patch: Omit<BoxChange, "id">) => {
    boxes.set(box.id, box);
    const change = { ...changes.get(box.id) };
    if (patch.position) {
      if (
        differs(patch.position.x, box.x) ||
        differs(patch.position.y, box.y)
      ) {
        change.position = patch.position;
      } else {
        delete change.position;
      }
    }
    if (patch.width !== undefined) {
      if (differs(patch.width, box.width)) {
        change.width = patch.width;
      } else {
        delete change.width;
      }
    }
    if (patch.height !== undefined) {
      if (differs(patch.height, box.height)) {
        change.height = patch.height;
      } else {
        delete change.height;
      }
    }
    changes.set(box.id, change);
  };
  const result = (alwaysLocked?: Box): FrameToolResult => {
    const changed = [...changes].flatMap(([id, change]) =>
      Object.keys(change).length > 0 ? [{ id, ...change }] : [],
    );
    const locked = new Set(
      changed.filter((c) => boxes.get(c.id)?.locked).map((c) => c.id),
    );
    if (alwaysLocked?.locked) locked.add(alwaysLocked.id);
    return { changes: changed, locked: [...locked] };
  };
  return { set, result };
}

type Plan = ReturnType<typeof makePlan>;

// Grows each frame around `inner` (whose box is now `rect`) that it would
// overhang, to take it with FRAME_PADDING to spare (FRAME_HEADER above),
// moving the other things in a frame that grows up or left so they stay
// where they are on the board. With rightAndBottomOnly, only those two edges
// count. Frames never shrink.
function growAncestors(
  plan: Plan,
  inner: Box,
  rect: Rect,
  ancestors: FrameAround[],
  rightAndBottomOnly: boolean,
) {
  let child = inner;
  let childRect = rect;
  for (const { frame, children } of ancestors) {
    const childId = child.id;
    const left =
      !rightAndBottomOnly && childRect.x < 0 ? childRect.x - FRAME_PADDING : 0;
    const top =
      !rightAndBottomOnly && childRect.y < FRAME_HEADER
        ? childRect.y - FRAME_HEADER
        : 0;
    const right =
      childRect.x + childRect.width > frame.width
        ? childRect.x + childRect.width + FRAME_PADDING
        : frame.width;
    const bottom =
      childRect.y + childRect.height > frame.height
        ? childRect.y + childRect.height + FRAME_PADDING
        : frame.height;
    if (
      left === 0 &&
      top === 0 &&
      right === frame.width &&
      bottom === frame.height
    ) {
      return;
    }
    const dx = round1(left);
    const dy = round1(top);
    const grown = {
      x: frame.x + dx,
      y: frame.y + dy,
      width: round1(right - dx),
      height: round1(bottom - dy),
    };
    plan.set(frame, {
      position: { x: grown.x, y: grown.y },
      width: grown.width,
      height: grown.height,
    });
    if (dx !== 0 || dy !== 0) {
      children.forEach((c) => {
        if (c.id === childId) return;
        plan.set(c, { position: { x: c.x - dx, y: c.y - dy } });
      });
    }
    plan.set(child, { position: { x: childRect.x - dx, y: childRect.y - dy } });
    child = frame;
    childRect = grown;
  }
}

// Fit to contents: the frame's box around everything directly in it, with
// FRAME_PADDING at the sides and bottom and FRAME_HEADER at the top, but no
// smaller than minSize. When that moves the frame's origin, everything in it
// moves the other way, so nothing moves on the board. Frames around it grow
// if it would overhang them. A frame with nothing in it is left alone.
export function fitFrame(
  frame: Box,
  children: Box[],
  ancestors: FrameAround[] = [],
  minSize?: Size,
): FrameToolResult {
  const plan = makePlan();
  if (children.length === 0) return plan.result(frame);
  const minX = Math.min(...children.map((c) => c.x));
  const minY = Math.min(...children.map((c) => c.y));
  const maxX = Math.max(...children.map((c) => c.x + c.width));
  const maxY = Math.max(...children.map((c) => c.y + c.height));
  const dx = round1(minX - FRAME_PADDING);
  const dy = round1(minY - FRAME_HEADER);
  const rect = {
    x: frame.x + dx,
    y: frame.y + dy,
    width: round1(
      Math.max(minSize?.width ?? 0, maxX - minX + FRAME_PADDING * 2),
    ),
    height: round1(
      Math.max(
        minSize?.height ?? 0,
        maxY - minY + FRAME_HEADER + FRAME_PADDING,
      ),
    ),
  };
  plan.set(frame, {
    position: { x: rect.x, y: rect.y },
    width: rect.width,
    height: rect.height,
  });
  if (dx !== 0 || dy !== 0) {
    children.forEach((c) =>
      plan.set(c, { position: { x: c.x - dx, y: c.y - dy } }),
    );
  }
  growAncestors(plan, frame, rect, ancestors, false);
  return plan.result(frame);
}

// Grows a frame that `landed` (things just dropped, nudged or aligned into
// it) overhang on the right or bottom, to take them with FRAME_PADDING to
// spare, and the frames around it the same way. Nothing moves and nothing
// shrinks.
export function growFrameFor(
  frame: Box,
  landed: Rect[],
  ancestors: FrameAround[] = [],
): FrameToolResult {
  const plan = makePlan();
  if (landed.length === 0) return plan.result();
  const right = Math.max(...landed.map((r) => r.x + r.width));
  const bottom = Math.max(...landed.map((r) => r.y + r.height));
  const size = {
    width: right > frame.width ? round1(right + FRAME_PADDING) : frame.width,
    height:
      bottom > frame.height ? round1(bottom + FRAME_PADDING) : frame.height,
  };
  if (size.width === frame.width && size.height === frame.height) {
    return plan.result();
  }
  plan.set(frame, size);
  growAncestors(plan, frame, { ...frame, ...size }, ancestors, true);
  return plan.result();
}

const byCreation = (a: TidyCard, b: TidyCard) =>
  a.createdAt - b.createdAt || a.id.localeCompare(b.id);

const occupying = (rect: Rect, meta: boolean): Occupied => ({
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
  meta,
});

// Tidy: lays a frame's cards out as a new board would, the round's metas
// (the cards in `metas`) first on their own rows, then the rest, each in
// order of their puzzles' creation, four to a row, through placeIntoFrame.
// Whatever else is in the frame (`others`: notes, text, ink, line ends,
// frames and anything someone else is dragging) stays where it is and the
// cards go round it, as do locked cards, except for background (shapes),
// which stays put with cards laid over it. The frame grows to take the cards,
// and so do the frames around it, but nothing shrinks. A locked frame only
// stands in the way when it would have to grow.
export function tidyFrame(
  frame: Box,
  cards: TidyCard[],
  metas: ReadonlySet<string>,
  others: Box[] = [],
  ancestors: FrameAround[] = [],
): FrameToolResult {
  const plan = makePlan();
  const staying: Occupied[] = [
    ...others.filter((o) => !o.background).map((o) => occupying(o, false)),
    ...cards.filter((c) => c.locked).map((c) => occupying(c, metas.has(c.id))),
  ];
  const placed: Occupied[] = [];
  let size: Size = { width: frame.width, height: frame.height };
  const place = (card: TidyCard, meta: boolean) => {
    // A meta being placed treats every card as a feeder, as placement does.
    const occupied = [...staying, ...placed];
    const result = placeIntoFrame(
      size,
      meta ? occupied.map((o) => occupying(o, false)) : occupied,
    );
    size = result.frame;
    placed.push({
      ...result.position,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      meta,
    });
    plan.set(card, { position: result.position });
  };
  const movable = cards.filter((c) => !c.locked).toSorted(byCreation);
  movable.filter((c) => metas.has(c.id)).forEach((c) => place(c, true));
  movable.filter((c) => !metas.has(c.id)).forEach((c) => place(c, false));
  plan.set(frame, size);
  growAncestors(plan, frame, { ...frame, ...size }, ancestors, true);
  return plan.result();
}
