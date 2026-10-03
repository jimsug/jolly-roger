import type { ChatMessageContentType } from "./models/ChatMessages";
import nodeIsImage from "./nodeIsImage";
import nodeIsMention from "./nodeIsMention";
import nodeIsPuzzle from "./nodeIsPuzzle";
import nodeIsRoleMention from "./nodeIsRoleMention";
import nodeIsText from "./nodeIsText";

// Flattens a message to one line of text for places that can't render it
// (the ticker toasts shown while chat is minimised). Mentions and puzzle
// links are shown by name when the caller can resolve them.
export default function chatMessagePlainText(
  content: ChatMessageContentType,
  displayNames?: Map<string, string>,
  puzzleTitles?: Map<string, string>,
): string {
  return content.children
    .map((child) => {
      if (nodeIsText(child)) {
        return child.text;
      }
      if (nodeIsMention(child)) {
        return `@${displayNames?.get(child.userId) ?? "???"}`;
      }
      if (nodeIsRoleMention(child)) {
        return `@${child.roleId}`;
      }
      if (nodeIsPuzzle(child)) {
        return `[${puzzleTitles?.get(child.puzzleId) ?? "???"}]`;
      }
      if (nodeIsImage(child)) {
        return "🖼";
      }
      child satisfies never;
      return "";
    })
    .join("");
}
