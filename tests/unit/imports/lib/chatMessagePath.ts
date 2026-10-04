import { assert } from "chai";
import chatMessagePath, {
  commentThreadOf,
} from "../../../../imports/lib/chatMessagePath";

describe("chatMessagePath", function () {
  it("opens an ordinary puzzle at the message", function () {
    assert.equal(
      chatMessagePath({
        hunt: "h",
        puzzle: "p",
        whiteboard: false,
        message: "m",
        thread: "ignored",
      }),
      "/hunts/h/puzzles/p#msg=m",
    );
  });

  it("opens the board at a message that isn't in a thread", function () {
    assert.equal(
      chatMessagePath({
        hunt: "h",
        puzzle: "board",
        whiteboard: true,
        message: "m",
      }),
      "/hunts/h/whiteboard#msg=m",
    );
  });

  it("opens the board at a thread, with chat at the reply", function () {
    assert.equal(
      chatMessagePath({
        hunt: "h",
        puzzle: "board",
        whiteboard: true,
        message: "reply",
        thread: "root",
      }),
      "/hunts/h/whiteboard?comment=root#msg=reply",
    );
  });

  it("leaves the hash off when there's no message", function () {
    assert.equal(
      chatMessagePath({ hunt: "h", puzzle: "p", whiteboard: false }),
      "/hunts/h/puzzles/p",
    );
    assert.equal(
      chatMessagePath({ hunt: "h", puzzle: "b", whiteboard: true }),
      "/hunts/h/whiteboard",
    );
  });

  it("encodes the ids it puts in a link", function () {
    assert.equal(
      chatMessagePath({
        hunt: "h",
        puzzle: "b",
        whiteboard: true,
        message: "m#1",
        thread: "a&b",
      }),
      "/hunts/h/whiteboard?comment=a%26b#msg=m%231",
    );
  });
});

describe("commentThreadOf", function () {
  it("is the thread a reply belongs to", function () {
    assert.equal(commentThreadOf({ _id: "reply", thread: "root" }), "root");
  });

  it("is a comment's own id for the comment that starts a thread", function () {
    assert.equal(
      commentThreadOf({ _id: "root", comment: { x: 0, y: 0 } }),
      "root",
    );
  });

  it("is nothing for a message outside a thread", function () {
    assert.isUndefined(commentThreadOf({ _id: "m" }));
  });
});
