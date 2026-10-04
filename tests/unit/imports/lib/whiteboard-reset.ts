import { assert } from "chai";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";
import type { SeedNode } from "../../../../imports/lib/whiteboard/layout";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  seedLayout,
} from "../../../../imports/lib/whiteboard/layout";
import type {
  ResetNode,
  ResetPlan,
} from "../../../../imports/lib/whiteboard/reset";
import {
  planReset,
  resetSeedInput,
} from "../../../../imports/lib/whiteboard/reset";

const hunt = "hunt_id";
const user = "user";

function fixtures() {
  const tags: TagType[] = [];
  const puzzles: PuzzleType[] = [];
  const tag = (name: string): TagType => {
    const existing = tags.find((t) => t.name === name);
    if (existing) return existing;
    const t = {
      _id: `tag_${name}`,
      name,
      hunt,
      deleted: false,
      createdBy: user,
      createdAt: new Date(1000 + tags.length),
      updatedAt: new Date(1000 + tags.length),
    } as TagType;
    tags.push(t);
    return t;
  };
  const puzzle = (title: string, tagNames: string[]): PuzzleType => {
    const p = {
      _id: `puz_${title}`,
      hunt,
      tags: tagNames.map((n) => tag(n)._id),
      title,
      answers: [],
      expectedAnswerCount: 1,
      deleted: false,
      createdBy: user,
      createdAt: new Date(2000 + puzzles.length),
      updatedAt: new Date(2000 + puzzles.length),
    } as unknown as PuzzleType;
    puzzles.push(p);
    return p;
  };
  return { tags, puzzles, tag, puzzle };
}

const card = (
  _id: string,
  puzzle: string,
  extra: Partial<ResetNode> = {},
): ResetNode => ({
  _id,
  type: "puzzle",
  puzzle,
  position: { x: 5000, y: 5000 },
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  ...extra,
});

const frame = (_id: string, extra: Partial<ResetNode> = {}): ResetNode => ({
  _id,
  type: "frame",
  frameKind: "group",
  position: { x: 7000, y: 7000 },
  width: 400,
  height: 300,
  ...extra,
});

const placementFor = (plan: ResetPlan, key: string) =>
  plan.place.find((p) => p.key === key);

const indexOf = (plan: ResetPlan, key: string) =>
  plan.place.findIndex((p) => p.key === key);

