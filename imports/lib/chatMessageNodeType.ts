import type { ChatMessageContentNodeType } from "./models/ChatMessages";

export default function chatMessageNodeType(
  node: ChatMessageContentNodeType,
): "text" | "mention" | "role-mention" | "image" | "puzzle" {
  return "type" in node ? node.type : "text";
}
