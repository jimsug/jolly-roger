import type { Descendant } from "slate";
import nodeIsImage from "../lib/nodeIsImage";
import nodeIsMention from "../lib/nodeIsMention";
import nodeIsPuzzle from "../lib/nodeIsPuzzle";
import nodeIsRoleMention from "../lib/nodeIsRoleMention";
import nodeIsText from "../lib/nodeIsText";
import type { MessageElement } from "./components/FancyEditor";

// Turns what's in a chat editor into a message to send, shared by puzzle chat
// and whiteboard comments so both send the same thing.

// A new value each time: Slate maps each node object to the one editor
// showing it, so two editors open at once (chat and a whiteboard comment)
// mustn't start from the same objects.
export const emptyEditorContent = (): Descendant[] => [
  {
    type: "message",
    children: [{ text: "" }],
  },
];

const children = (content: Descendant[]) =>
  content.length > 0 ? (content[0]! as MessageElement).children : [];

// A failed image doesn't count, since cleanEditorMessage drops it; one still
// uploading does, and hasLoadingImage holds the send back until it's done.
export function hasSendableContent(content: Descendant[]): boolean {
  return children(content).some(
    (child) =>
      (nodeIsImage(child) && child.status !== "error") ||
      nodeIsMention(child) ||
      nodeIsRoleMention(child) ||
      nodeIsPuzzle(child) ||
      (nodeIsText(child) && child.text.trim().length > 0),
  );
}

export function hasLoadingImage(content: Descendant[]): boolean {
  return children(content).some(
    (child) => nodeIsImage(child) && child.status === "loading",
  );
}

// The editor holds one block of type "message". Keep only what the server
// needs: mention, puzzle and image elements lose their Slate children, and
// failed images and empty text go.
export function cleanEditorMessage(content: Descendant[]) {
  const message = content[0]! as MessageElement;
  return {
    type: message.type,
    children: message.children
      .filter((child) => {
        if (
          nodeIsMention(child) ||
          nodeIsRoleMention(child) ||
          nodeIsPuzzle(child)
        ) {
          return true;
        }
        if (nodeIsImage(child) && child.status !== "success") return false;
        if (nodeIsText(child) && child.text === "") return false;
        return true;
      })
      .map((child) => {
        if (nodeIsMention(child)) {
          return { type: child.type, userId: child.userId };
        }
        if (nodeIsRoleMention(child)) {
          return { type: child.type, roleId: child.roleId };
        }
        if (nodeIsImage(child)) {
          return { type: child.type, url: child.url };
        }
        if (nodeIsPuzzle(child)) {
          return { type: child.type, puzzleId: child.puzzleId };
        }
        return child;
      }),
  };
}
