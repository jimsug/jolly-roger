import type { Box } from "../../../lib/whiteboard/frameTools";
import type { WhiteboardFlowNode } from "../../hooks/useWhiteboardSync";

// A node's box in its frame, for the frame tools. A collapsed frame counts
// at its stored size, not the header it's drawn as. A shape counts as
// background, which Tidy lays cards over rather than going round.
export default function frameToolBox(n: WhiteboardFlowNode): Box {
  const { doc } = n.data;
  return {
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    width: n.measured?.width ?? n.width ?? doc.width ?? 0,
    height: n.data.collapsed
      ? (doc.height ?? 0)
      : (n.measured?.height ?? n.height ?? doc.height ?? 0),
    locked: !!doc.locked,
    ...(n.type === "shape" ? { background: true } : {}),
  };
}
