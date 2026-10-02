import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import ChatMessages, {
  type ChatAttachmentType,
} from "../../lib/models/ChatMessages";
import sendChatMessage, {
  type CommentAnchorInput,
} from "../../methods/sendChatMessage";
import sendChatMessageInternal from "../sendChatMessageInternal";
import { assertValidCommentAnchor } from "../whiteboardEdits";
import defineMethod from "./defineMethod";

const ChatAttachmentPattern = Match.ObjectIncluding({
  url: String,
  filename: String,
  mimeType: String,
  size: Match.Optional(Number),
});

defineMethod(sendChatMessage, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      content: String,
      parentId: Match.Optional(Match.OneOf(String, null)),
      attachments: Match.Optional([ChatAttachmentPattern]),
      comment: Match.Optional({
        node: Match.Optional(String),
        x: Number,
        y: Number,
      }),
    });

    return arg;
  },

  async run({
    puzzleId,
    content,
    parentId = null,
    attachments = [],
    comment,
  }: {
    puzzleId: string;
    content: string;
    parentId?: string | null;
    attachments?: ChatAttachmentType[] | null;
    comment?: CommentAnchorInput;
  }) {
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
            text: String,
          },
        ),
      ],
    });

    if (comment) {
      await assertValidCommentAnchor(this.userId, puzzleId, comment);
      if (parentId) {
        throw new Meteor.Error(400, "A reply can't start a comment thread");
      }
    }

    let isPinned = false;

    // Comments skip /pin and /unpin, so their text goes up as written.
    const firstChild = contentObj.children[0];
    if (
      !comment &&
      "children" in contentObj &&
      contentObj.children.length > 0 &&
      firstChild &&
      "text" in firstChild
    ) {
      if (firstChild.text.match(/^\s*\/(un)?pin\s*$/i)) {
        const puzzle = puzzleId;
        await ChatMessages.updateAsync(
          {
            puzzle,
            pinTs: { $ne: null },
          },
          {
            $set: {
              pinTs: null,
            },
          },
        );
        return;
      } else if (firstChild.text.match(/^\s*\/pin\s+\S+/i)) {
        isPinned = true;
        firstChild.text = firstChild.text.replace(/^\s*\/pin\s+/i, "");
      }
    }

    await sendChatMessageInternal({
      puzzleId,
      content: contentObj,
      sender: this.userId,
      pinTs: isPinned ? new Date() : null,
      parentId: parentId ?? null,
      attachments,
      comment,
    });
  },
});
