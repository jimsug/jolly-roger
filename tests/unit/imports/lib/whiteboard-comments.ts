import { assert } from "chai";
import type { ChatMessageType } from "../../../../imports/lib/models/ChatMessages";
import {
  commentPosition,
  groupThreads,
  isUnread,
  nextUnread,
  threadList,
} from "../../../../imports/lib/whiteboard/comments";

const at = (n: number) => new Date(1000 * n);
const message = (
  _id: string,
  extra: Partial<ChatMessageType> & { reaction?: boolean } = {},
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

// Threads with a root from "a" at `rootAt`, and optionally a reply from "b"
// at `replyAt`, resolved or not.
const boardThreads = (
  specs: {
    id: string;
    rootAt: number;
    replyAt?: number;
    resolved?: boolean;
  }[],
) =>
  groupThreads(
    specs.flatMap(({ id, rootAt, replyAt, resolved }) => [
      message(id, {
        sender: "a",
        comment: { x: 0, y: 0, ...(resolved ? { resolvedAt: at(1) } : {}) },
        timestamp: at(rootAt),
      }),
      ...(replyAt !== undefined
        ? [
            message(`${id}-reply`, {
              sender: "b",
              thread: id,
              timestamp: at(replyAt),
            }),
          ]
        : []),
    ]),
    isReaction,
  );

describe("whiteboard threadList", function () {
  it("is empty with no threads", function () {
    assert.deepEqual(
      threadList([], { seen: {}, selfId: "me", showResolved: true }),
      [],
    );
  });

  it("puts unread threads first, then the newest activity", function () {
    const threads = boardThreads([
      { id: "old", rootAt: 1 },
      { id: "busy", rootAt: 2, replyAt: 20 },
      { id: "new", rootAt: 10 },
      { id: "seenNew", rootAt: 15 },
    ]);
    const rows = threadList(threads.values(), {
      seen: { old: +at(1), seenNew: +at(15) },
      selfId: "me",
      showResolved: false,
    });
    assert.deepEqual(
      rows.map((r) => [r.thread.root._id, r.unread]),
      [
        ["busy", true],
        ["new", true],
        ["seenNew", false],
        ["old", false],
      ],
    );
  });

  it("leaves out resolved threads unless they're shown", function () {
    const threads = boardThreads([
      { id: "open", rootAt: 1 },
      { id: "done", rootAt: 2, resolved: true },
    ]);
    const ids = (showResolved: boolean) =>
      threadList(threads.values(), {
        seen: {},
        selfId: "me",
        showResolved,
      }).map((r) => r.thread.root._id);
    assert.deepEqual(ids(false), ["open"]);
    assert.deepEqual(ids(true), ["done", "open"]);
  });

  it("doesn't count your own comments as unread", function () {
    const threads = boardThreads([{ id: "mine", rootAt: 1 }]);
    const [row] = threadList(threads.values(), {
      seen: {},
      selfId: "a",
      showResolved: false,
    });
    assert.isFalse(row?.unread);
  });
});

describe("whiteboard nextUnread", function () {
  const threads = boardThreads([
    { id: "newest", rootAt: 30 },
    { id: "middle", rootAt: 20 },
    { id: "oldest", rootAt: 10 },
  ]);
  const rows = (seen: Record<string, number>) =>
    threadList(threads.values(), { seen, selfId: "me", showResolved: false });

  it("goes to the newest unread thread with none open", function () {
    assert.equal(nextUnread(rows({}), undefined), "newest");
    assert.equal(nextUnread(rows({ newest: +at(30) }), "gone"), "middle");
  });

  it("goes to the next older unread thread", function () {
    assert.equal(nextUnread(rows({ newest: +at(30) }), "newest"), "middle");
    assert.equal(
      nextUnread(rows({ newest: +at(30), middle: +at(20) }), "middle"),
      "oldest",
    );
  });

  it("starts again from the newest after the oldest", function () {
    assert.equal(nextUnread(rows({ oldest: +at(10) }), "oldest"), "newest");
    assert.equal(
      nextUnread(rows({ newest: +at(30), oldest: +at(10) }), "oldest"),
      "middle",
    );
  });

  it("skips the open thread and has nothing when nothing else is unread", function () {
    assert.isUndefined(
      nextUnread(rows({ middle: +at(20), oldest: +at(10) }), "newest"),
    );
    assert.isUndefined(
      nextUnread(
        rows({ newest: +at(30), middle: +at(20), oldest: +at(10) }),
        undefined,
      ),
    );
    assert.isUndefined(nextUnread([], undefined));
  });
});
