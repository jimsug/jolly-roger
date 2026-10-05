import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../../lib/isReaction";
import ChatMessages from "../../lib/models/ChatMessages";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import sendChatMessage from "../../methods/sendChatMessage";
import {
  assertStoredChatImages,
  parseChatMessageContent,
} from "../chatMessageContent";
import sendChatMessageInternal from "../sendChatMessageInternal";
import {
  assertMayReplyInThread,
  assertValidCommentAnchor,
} from "../whiteboardEdits";
import defineMethod from "./defineMethod";

// "/pin <message>" pins the message as it is sent; a bare "/pin" or "/unpin"
// clears every pin on the puzzle instead of sending anything.
const PIN_PREFIX = /^\s*\/pin\s+/i;
const CLEAR_PINS_COMMAND = /^\s*\/(?:un)?pin\s*$/i;

defineMethod(sendChatMessage, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      content: String,
      parentId: Match.Optional(String),
      comment: Match.Optional({
        node: Match.Optional(String),
        x: Number,
        y: Number,
      }),
    });

    return arg;
  },

  async run({ puzzleId, content, parentId, comment }) {
    check(this.userId, String);

    const user = await MeteorUsers.findOneAsync(this.userId, {
      projection: { hunts: 1 },
    });
    const puzzle = await Puzzles.findOneAsync(puzzleId, {
      projection: { hunt: 1 },
    });
    if (!puzzle) {
      throw new Meteor.Error(404, "Unknown puzzle");
    }
    if (!user?.hunts?.includes(puzzle.hunt)) {
      throw new Meteor.Error(
        403,
        `User ${this.userId} is not a member of hunt ${puzzle.hunt}`,
      );
    }

    const contentObj = parseChatMessageContent(content);
    await assertStoredChatImages(contentObj, puzzle.hunt);

    if (comment) {
      if (parentId !== undefined) {
        throw new Meteor.Error(400, "A reply can't start a comment thread");
      }
      await assertValidCommentAnchor(this.userId, puzzleId, comment);
    } else if (parentId !== undefined) {
      await assertMayReplyInThread(this.userId, puzzleId, parentId);
    }

    let pinTs: Date | undefined;
    const firstChild = contentObj.children[0];
    // Comments skip /pin and /unpin, so their text goes up as written.
    if (!comment && firstChild && "text" in firstChild) {
      if (
        contentObj.children.length === 1 &&
        CLEAR_PINS_COMMAND.test(firstChild.text)
      ) {
        // deleted is in the selector so the { deleted, puzzle } index serves
        // the update rather than a collection scan
        await ChatMessages.updateAsync(
          { deleted: false, puzzle: puzzle._id, pinTs: { $exists: true } },
          { $unset: { pinTs: "" } },
          { multi: true },
        );
        return;
      }

      const pinMatch = PIN_PREFIX.exec(firstChild.text);
      if (pinMatch) {
        pinTs = new Date();
        firstChild.text = firstChild.text.slice(pinMatch[0].length);
        if (firstChild.text === "") {
          contentObj.children.shift();
        }
      }
    }

    // A reaction is shown on its parent, never in the history or the pinned
    // pane, so there is nothing for a pin on it to show
    if (pinTs && parentId && isReaction({ content: contentObj, parentId })) {
      pinTs = undefined;
    }

    await sendChatMessageInternal({
      puzzleId,
      content: contentObj,
      sender: this.userId,
      pinTs,
      parentId,
      comment,
    });
  },
});
