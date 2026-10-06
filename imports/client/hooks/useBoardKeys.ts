import { useReactFlow } from "@xyflow/react";
import type React from "react";
import type { RefObject } from "react";
import { useEffect } from "react";
import type { WhiteboardStrokeWidth } from "../../lib/models/WhiteboardNodes";
import type { ThreadListRow } from "../../lib/whiteboard/comments";
import { nextUnread } from "../../lib/whiteboard/comments";
import type { SidePanelKind } from "../components/whiteboard/canvasChrome";
import { inDialog, isTyping } from "../components/whiteboard/canvasChrome";
import type { Tool } from "../components/whiteboard/tools";
import { PEN_WIDTH_KEYS, TOOLS_BY_KEY } from "../components/whiteboard/tools";
import useLatest from "./useLatest";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

// What the keys read and do on the canvas, as of the last render.
export interface BoardKeyHandlers {
  readOnly: boolean;
  canComment: boolean;
  tool: Tool;
  // What Escape closes, in order: the restore confirmation (which has its
  // own Escape), an open thread, the Comments list, a preview, History or
  // the Outline, and then the tool in use.
  confirmingRestore: boolean;
  openThreadId: string | undefined;
  commentListShown: boolean;
  preview: boolean;
  previewLoading: boolean;
  sidePanel: SidePanelKind | undefined;
  threadRows: ThreadListRow[];
  // What Ctrl+L would lock or unlock.
  lockSelection: { ids: string[] };
  setSidePanel: React.Dispatch<React.SetStateAction<SidePanelKind | undefined>>;
  dismissComment: () => void;
  backToNow: () => void;
  cancelTool: () => void;
  pickTool: (tool: Tool) => void;
  setPenWidth: (width: WhiteboardStrokeWidth) => void;
  setSteppedThread: (id: string | undefined) => void;
  focusComment: (threadId: string) => void;
  toggleLock: () => void;
  duplicateSelection: () => void;
  setTool: React.Dispatch<React.SetStateAction<Tool>>;
  selectAll: () => void;
  setEditOnAppear: React.Dispatch<React.SetStateAction<string | undefined>>;
  undo: () => void;
  redo: () => void;
}

