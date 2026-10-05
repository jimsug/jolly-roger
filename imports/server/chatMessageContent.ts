import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { ChatMessageContentType } from "../lib/models/ChatMessages";
import Puzzles from "../lib/models/Puzzles";
import nodeIsPuzzle from "../lib/nodeIsPuzzle";

// Message content as a client sends it (a JSON string), checked the same way
// whether it's a new message or an edit.
export function parseChatMessageContent(
  content: string,
): ChatMessageContentType {
  const contentObj: unknown = JSON.parse(content);
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
  return contentObj;
}

// Puzzle links must point at puzzles in the message's own hunt.
export async function assertPuzzleLinksInHunt(
  content: ChatMessageContentType,
  huntId: string,
) {
  const mentionedPuzzles = content.children
    .filter(nodeIsPuzzle)
    .map((child) => child.puzzleId);
  if (mentionedPuzzles.length === 0) {
    return;
  }
  const known = new Set(
    await Puzzles.find(
      { _id: { $in: mentionedPuzzles }, hunt: huntId },
      { projection: { _id: 1 } },
    ).mapAsync((p) => p._id),
  );
  const unknown = mentionedPuzzles.find((id) => !known.has(id));
  if (unknown !== undefined) {
    throw new Meteor.Error(400, `Puzzle ${unknown} is not in hunt ${huntId}`);
  }
}
