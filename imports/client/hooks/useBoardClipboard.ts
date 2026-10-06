import { Random } from "meteor/random";
import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Tags from "../../lib/models/Tags";
import WhiteboardEdges from "../../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import type { BoardClip } from "../../lib/whiteboard/clipboard";
import {
  clipFromText,
  clipText,
  copySelection,
  looksLikeClip,
  offsetToCentre,
  pasteClip,
  readClip,
  withoutOtherHuntsImages,
} from "../../lib/whiteboard/clipboard";
import { foldEnds, foldedInto } from "../../lib/whiteboard/collapse";
import { frameLabel } from "../../lib/whiteboard/layout";
import { MAX_BATCH } from "../../lib/whiteboard/limits";
import deleteWhiteboardNodes from "../../methods/deleteWhiteboardNodes";
import type { Commit } from "../components/whiteboard/boardWrites";
import { chunks } from "../components/whiteboard/boardWrites";
import { inDialog, isTyping } from "../components/whiteboard/canvasChrome";
import {
  DEFAULT_SIZES,
  DUPLICATE_OFFSET,
} from "../components/whiteboard/tools";
import type { ShowNotice } from "./useBoardNotices";
import { htmlIsOnlyImages, imageFiles } from "./useImageTool";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FrameRect {
  id: string;
  rect: Rect;
}

