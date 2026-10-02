import { assert } from "chai";
import type { CommentMessage } from "../../../../imports/lib/whiteboard/comments";
import {
  commentPosition,
  groupThreads,
  isUnread,
} from "../../../../imports/lib/whiteboard/comments";

const at = (n: number) => new Date(1000 * n);
const message = (
  _id: string,
  extra: Partial<CommentMessage> & { reaction?: boolean } = {},
) => ({ _id, timestamp: at(0), ...extra });
const isReaction = (m: { reaction?: boolean }) => !!m.reaction;

describe("whiteboard groupThreads", function () {
  it("returns nothing when there are no comments", function () {
    assert.equal(groupThreads([message("plain")], isReaction).size, 0);
  });

  it("collects replies and reactions under their root, oldest first", function () {
    const threads = groupThreads(
      [
        message("root", { sender: "a", comment: { x: 0, y: 0 } }),
        message("r2", { sender: "c", thread: "root", timestamp: at(5) }),
        message("r1", { sender: "b", thread: "root", timestamp: at(3) }),
        message("like", { sender: "d", thread: "root", reaction: true }),
      ],
      isReaction,
    );
    const thread = threads.get("root")!;
    assert.deepEqual(
      thread.replies.map((m) => m._id),
      ["r1", "r2"],
    );
    assert.deepEqual(
      thread.reactions.map((m) => m._id),
      ["like"],
    );
    assert.deepEqual(thread.participants, ["a", "b", "c"]);
    assert.deepEqual(thread.lastActivity, at(5));
  });

  it("marks resolved threads", function () {
    const threads = groupThreads(
      [message("root", { comment: { x: 0, y: 0, resolvedAt: at(9) } })],
      isReaction,
    );
    assert.isTrue(threads.get("root")!.resolved);
  });

  it("drops replies whose root has gone", function () {
    const threads = groupThreads(
      [message("orphan", { thread: "missing" })],
      isReaction,
    );
    assert.equal(threads.size, 0);
  });
});

describe("whiteboard commentPosition", function () {
  const node = { x: 100, y: 200, width: 50, height: 40 };

  it("uses board coordinates for a free comment", function () {
    assert.deepEqual(commentPosition({ x: 7, y: 9 }, undefined), {
      x: 7,
      y: 9,
    });
  });

  it("offsets from the node it's on", function () {
    assert.deepEqual(commentPosition({ node: "n", x: 10, y: 20 }, node), {
      x: 110,
      y: 220,
    });
  });

  it("keeps the pin on a node that has shrunk", function () {
    assert.deepEqual(commentPosition({ node: "n", x: 90, y: -5 }, node), {
      x: 150,
      y: 200,
    });
  });

  it("has no position when its node isn't on the board", function () {
    assert.isUndefined(commentPosition({ node: "n", x: 1, y: 1 }, undefined));
  });
});

describe("whiteboard isUnread", function () {
  const thread = groupThreads(
    [
      message("root", {
        sender: "a",
        comment: { x: 0, y: 0 },
        timestamp: at(1),
      }),
      message("r1", { sender: "me", thread: "root", timestamp: at(9) }),
    ],
    isReaction,
  ).get("root")!;

  it("is unread when there's something newer from someone else", function () {
    assert.isTrue(isUnread(thread, undefined, "me"));
    assert.isFalse(isUnread(thread, +at(1), "me"));
  });

  it("ignores your own replies", function () {
    assert.isFalse(isUnread(thread, +at(2), "me"));
  });
});
