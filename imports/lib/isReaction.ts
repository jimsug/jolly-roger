import type { ChatMessageContentType } from "./models/ChatMessages";
import nodeIsText from "./nodeIsText";

// Reactions are ordinary replies whose only content is a single text node
// that starts with an emoji.
export default function isReaction(message: {
  content?: ChatMessageContentType;
}): boolean {
  const children = message.content?.children;
  const first = children?.[0];
  return (
    children?.length === 1 &&
    first !== undefined &&
    nodeIsText(first) &&
    /^\p{Extended_Pictographic}/u.test(first.text)
  );
}
