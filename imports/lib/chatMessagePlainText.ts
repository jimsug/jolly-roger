import type { TFunction } from "i18next";
import type { ChatMessageContentType } from "./models/ChatMessages";
import nodeIsImage from "./nodeIsImage";
import nodeIsMention from "./nodeIsMention";
import nodeIsPuzzle from "./nodeIsPuzzle";
import nodeIsRoleMention from "./nodeIsRoleMention";
import nodeIsText from "./nodeIsText";

// How a message flattens: where mentioned names and linked titles come from
// (anything they can't find reads as ???), whether mentions are padded with
// a space either side, what an image and a puzzle link become, and what goes
// between nodes.
type FlattenOptions = {
  displayName: (userId: string) => string | undefined;
  puzzleTitle: (puzzleId: string) => string | undefined;
  spacedMentions: boolean;
  image: string;
  puzzleLink: (title: string) => string;
  separator: string;
};

function flatten(
  content: ChatMessageContentType,
  {
    displayName,
    puzzleTitle,
    spacedMentions,
    image,
    puzzleLink,
    separator,
  }: FlattenOptions,
): string {
  const mention = (name: string) =>
    spacedMentions ? ` @${name} ` : `@${name}`;
  return content.children
    .map((child) => {
      if (nodeIsText(child)) {
        return child.text;
      }
      if (nodeIsMention(child)) {
        return mention(displayName(child.userId) ?? "???");
      }
      if (nodeIsRoleMention(child)) {
        return mention(child.roleId);
      }
      if (nodeIsPuzzle(child)) {
        return puzzleLink(puzzleTitle(child.puzzleId) ?? "???");
      }
      if (nodeIsImage(child)) {
        return image;
      }
      child satisfies never;
      return "";
    })
    .join(separator);
}

// Flattens a message to one line of text for places that can't render it
// (the ticker toasts shown while chat is minimised). Mentions and puzzle
// links are shown by name when the caller can resolve them.
export default function chatMessagePlainText(
  content: ChatMessageContentType,
  displayNames?: Map<string, string>,
  puzzleTitles?: Map<string, string>,
): string {
  return flatten(content, {
    displayName: (userId) => displayNames?.get(userId),
    puzzleTitle: (puzzleId) => puzzleTitles?.get(puzzleId),
    spacedMentions: false,
    image: "🖼",
    puzzleLink: (title) => `[${title}]`,
    separator: "",
  });
}

// The firehose's looser form, which it also searches: mentions spaced out,
// images and puzzle links labelled, and a space between nodes.
export function firehosePlainText(
  content: ChatMessageContentType,
  displayNames: Map<string, string>,
  puzzles: ReadonlyMap<string, { title: string }>,
  t: TFunction,
): string {
  return flatten(content, {
    displayName: (userId) => displayNames.get(userId),
    puzzleTitle: (puzzleId) => puzzles.get(puzzleId)?.title,
    spacedMentions: true,
    image: "[image]",
    puzzleLink: (title) =>
      t("chat.firehose.puzzleLink", "[puzzle: {{title}}]", {
        title,
        // The text lands in a text node (and the firehose search), so HTML
        // escaping would only show entities; this goes once both i18n inits
        // turn escapeValue off
        interpolation: { escapeValue: false },
      }),
    separator: " ",
  });
}
