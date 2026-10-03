import type {
  ChatMessageContentNodeType,
  ChatMessagePuzzleNodeType,
} from "./models/ChatMessages";

export default function nodeIsPuzzle(
  node: ChatMessageContentNodeType,
): node is ChatMessagePuzzleNodeType {
  return "type" in node && node.type === "puzzle";
}
