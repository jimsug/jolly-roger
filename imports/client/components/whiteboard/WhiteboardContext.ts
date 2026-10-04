import type { Meteor } from "meteor/meteor";
import type React from "react";
import { createContext, useContext } from "react";
import type { WhiteboardEdgeInput } from "../../../methods/upsertWhiteboardEdges";
import type { WhiteboardNodeInput } from "../../../methods/upsertWhiteboardNodes";

// What the board's nodes and lines need from the canvas.
export interface WhiteboardActions {
  readOnly: boolean;
  // Read-only only because the screen is phone-sized (compact, see
  // WhiteboardPage). The server still takes this viewer's edits, so text
  // being typed when the screen becomes compact is saved.
  readOnlyForLayout: boolean;
  // A phone-sized screen, where the board can only be looked at and
  // commented on, with bigger targets for fingers.
  compact: boolean;
  // Each saves through its method and reports a refusal on the board;
  // onDone hears whether it was refused, once every batch is back.
  updateNodes: (
    inputs: WhiteboardNodeInput[],
    onDone?: (error?: Meteor.Error) => void,
  ) => void;
  updateEdge: (
    input: WhiteboardEdgeInput,
    onDone?: (error?: Meteor.Error) => void,
  ) => void;
  // Persists a node's size and position, and its children's positions, after
  // a resize (resizing from the top or left moves the origin).
  persistResize: (id: string) => void;
  // Starts dragging one end of a line, from its grip.
  beginEndpointDrag: (
    edgeId: string,
    end: "source" | "target",
    event: React.PointerEvent,
  ) => void;
  // A node that should open for editing as soon as it's showing: one this
  // client has just placed, or a note someone pressed Enter on.
  editOnAppear: string | undefined;
  clearEditOnAppear: () => void;
}

const WhiteboardContext = createContext<WhiteboardActions | undefined>(
  undefined,
);

export function useWhiteboard(): WhiteboardActions {
  const value = useContext(WhiteboardContext);
  if (!value) {
    throw new Error("useWhiteboard must be used inside a whiteboard");
  }
  return value;
}

export default WhiteboardContext;