// The board's keys (see docs/whiteboard.md, Keyboard): search, Escape, the
// tools' keys and pen widths, N, Ctrl+L, Ctrl+D, Ctrl+A, Enter on a note,
// undo and redo, and Space held to pan. The listeners are
// registered once and read the handlers as of the last render.
export default function useBoardKeys({
  wrapperRef,
  searchRef,
  canvasActive,
  spaceHeld,
  handlers,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  // Whether the board has focus (see useBoardFocus).
  canvasActive: RefObject<boolean>;
  // Set while Space is held, for the pointer handlers to pan instead.
  spaceHeld: RefObject<boolean>;
  handlers: BoardKeyHandlers;
}) {
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const latest = useLatest(handlers);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const {
        readOnly,
        canComment,
        tool,
        confirmingRestore,
        openThreadId,
        commentListShown,
        preview,
        previewLoading,
        sidePanel,
        threadRows,
        lockSelection,
        setSidePanel,
        dismissComment,
        backToNow,
        cancelTool,
        pickTool,
        setPenWidth,
        setSteppedThread,
        focusComment,
        toggleLock,
        duplicateSelection,
        setTool,
        selectAll,
        setEditOnAppear,
        undo,
        redo,
      } = latest.current;
      if (inDialog(event.target)) return;
      if (event.code === "Space") spaceHeld.current = true;
      // / or Ctrl+F searches the board while it has focus. Elsewhere, and
      // from the search field itself, Ctrl+F is the browser's find.
      const modified = event.ctrlKey || event.metaKey;
      // Ctrl+key (Cmd+key on a Mac) with no other modifier, while the board
      // can be edited and has focus and nothing is being typed.
      const chord = (key: string) =>
        modified &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === key &&
        !readOnly &&
        canvasActive.current &&
        !isTyping(event.target);
      const wantsSearch =
        (event.key === "/" &&
          !modified &&
          !event.altKey &&
          !isTyping(event.target)) ||
        (modified &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "f" &&
          event.target !== searchRef.current);
      if (wantsSearch && canvasActive.current && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
        return;
      }
      // Escape closes an open thread first, then the Comments list, then
      // leaves a preview, then closes History or the Outline (which also
      // closes itself on Escape from inside it); then it drops a comment being
      // started, a line being drawn or joined, or an erase, and goes back to
      // Select. The thread's panel closes itself on Escape from inside it,
      // and the restore confirmation does the same. An open Feeders popover
      // takes Escape before any of this (FeedersButton).
      if (event.key === "Escape" && !isTyping(event.target)) {
        if (confirmingRestore) return;
        if (openThreadId) {
          dismissComment();
          return;
        }
        if (commentListShown) {
          setSidePanel(undefined);
          return;
        }
        if (preview || previewLoading) {
          backToNow();
          return;
        }
        if (sidePanel === "history" || sidePanel === "outline") {
          setSidePanel(undefined);
          return;
        }
        cancelTool();
        return;
      }
      // A tool's key picks it, and 1 to 4 set the pen's width, while the
      // board has focus and nothing is being typed.
      if (
        !modified &&
        !event.altKey &&
        canvasActive.current &&
        !isTyping(event.target)
      ) {
        const key = event.key.toLowerCase();
        const keyTool = TOOLS_BY_KEY.get(key);
        if (keyTool && (keyTool === "comment" ? canComment : !readOnly)) {
          event.preventDefault();
          pickTool(keyTool);
          return;
        }
        const width = PEN_WIDTH_KEYS.get(key);
        if (width && !readOnly) {
          event.preventDefault();
          setPenWidth(width);
          return;
        }
        // N goes to the next thread with something unread, for anyone who
        // can see the board.
        if (key === "n") {
          const next = nextUnread(threadRows, openThreadId);
          if (next) {
            event.preventDefault();
            setSteppedThread(next);
            focusComment(next);
          }
          return;
        }
      }
      // Ctrl+L (Cmd+L) locks or unlocks the selection. With nothing
      // selected it's left to the browser.
      if (chord("l") && tool === "select" && lockSelection.ids.length > 0) {
        event.preventDefault();
        toggleLock();
        return;
      }
      // Ctrl+D (Cmd+D) duplicates the selection. With nothing selected or
      // another tool it's left to the browser.
      if (
        chord("d") &&
        tool === "select" &&
        (flow.getNodes().some((n) => n.selected) ||
          flow.getEdges().some((e) => e.selected))
      ) {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (chord("a")) {
        event.preventDefault();
        setTool("select");
        selectAll();
        return;
      }
      // Enter on a focused sticky or text box starts editing it, as a
      // double-click does. Held back from the note's new editor, where it
      // would start a new line.
      const note = event.target;
      if (
        event.key === "Enter" &&
        !readOnly &&
        tool === "select" &&
        note instanceof HTMLElement &&
        note.matches(".react-flow__node-sticky, .react-flow__node-text") &&
        wrapperRef.current?.contains(note) &&
        note.dataset.id &&
        !flow.getNode(note.dataset.id)?.data.doc.locked
      ) {
        event.preventDefault();
        setEditOnAppear(note.dataset.id);
        return;
      }
      // Ctrl+Z (Cmd+Z) undoes the viewer's own last edit, and Ctrl+Shift+Z
      // (Cmd+Shift+Z) or Ctrl+Y redoes it, while the board has focus and
      // nothing is being typed. Text being typed has the browser's own.
      if (
        !readOnly &&
        modified &&
        !event.altKey &&
        canvasActive.current &&
        !isTyping(event.target)
      ) {
        const key = event.key.toLowerCase();
        if (key === "z" || (key === "y" && event.ctrlKey && !event.shiftKey)) {
          event.preventDefault();
          if (key === "z" && !event.shiftKey) {
            undo();
          } else {
            redo();
          }
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [flow, latest, wrapperRef, searchRef, canvasActive, spaceHeld]);
}