// Copying, pasting and duplicating what's on the board (see
// imports/lib/whiteboard/clipboard.ts): Ctrl+C, Ctrl+V and Ctrl+D while the
// board has focus, and the touch screen toolbar's buttons for them.
export default function useBoardClipboard({
  boardId,
  huntId,
  readOnly,
  canvasActive,
  nodes,
  edges,
  applySelection,
  frameRects,
  frameAt,
  isWithin,
  absoluteRect,
  commit,
  showNotice,
  lastPointer,
  paneCenter,
  addImages,
}: {
  boardId: string;
  huntId: string;
  readOnly: boolean;
  // Whether the board has focus (see useBoardFocus).
  canvasActive: RefObject<boolean>;
  // The board as React Flow has it, watched for what a paste made.
  nodes: WhiteboardFlowNode[];
  edges: WhiteboardFlowEdge[];
  // Selects just the nodes and lines that pass.
  applySelection: (
    wantNode: (node: WhiteboardFlowNode) => boolean,
    wantEdge: (edge: WhiteboardFlowEdge) => boolean,
  ) => void;
  // Where the frames are, which frame is under a point, what's inside what,
  // and a node's box, for where a paste lands.
  frameRects: () => FrameRect[];
  frameAt: (
    point: XYPosition,
    exclude: (id: string) => boolean,
    frames?: FrameRect[],
  ) => string | undefined;
  isWithin: (id: string, ancestorId: string) => boolean;
  absoluteRect: (id: string) => Rect | undefined;
  commit: Commit;
  showNotice: ShowNotice;
  // Where the pointer last was on screen while over the board itself, for
  // a paste to land at.
  lastPointer: RefObject<{ x: number; y: number } | undefined>;
  // The board point at the middle of the screen, where a paste lands
  // otherwise.
  paneCenter: () => XYPosition;
  // Uploads images and adds them centred on a point.
  addImages: (files: File[], centre: XYPosition) => void;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const readOnlyNow = useRef(readOnly);
  useEffect(() => {
    readOnlyNow.current = readOnly;
  }, [readOnly]);

  // What the selection copies, from the board as the client has it, so it
  // takes in what's folded away in a collapsed frame.
  const copyOfSelection = useCallback(() => {
    const selectedNodes = flow
      .getNodes()
      .filter((n) => n.selected)
      .map((n) => n.id);
    const selectedEdges = flow
      .getEdges()
      .filter((e) => e.selected)
      .map((e) => e.id);
    return copySelection(
      // Ink this viewer has hidden has no points here, and isn't copied.
      WhiteboardNodes.find({ board: boardId })
        .fetch()
        .filter((n) => n.type !== "ink" || n.points),
      WhiteboardEdges.find({ board: boardId }).fetch(),
      { nodes: selectedNodes, edges: selectedEdges },
      (frame) =>
        frameLabel(
          frame,
          frame.tag ? Tags.findOne(frame.tag)?.name : undefined,
        ),
    );
  }, [flow, boardId]);

  // The selection as a copy, saying when cards were left out of it; nothing
  // when there's nothing to copy, and why when that's because it's all cards.
  const takeCopy = useCallback(() => {
    const { clip, cards } = copyOfSelection();
    if (clip.nodes.length === 0) {
      if (cards > 0) {
        showNotice(
          t("whiteboard.clipboard.cards", "Puzzle cards can't be copied"),
        );
      }
      return undefined;
    }
    if (cards > 0) {
      showNotice(
        t("whiteboard.clipboard.cardsLeftOut", "Puzzle cards were left out"),
      );
    }
    return clip;
  }, [copyOfSelection, showNotice, t]);

  // What a paste or duplicate made, to select once it's on the board: the
  // nodes at the top of it (a frame carries what's in it) and its lines.
  const selectOnArrival = useRef<
    { nodes: Set<string>; edges: Set<string>; until: number } | undefined
  >(undefined);
  useEffect(() => {
    const wanted = selectOnArrival.current;
    if (!wanted) return;
    if (Date.now() > wanted.until) {
      selectOnArrival.current = undefined;
      return;
    }
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edgeIds = new Set(edges.map((e) => e.id));
    if (
      ![...wanted.nodes].every((id) => nodeIds.has(id)) ||
      ![...wanted.edges].every((id) => edgeIds.has(id))
    ) {
      return;
    }
    selectOnArrival.current = undefined;
    applySelection(
      (node) => wanted.nodes.has(node.id),
      (edge) => wanted.edges.has(edge.id),
    );
  }, [nodes, edges, applySelection]);

  // Puts a copy on the board moved by offset, with fresh ids, as one edit to
  // undo. Whatever is at the top of it goes into the frame a drop there
  // would, but never a collapsed or locked one, nor a frame it was copied
  // from or anything inside that. If any of it is refused, what got through
  // is taken off again.
  const pasteCopy = useCallback(
    (copied: BoardClip, offset: XYPosition) => {
      const { clip, leftOut } = withoutOtherHuntsImages(copied, huntId);
      if (leftOut > 0) {
        showNotice(
          t(
            "whiteboard.clipboard.otherHuntImages",
            "Images from another hunt were left out",
          ),
        );
      }
      const frames = frameRects();
      const copiedFrames = clip.nodes
        .filter((n) => n.type === "frame")
        .map((n) => n.id);
      const exclude = (frame: string) =>
        !!flow.getNode(frame)?.data.doc.locked ||
        copiedFrames.some((copied) => isWithin(frame, copied));
      const placeAt = (point: XYPosition) => {
        const id = frameAt(point, exclude, frames);
        const rect = id ? absoluteRect(id) : undefined;
        return id && rect ? { id, rect } : undefined;
      };
      const pasted = pasteClip(clip, offset, placeAt, () => Random.id());
      if (pasted.nodes.length === 0) return;
      const pastedIds = new Set(pasted.nodes.map((n) => n._id));
      // A line inside a pasted frame that's collapsed isn't drawn, so isn't
      // waited for.
      const folded = foldedInto(
        pasted.nodes.map((n) => ({
          _id: n._id,
          parent: n.parent ?? undefined,
          collapsed: n.collapsed,
        })),
        new Set(),
      );
      const wanted = {
        nodes: new Set(
          pasted.nodes
            .filter(
              (n) =>
                n.type !== "point" && !(n.parent && pastedIds.has(n.parent)),
            )
            .map((n) => n._id),
        ),
        edges: new Set(
          pasted.edges
            .filter((e) => foldEnds(e.source, e.target, folded) !== undefined)
            .map((e) => e._id),
        ),
        until: Date.now() + 10_000,
      };
      selectOnArrival.current = wanted;
      commit(
        { upsertNodes: pasted.nodes, upsertEdges: pasted.edges },
        {
          rollback: () => {
            if (selectOnArrival.current === wanted) {
              selectOnArrival.current = undefined;
            }
            chunks(
              pasted.nodes.map((n) => n._id),
              MAX_BATCH,
            ).forEach((nodeIds) =>
              deleteWhiteboardNodes.call({ boardId, nodeIds }),
            );
          },
        },
      );
    },
    [
      flow,
      frameRects,
      frameAt,
      isWithin,
      absoluteRect,
      boardId,
      huntId,
      commit,
      showNotice,
      t,
    ],
  );

  // Pastes text centred on `at`: a copy from a board, or text that becomes
  // a sticky note (or a text box, for a web address). Says whether there was
  // anything to paste.
  const pasteText = useCallback(
    (text: string, at: XYPosition) => {
      if (looksLikeClip(text)) {
        const clip = readClip(text);
        if (!clip) {
          showNotice(
            t(
              "whiteboard.clipboard.unreadable",
              "That copy can't be pasted here",
            ),
          );
          return true;
        }
        pasteCopy(clip, offsetToCentre(clip, at));
        return true;
      }
      const clip = clipFromText(text, DEFAULT_SIZES);
      if (!clip) return false;
      pasteCopy(clip, offsetToCentre(clip, at));
      return true;
    },
    [pasteCopy, showNotice, t],
  );

  // A paste lands centred on the pointer while it's over the board, and
  // otherwise on the middle of the screen.
  const pasteCentre = useCallback(
    () =>
      lastPointer.current
        ? flow.screenToFlowPosition(lastPointer.current)
        : paneCenter(),
    [flow, lastPointer, paneCenter],
  );

  // Ctrl+D (Cmd+D) and the Duplicate button copy the selection in place,
  // a little down and to the right, leaving the clipboard alone.
  const duplicateSelection = useCallback(() => {
    const clip = takeCopy();
    if (clip) pasteCopy(clip, DUPLICATE_OFFSET);
  }, [takeCopy, pasteCopy]);

  // Ctrl+C (Cmd+C) copies the selection, and Ctrl+V (Cmd+V) pastes, while
  // the board has focus, nothing is being typed and no text is selected.
  // Images on the clipboard, with no text beside them (or only an image's
  // HTML), are uploaded and added at the pointer (see addImages). Text that
  // isn't a copy from a board becomes a sticky note, or a text box if it's a
  // web address. Only for those who can edit.
  useEffect(() => {
    const forTheBoard = (event: ClipboardEvent) =>
      !readOnly &&
      canvasActive.current &&
      !isTyping(event.target) &&
      !inDialog(event.target) &&
      !event.defaultPrevented;
    const onCopy = (event: ClipboardEvent) => {
      if (!forTheBoard(event) || !event.clipboardData) return;
      if (document.getSelection()?.isCollapsed === false) return;
      const clip = takeCopy();
      if (!clip) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", clipText(clip));
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!forTheBoard(event) || !event.clipboardData) return;
      const text = event.clipboardData.getData("text/plain");
      if (looksLikeClip(text)) {
        event.preventDefault();
        pasteText(text, pasteCentre());
        return;
      }
      const images = imageFiles(event.clipboardData.files);
      if (
        images.length > 0 &&
        (!text.trim() ||
          htmlIsOnlyImages(event.clipboardData.getData("text/html")))
      ) {
        event.preventDefault();
        addImages(images, pasteCentre());
        return;
      }
      if (pasteText(text, pasteCentre())) event.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [readOnly, canvasActive, takeCopy, pasteText, pasteCentre, addImages]);

  // The touch screen toolbar's Copy and Paste, which go through the
  // Clipboard API, so only show where the browser has it. Paste takes a copy
  // from a board or text (not images) and puts it in the middle of the view.
  // (absent outside a secure context)
  const clipboard = navigator.clipboard as Clipboard | undefined;
  const canCopyByButton = typeof clipboard?.writeText === "function";
  const canPasteByButton = typeof clipboard?.readText === "function";
  const copyByButton = useCallback(() => {
    const clip = takeCopy();
    if (!clip) return;
    navigator.clipboard.writeText(clipText(clip)).catch(() => {
      showNotice(t("whiteboard.clipboard.copyFailed", "Couldn't copy that"));
    });
  }, [takeCopy, showNotice, t]);
  const pasteByButton = useCallback(() => {
    navigator.clipboard
      .readText()
      .then((text) => {
        // The browser can wait on the viewer to allow the paste, by when the
        // board may have gone read-only (a version opened, say).
        if (readOnlyNow.current) return;
        if (!pasteText(text, paneCenter())) {
          showNotice(
            t(
              "whiteboard.clipboard.nothing",
              "There's nothing on the clipboard to paste",
            ),
          );
        }
      })
      .catch(() => {
        showNotice(
          t("whiteboard.clipboard.pasteFailed", "Couldn't read the clipboard"),
        );
      });
  }, [pasteText, paneCenter, showNotice, t]);

  return {
    duplicateSelection,
    canCopyByButton,
    canPasteByButton,
    copyByButton,
    pasteByButton,
  };
}
