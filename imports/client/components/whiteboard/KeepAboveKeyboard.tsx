import { useReactFlow, useStore } from "@xyflow/react";
import { useEffect } from "react";
import useKeyboardInset from "../../hooks/useKeyboardInset";

// Room left between a note being typed in and the on-screen keyboard.
const KEYBOARD_GAP = 16;

// While a note is being typed in on a touch screen, pans the board up when
// the on-screen keyboard would cover the note, as far as its top can go
// without leaving the board.
const KeepAboveKeyboard = ({ nodeId }: { nodeId: string }) => {
  const { inset } = useKeyboardInset();
  const flow = useReactFlow();
  const domNode = useStore((s) => s.domNode);
  useEffect(() => {
    if (inset <= 0 || !domNode) return;
    const element = domNode.querySelector(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`,
    );
    if (!element) return;
    const box = element.getBoundingClientRect();
    const board = domNode.getBoundingClientRect();
    const clearOf = window.innerHeight - inset - KEYBOARD_GAP;
    const by = Math.min(box.bottom - clearOf, box.top - board.top);
    if (by <= 0) return;
    const { x, y, zoom } = flow.getViewport();
    void flow.setViewport({ x, y: y - by, zoom }, { duration: 200 });
  }, [inset, nodeId, domNode, flow]);
  return null;
};

export default KeepAboveKeyboard;
