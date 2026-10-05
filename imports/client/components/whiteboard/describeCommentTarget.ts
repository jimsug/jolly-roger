import type { TFunction } from "i18next";
import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import WhiteboardNodes from "../../../lib/models/WhiteboardNodes";
import { frameLabel } from "../../../lib/whiteboard/layout";

const SNIPPET_LENGTH = 40;

// The first line of a note with its markdown stripped, shortened.
function snippet(text: string | undefined, t: TFunction): string | undefined {
  const line = text
    ?.split("\n")
    .map((l) =>
      l
        .replaceAll(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
        .replaceAll(/[#>*_`~]/g, "")
        .trim(),
    )
    .find((l) => l.length > 0);
  if (!line) return undefined;
  return t("whiteboard.commentTarget.snippet", "“{{text}}”", {
    text:
      line.length > SNIPPET_LENGTH
        ? `${line.slice(0, SNIPPET_LENGTH - 1)}…`
        : line,
    // React escapes text, so i18next's escaping would only show entities.
    // Goes once both i18n inits stop escaping.
    interpolation: { escapeValue: false },
  });
}

// What a comment is on, for its panel header and its chat message. Reads
// Minimongo, so call it inside a tracker.
export default function describeCommentTarget(
  nodeId: string | undefined,
  t: TFunction,
): string {
  const board = t("whiteboard.commentTarget.board", "the board");
  if (!nodeId) return board;
  const node = WhiteboardNodes.findOne(nodeId);
  if (!node || node.hidden) {
    return t(
      "whiteboard.commentTarget.gone",
      "something no longer on the board",
    );
  }
  switch (node.type) {
    case "puzzle":
      return (
        (node.puzzle && Puzzles.findOne(node.puzzle)?.title) ??
        t("whiteboard.commentTarget.puzzle", "a puzzle")
      );
    case "frame":
      return (
        frameLabel(node, node.tag ? Tags.findOne(node.tag)?.name : undefined) ??
        t("whiteboard.commentTarget.frame", "a frame")
      );
    case "sticky":
      return (
        snippet(node.text, t) ??
        t("whiteboard.commentTarget.sticky", "a sticky")
      );
    case "text":
      return (
        snippet(node.text, t) ??
        t("whiteboard.commentTarget.text", "a text box")
      );
    case "image":
      return t("whiteboard.commentTarget.image", "an image");
    case "shape":
      return node.shape === "ellipse"
        ? t("whiteboard.commentTarget.ellipse", "an ellipse")
        : t("whiteboard.commentTarget.rect", "a rectangle");
    case "ink":
    case "point":
      // The server doesn't let comments go on these.
      return board;
    default:
      node.type satisfies never;
      return board;
  }
}