describe("whiteboard planReset", function () {
  it("maps seed keys to existing ids", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    const a = puzzle("a", ["group:one"]);
    const b = puzzle("b", []);
    const one = tag("group:one");
    const { nodes: seed } = seedLayout(puzzles, tags, "Ungrouped");
    const nodes = [
      frame("frameOne", { tag: one._id }),
      frame("ungrouped", { frameKind: "ungrouped" }),
      card("cardA", a._id),
      card("cardB", b._id),
    ];

    const plan = planReset(seed, nodes, { putBack: false });

    assert.equal(placementFor(plan, `frame:${one._id}`)?.node, "frameOne");
    assert.equal(placementFor(plan, "frame:ungrouped")?.node, "ungrouped");
    assert.equal(placementFor(plan, `puzzle:${a._id}`)?.node, "cardA");
    assert.equal(placementFor(plan, `puzzle:${b._id}`)?.node, "cardB");
    // Each goes where the seed puts it, in the frame the seed puts it in
    const seeded = new Map(seed.map((s) => [s.key, s]));
    plan.place.forEach((p) => {
      const s = seeded.get(p.key)!;
      assert.deepEqual(p.$set, {
        position: s.position,
        width: s.width,
        height: s.height,
      });
      assert.equal(p.parentKey, s.parentKey);
    });
    assert.isEmpty(plan.stack);
  });

  it("inserts frames and cards that are missing, parents first", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    const a = puzzle("a", ["group:one"]);
    const b = puzzle("b", ["group:one"]);
    const one = tag("group:one");
    const { nodes: seed } = seedLayout(puzzles, tags, "Ungrouped");

    const plan = planReset(seed, [card("cardA", a._id)], { putBack: false });

    const frameKey = `frame:${one._id}`;
    assert.isUndefined(placementFor(plan, frameKey)?.node);
    assert.equal(placementFor(plan, frameKey)?.seed.tag, one._id);
    assert.isUndefined(placementFor(plan, `puzzle:${b._id}`)?.node);
    assert.equal(placementFor(plan, `puzzle:${a._id}`)?.node, "cardA");
    assert.equal(placementFor(plan, `puzzle:${b._id}`)?.parentKey, frameKey);
    assert.isBelow(indexOf(plan, frameKey), indexOf(plan, `puzzle:${a._id}`));
    assert.isBelow(indexOf(plan, frameKey), indexOf(plan, `puzzle:${b._id}`));
  });

  it("stacks stale seeded frames below the layout", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    const a = puzzle("a", ["group:one"]);
    const one = tag("group:one");
    const gone = tag("group:gone");
    const { nodes: seed } = seedLayout(puzzles, tags, "Ungrouped");
    const sticky: ResetNode = {
      _id: "sticky",
      type: "sticky",
      position: { x: 0, y: 2000 },
      width: 200,
      height: 100,
    };
    const nodes = [
      frame("frameOne", { tag: one._id }),
      frame("stale", { tag: gone._id, position: { x: 100, y: 100 } }),
      frame("staleInside", { tag: "tag_inner", parent: "stale" }),
      frame("ungrouped", { frameKind: "ungrouped" }),
      card("cardA", a._id),
      sticky,
    ];

    const plan = planReset(seed, nodes, { putBack: false });

    // A frame inside a stale one goes with it
    assert.sameMembers(
      plan.stack.map((s) => s.node),
      ["stale", "ungrouped"],
    );
    const bottom = Math.max(
      ...seed.filter((s) => !s.parentKey).map((s) => s.position.y + s.height),
      sticky.position.y + sticky.height!,
    );
    const [first, second] = plan.stack;
    assert.equal(first!.position.x, 0);
    assert.isAbove(first!.position.y, bottom);
    // Each below the one before
    assert.isAbove(second!.position.y, first!.position.y + 300);
  });

  it("leaves hidden cards and frames out unless putting back", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    const a = puzzle("a", ["group:one"]);
    const hiddenCard = puzzle("hidden", ["group:one"]);
    const inHiddenRound = puzzle("c", ["group:off"]);
    const one = tag("group:one");
    const off = tag("group:off");
    const nodes = [
      frame("frameOne", { tag: one._id }),
      frame("frameOff", { tag: off._id, hidden: true }),
      card("cardA", a._id),
      card("cardHidden", hiddenCard._id, { hidden: true }),
      card("cardC", inHiddenRound._id),
    ];

    // seedLayout ignores the hidden round's tag on the puzzle, so its card
    // lands in Ungrouped
    const left = resetSeedInput(puzzles, tags, nodes, false);
    assert.notInclude(
      left.puzzles.map((p) => p._id),
      hiddenCard._id,
    );
    assert.notInclude(
      left.tags.map((t) => t._id),
      off._id,
    );
    const { nodes: seed } = seedLayout(left.puzzles, left.tags, "Ungrouped");
    const plan = planReset(seed, nodes, { putBack: false });
    const placed = plan.place.flatMap((p) => (p.node ? [p.node] : []));
    assert.notInclude(placed, "cardHidden");
    assert.notInclude(placed, "frameOff");
    assert.equal(
      placementFor(plan, `puzzle:${inHiddenRound._id}`)?.parentKey,
      "frame:ungrouped",
    );
    plan.place.forEach((p) => assert.notProperty(p.$unset, "hidden"));

    const all = resetSeedInput(puzzles, tags, nodes, true);
    const { nodes: fullSeed } = seedLayout(all.puzzles, all.tags, "Ungrouped");
    const putBack = planReset(fullSeed, nodes, { putBack: true });
    assert.equal(
      placementFor(putBack, `puzzle:${hiddenCard._id}`)?.node,
      "cardHidden",
    );
    assert.equal(placementFor(putBack, `frame:${off._id}`)?.node, "frameOff");
    assert.equal(
      placementFor(putBack, `puzzle:${inHiddenRound._id}`)?.parentKey,
      `frame:${off._id}`,
    );
    putBack.place.forEach((p) => assert.equal(p.$unset.hidden, ""));
  });

  it("doesn't treat hidden frames as stale", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    const a = puzzle("a", ["group:one"]);
    const one = tag("group:one");
    const empty = tag("group:empty");
    const nodes = [
      frame("frameOne", { tag: one._id }),
      frame("hiddenEmpty", { tag: empty._id, hidden: true }),
      frame("hiddenUngrouped", { frameKind: "ungrouped", hidden: true }),
      card("cardA", a._id),
    ];
    const { nodes: seed } = seedLayout(puzzles, tags, "Ungrouped");

    assert.isEmpty(planReset(seed, nodes, { putBack: false }).stack);
    // Nor when putting back, if nothing goes in them
    assert.isEmpty(planReset(seed, nodes, { putBack: true }).stack);
  });

  it("clears manual on everything it places", function () {
    const { tags, puzzles, puzzle, tag } = fixtures();
    const a = puzzle("a", ["group:one"]);
    const b = puzzle("b", []);
    const one = tag("group:one");
    const ungrouped = frame("ungrouped", {
      frameKind: "ungrouped",
      hidden: true,
      position: { x: 1000, y: 0 },
    });
    const nodes = [
      frame("frameOne", { tag: one._id, manual: true }),
      ungrouped,
      card("cardA", a._id, { manual: true, parent: "somewhereElse" }),
      card("cardB", b._id, { manual: true }),
    ];
    const { nodes: seed } = seedLayout(puzzles, tags, "Ungrouped");

    const plan = planReset(seed, nodes, { putBack: false });
    plan.place.forEach((p) => assert.equal(p.$unset.manual, ""));
    assert.sameMembers(
      plan.place.map((p) => p.node),
      ["frameOne", "cardA", "cardB"],
    );
    // An Ungrouped frame someone took off stays off; its cards go where it
    // would have been, at the top level
    const ungroupedSeed = seed.find(
      (s: SeedNode) => s.key === "frame:ungrouped",
    )!;
    const cardSeed = seed.find((s) => s.key === `puzzle:${b._id}`)!;
    const placedB = placementFor(plan, `puzzle:${b._id}`)!;
    assert.isUndefined(placedB.parentKey);
    assert.deepEqual(placedB.$set.position, {
      x: ungroupedSeed.position.x + cardSeed.position.x,
      y: ungroupedSeed.position.y + cardSeed.position.y,
    });
    assert.isUndefined(placementFor(plan, "frame:ungrouped"));
  });
});
