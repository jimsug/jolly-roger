import type { ChatMessageType } from "./models/ChatMessages";
import nodeIsText from "./nodeIsText";

type NeededChatFields = "content" | "parentId";
type PartialChatMessageType = Pick<ChatMessageType, NeededChatFields>;

// Anything made only of emoji: pictographs, flags (pairs of regional
// indicators), skin tone modifiers, keycaps and the joiners and variation
// selectors that build sequences out of them.
const EMOJI_ONLY =
  /^[\p{Emoji}\p{Extended_Pictographic}\p{Emoji_Component}]+$/u;
// Digits, # and * count as Emoji, so an all-emoji string must also hold
// something that reads as an emoji on its own (or a keycap mark, which turns
// a digit into one).
const HAS_EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;

// A reaction is stored as an ordinary chat message whose parent is the message
// reacted to and whose only content is an emoji. The chat history hides them
// and shows them as pills on the parent instead.
export default function isReaction(message: PartialChatMessageType): boolean {
  if (!message.parentId) {
    return false;
  }
  const { children } = message.content;
  if (children.length !== 1) {
    return false;
  }
  const child = children[0]!;
  if (!nodeIsText(child)) {
    return false;
  }
  const text = child.text.trim();
  return text !== "" && EMOJI_ONLY.test(text) && HAS_EMOJI.test(text);
}

// The emoji a reaction carries, trimmed so the same emoji from different
// clients counts as one.
export function reactionEmoji(message: PartialChatMessageType): string {
  const child = message.content.children[0];
  return child && nodeIsText(child) ? child.text.trim() : "";
}
