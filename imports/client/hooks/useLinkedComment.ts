import { useReactFlow } from "@xyflow/react";
import type React from "react";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import ChatLoadedContext from "../components/whiteboard/ChatLoadedContext";
import type { ShowNotice } from "./useBoardNotices";
import type useWhiteboardComments from "./useWhiteboardComments";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

// A comment asked for before the board has its nodes laid out, or before
// the thread has reached this client, is shown as soon as both are ready.
// One from the page's ?comment= link waits the same way, each time the link
// changes, and so does one the board's chat asks for (focusRef).
export default function useLinkedComment({
  initialComment,
  onInitialCommentShown,
  focusRef,
  boardLoaded,
  livePuzzleIds,
  threads,
  nodes,
  peekAround,
  showComment,
  showNotice,
}: {
  initialComment: string | undefined;
  onInitialCommentShown: (() => void) | undefined;
  // Set to the way of showing a comment, for the board's chat.
  focusRef: React.RefObject<((threadId: string) => void) | undefined>;
  boardLoaded: boolean;
  livePuzzleIds: Set<string>;
  threads: ReturnType<typeof useWhiteboardComments>;
  // The board as React Flow has it; the effect re-runs as it's laid out.
  nodes: WhiteboardFlowNode[];
  // Opens the collapsed frames around a node for this viewer, and says
  // whether there were any.
  peekAround: (nodeId: string) => boolean;
  // Pans to a comment and opens it, if it's on the board.
  showComment: (threadId: string) => boolean;
  showNotice: ShowNotice;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  // Once the board's chat has loaded, a thread that isn't in it is gone.
  const commentsLoaded = useContext(ChatLoadedContext);

  const [pendingFocus, setPendingFocus] = useState(initialComment);
  const [linkedComment, setLinkedComment] = useState(initialComment);
  if (initialComment !== linkedComment) {
    setLinkedComment(initialComment);
    if (initialComment) setPendingFocus(initialComment);
  }
  const readyToShow = useCallback(
    (threadId: string) => {
      const anchor = threads.get(threadId)?.root.comment;
      if (!anchor) return false;
      if (!anchor.node) return true;
      if (!boardLoaded) return false;
      // Once loaded, a comment on something that isn't on the board (gone,
      // hidden, or a card whose puzzle has gone) is as ready as it will ever
      // be, and showComment then leaves it. Anything else waits to be laid
      // out, and inside a collapsed frame for pendingFocus's effect to open
      // the frame.
      const doc = WhiteboardNodes.findOne(anchor.node);
      const onBoard =
        !!doc &&
        !doc.hidden &&
        (doc.type !== "puzzle" ||
          (!!doc.puzzle && livePuzzleIds.has(doc.puzzle)));
      return !onBoard || !!flow.getInternalNode(anchor.node);
    },
    [threads, boardLoaded, flow, livePuzzleIds],
  );

  const focusComment = useCallback(
    (threadId: string) => {
      if (readyToShow(threadId)) showComment(threadId);
      else setPendingFocus(threadId);
    },
    [readyToShow, showComment],
  );

  // React Flow takes in new nodes before this component's effects run, so
  // this is rechecked whenever they change.
  useEffect(() => {
    if (!pendingFocus) return;
    if (commentsLoaded && !threads.has(pendingFocus)) {
      setPendingFocus(undefined);
      showNotice(t("whiteboard.link.commentGone", "That comment is gone."));
      if (pendingFocus === initialComment) onInitialCommentShown?.();
      return;
    }
    // A comment inside a collapsed frame opens the frame for this viewer
    // first, so it's seen in place.
    const anchorNode = threads.get(pendingFocus)?.root.comment?.node;
    if (boardLoaded && anchorNode && peekAround(anchorNode)) return;
    if (!readyToShow(pendingFocus)) return;
    setPendingFocus(undefined);
    if (!showComment(pendingFocus)) {
      // What the comment was on has been hidden or deleted.
      showNotice(
        t("whiteboard.link.nodeGone", "That isn't on the board any more."),
      );
    }
    if (pendingFocus === initialComment) onInitialCommentShown?.();
  }, [
    pendingFocus,
    commentsLoaded,
    threads,
    boardLoaded,
    peekAround,
    readyToShow,
    showComment,
    showNotice,
    t,
    initialComment,
    onInitialCommentShown,
    nodes,
  ]);

  useEffect(() => {
    focusRef.current = focusComment;
    return () => {
      focusRef.current = undefined;
    };
  }, [focusRef, focusComment]);

  return focusComment;
}
