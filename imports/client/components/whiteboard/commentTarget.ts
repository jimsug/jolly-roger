import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import WhiteboardNodes from "../../../lib/models/WhiteboardNodes";
import {
  frameLabelForTag,
  UNGROUPED_LABEL,
} from "../../../lib/whiteboard/layout";

const SNIPPET_LENGTH = 40;

function snippet(text: string | undefined): string | undefined {
  const line = text
    ?.split("\n")
    .map((l) =>
      l
        .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
        .replace(/[#>*_`~]/g, "")
        .trim(),
    )
    .find((l) => l.length > 0);
  if (!line) return undefined;
  return line.length > SNIPPET_LENGTH
    ? `“${line.slice(0, SNIPPET_LENGTH - 1)}…”`
    : `“${line}”`;
}

// What a comment is on, for its panel header and its chat message. Reads
// Minimongo, so call it inside a tracker.
export default function describeCommentTarget(nodeId: string | undefined) {
  if (!nodeId) return "the board";
  const node = WhiteboardNodes.findOne(nodeId);
  if (!node || node.hidden) return "something no longer on the board";
  switch (node.type) {
    case "puzzle":
      return (node.puzzle && Puzzles.findOne(node.puzzle)?.title) ?? "a puzzle";
    case "frame": {
      const tag = node.tag ? Tags.findOne(node.tag) : undefined;
      if (tag) return frameLabelForTag(tag);
      if (node.label) return node.label;
      return node.frameKind === "ungrouped" ? UNGROUPED_LABEL : "a frame";
    }
    case "sticky":
      return snippet(node.text) ?? "a sticky";
    case "text":
      return snippet(node.text) ?? "a text box";
    case "ink":
      return "a drawing";
    default:
      return "the board";
  }
}
