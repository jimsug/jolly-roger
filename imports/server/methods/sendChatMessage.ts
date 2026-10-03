import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isReaction from "../../lib/isReaction";
import ChatMessages from "../../lib/models/ChatMessages";
import Puzzles from "../../lib/models/Puzzles";
import sendChatMessage from "../../methods/sendChatMessage";
import sendChatMessageInternal, {
  assertHuntMember,
} from "../sendChatMessageInternal";
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
    });

    return arg;
  },

  async run({ puzzleId, content, parentId }) {
    check(this.userId, String);
    const contentObj = JSON.parse(content);
    check(contentObj, {
      type: "message" as const,
      children: [
        Match.OneOf(
          {
            type: "mention" as const,
            userId: String,
          },
          {
            type: "role-mention" as const,
            roleId: "operator" as const,
          },
          {
            type: "image" as const,
            url: String,
          },
          {
            type: "puzzle" as const,
            puzzleId: String,
          },
          {
            text: String,
          },
        ),
      ],
    });

    let pinTs: Date | undefined;
    const firstChild = contentObj.children[0];
    if (firstChild && "text" in firstChild) {
      if (
        contentObj.children.length === 1 &&
        CLEAR_PINS_COMMAND.test(firstChild.text)
      ) {
        const puzzle = await Puzzles.findOneAsync(puzzleId, {
          projection: { hunt: 1 },
        });
        if (!puzzle) {
          throw new Meteor.Error(404, "Unknown puzzle");
        }
        await assertHuntMember(this.userId, puzzle.hunt);
        // deleted is in the selector so the { deleted, puzzle } index serves
        // the update rather than a collection scan
        await ChatMessages.updateAsync(
          { deleted: false, puzzle: puzzleId, pinTs: { $ne: null } },
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
    });
  },
});
