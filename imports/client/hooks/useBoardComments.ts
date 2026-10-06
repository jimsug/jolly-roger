import { useTracker } from "meteor/react-meteor-data";
import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessageCommentAnchorType } from "../../lib/models/ChatMessages";
import {
  commentPosition,
  isUnread,
  threadList,
} from "../../lib/whiteboard/comments";
import { contains } from "../../lib/whiteboard/connectors";
import { round1 } from "../../lib/whiteboard/ink";
import type { CommentPin } from "../components/whiteboard/CommentLayer";
import type { SidePanelKind } from "../components/whiteboard/canvasChrome";
import { PULSE_MS } from "../components/whiteboard/canvasChrome";
import describeCommentTarget from "../components/whiteboard/describeCommentTarget";
import { useWhiteboardShowResolvedComments } from "./persisted-state";
import type { Rect } from "./useBoardGeometry";
import useTimedValue from "./useTimedValue";
import useWhiteboardComments, {
  useSeenComments,
} from "./useWhiteboardComments";
import type {
  WhiteboardFlowEdge,
  WhiteboardFlowNode,
} from "./useWhiteboardSync";

// How far below the middle of the screen (as a share of the board's height)
// the board centres on a pin on a phone, so the pin sits above the comment
// sheet.
const SHEET_OFFSET = 0.3;

// The board's comments (see docs/whiteboard.md, Comments): the threads and
// their pins, the list the Comments panel shows, the thread open in its
// panel, and a comment being started.
export default function useBoardComments({
  boardId,
  puzzleId,
  compact,
  wrapperRef,
  selfId,
  absoluteRect,
  closePanel,
}: {
  boardId: string;
  // The board's backing puzzle, whose chat holds the comments.
  puzzleId: string;
  compact: boolean;
  wrapperRef: RefObject<HTMLDivElement | null>;
  selfId: string | undefined;
  absoluteRect: (id: string) => Rect | undefined;
  // Closes a side panel, if it's the one open.
  closePanel: (panel: SidePanelKind) => void;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow<WhiteboardFlowNode, WhiteboardFlowEdge>();
  const threads = useWhiteboardComments(puzzleId);
  const [seenComments, markCommentSeen] = useSeenComments(boardId, threads);
  const [showResolved, setShowResolved] = useWhiteboardShowResolvedComments();
  // A pin marked for a moment after the board pans to it.
  const [pulse, pulseComment] = useTimedValue<string>(PULSE_MS);
  const [openThread, setOpenThread] = useState<string>();
  const [draft, setDraft] = useState<ChatMessageCommentAnchorType>();
  // The thread N last went to, whose panel takes focus itself rather than
  // giving it to the composer, so that N goes on to the next one.
  const [steppedThread, setSteppedThread] = useState<string>();
  // A comment just sent, to open once it comes back from the server.
  const sentDraft = useRef<
    { anchor: ChatMessageCommentAnchorType; at: number } | undefined
  >(undefined);

  // The threads the Comments panel lists, and N steps through, leaving
  // resolved ones out unless they're being shown, as the pins do.
  const threadRows = useMemo(
    () =>
      threadList(threads.values(), {
        seen: seenComments,
        selfId,
        showResolved,
      }),
    [threads, seenComments, selfId, showResolved],
  );
  const unreadCount = useMemo(
    () => threadRows.filter((row) => row.unread).length,
    [threadRows],
  );
  const resolvedCount = useMemo(
    () => [...threads.values()].filter((t) => t.resolved).length,
    [threads],
  );

  // A thread that has gone (deleted, say) counts as closed.
  const openThreadData = openThread ? threads.get(openThread) : undefined;
  const openThreadId = openThreadData?.root._id;

  // A comment goes on the topmost thing under it (anything but ink and line
  // ends), so it moves with it; otherwise it's pinned to the board.
  const commentAnchorAt = useCallback(
    (point: XYPosition): ChatMessageCommentAnchorType => {
      let best:
        | {
            id: string;
            z: number;
            order: number;
            rect: { x: number; y: number };
          }
        | undefined;
      flow.getNodes().forEach((n, order) => {
        if (n.type === "point" || n.type === "ink" || n.hidden) return;
        const rect = absoluteRect(n.id);
        if (!rect || !contains(rect, point)) return;
        const z = flow.getInternalNode(n.id)?.internals.z ?? 0;
        if (!best || z > best.z || (z === best.z && order > best.order)) {
          best = { id: n.id, z, order, rect };
        }
      });
      return best
        ? {
            node: best.id,
            x: round1(point.x - best.rect.x),
            y: round1(point.y - best.rect.y),
          }
        : { x: round1(point.x), y: round1(point.y) };
    },
    [flow, absoluteRect],
  );

  // Brings a pin to the middle of the screen at the given zoom or, on a
  // phone, to the middle of the part above the comment sheet.
  const panToPin = useCallback(
    (at: XYPosition, zoom: number) => {
      const height = compact ? (wrapperRef.current?.clientHeight ?? 0) : 0;
      void flow.setCenter(at.x, at.y + (SHEET_OFFSET * height) / zoom, {
        zoom,
        duration: 400,
      });
    },
    [flow, compact, wrapperRef],
  );

  const openComment = useCallback(
    (id: string) => {
      if (id === "draft") return;
      setOpenThread(id);
      setSteppedThread(undefined);
      setDraft(undefined);
      closePanel("hidden");
      if (!compact) return;
      const anchor = threads.get(id)?.root.comment;
      const at =
        anchor &&
        commentPosition(
          anchor,
          anchor.node ? absoluteRect(anchor.node) : undefined,
        );
      if (at) panToPin(at, flow.getZoom());
    },
    [closePanel, compact, threads, absoluteRect, panToPin, flow],
  );

  const closeComment = useCallback(() => {
    setOpenThread(undefined);
    setSteppedThread(undefined);
    setDraft(undefined);
  }, []);

  // Closing a thread from its panel (Close, or Escape) puts focus back on
  // its pin, if the pin is still showing. Deleting it puts focus on what it
  // was on instead, since the pin goes with it.
  const refocusAfterThread = useRef<string | undefined>(undefined);
  const dismissComment = useCallback(() => {
    refocusAfterThread.current =
      openThreadId &&
      `.jr-comment-pin[data-thread="${CSS.escape(openThreadId)}"]`;
    closeComment();
  }, [openThreadId, closeComment]);
  const openThreadNode = openThreadData?.root.comment?.node;
  const closeDeletedComment = useCallback(() => {
    refocusAfterThread.current =
      openThreadNode &&
      `.react-flow__node[data-id="${CSS.escape(openThreadNode)}"]`;
    closeComment();
  }, [openThreadNode, closeComment]);
  useEffect(() => {
    const selector = refocusAfterThread.current;
    if (!selector || openThreadId) return;
    refocusAfterThread.current = undefined;
    wrapperRef.current
      ?.querySelector<HTMLElement>(selector)
      ?.focus({ preventScroll: true });
  }, [openThreadId, wrapperRef]);

  // Starts a comment at a point on the board, in place of any open thread.
  const startDraft = useCallback(
    (point: XYPosition) => {
      setDraft(commentAnchorAt(point));
      setOpenThread(undefined);
      closePanel("hidden");
      if (compact) panToPin(point, flow.getZoom());
    },
    [commentAnchorAt, closePanel, compact, panToPin, flow],
  );
  const clearDraft = useCallback(() => setDraft(undefined), []);

  const onDraftSent = useCallback(
    (sentAt: Date) => {
      if (draft) sentDraft.current = { anchor: draft, at: +sentAt };
      setDraft(undefined);
    },
    [draft],
  );

  // Open a comment we've just left as soon as it's saved, unless something
  // else has been opened since.
  useEffect(() => {
    const sent = sentDraft.current;
    if (!sent) return;
    if (draft || openThreadId) {
      sentDraft.current = undefined;
      return;
    }
    const same = (a: number, b: number) => Math.abs(a - b) < 0.5;
    const match = [...threads.values()].find((t) => {
      const c = t.root.comment;
      return (
        c &&
        t.root.sender === selfId &&
        +t.root.timestamp >= sent.at - 60_000 &&
        c.node === sent.anchor.node &&
        same(c.x, sent.anchor.x) &&
        same(c.y, sent.anchor.y)
      );
    });
    if (match) {
      sentDraft.current = undefined;
      setOpenThread(match.root._id);
    }
  }, [threads, selfId, draft, openThreadId]);

  useEffect(() => {
    if (openThreadData) {
      markCommentSeen(openThreadData.root._id, +openThreadData.lastActivity);
    }
  }, [openThreadData, markCommentSeen]);

  // Pans to a comment and opens it, if it's on the board, and says whether
  // it was.
  const showComment = useCallback(
    (threadId: string) => {
      const anchor = threads.get(threadId)?.root.comment;
      if (!anchor) return false;
      const at = commentPosition(
        anchor,
        anchor.node ? absoluteRect(anchor.node) : undefined,
      );
      if (!at) return false;
      closePanel("hidden");
      setDraft(undefined);
      setOpenThread(threadId);
      panToPin(at, Math.max(flow.getZoom(), 0.8));
      pulseComment(threadId);
      return true;
    },
    [threads, absoluteRect, panToPin, flow, closePanel, pulseComment],
  );

  const commentPins = useMemo(() => {
    const pins: CommentPin[] = [];
    threads.forEach((thread) => {
      const id = thread.root._id;
      if (
        thread.resolved &&
        !showResolved &&
        id !== openThreadId &&
        id !== pulse
      ) {
        return;
      }
      pins.push({
        id,
        anchor: thread.root.comment!,
        author: thread.root.sender,
        replies: thread.replyCount,
        unread: isUnread(thread, seenComments[id], selfId),
        resolved: thread.resolved,
      });
    });
    if (draft) {
      pins.push({
        id: "draft",
        anchor: draft,
        replies: 0,
        unread: false,
        resolved: false,
        draft: true,
      });
    }
    return pins;
  }, [threads, showResolved, openThreadId, pulse, seenComments, selfId, draft]);

  // What the open thread, or the comment being started, is on, in words.
  const commentTarget = useTracker(
    () =>
      describeCommentTarget(
        draft ? draft.node : openThreadData?.root.comment?.node,
        t,
      ),
    [draft, openThreadData?.root.comment?.node, t],
  );

  const toggleShowResolved = useCallback(
    () => setShowResolved((current) => !current),
    [setShowResolved],
  );

  return {
    threads,
    threadRows,
    unreadCount,
    resolvedCount,
    showResolved,
    toggleShowResolved,
    openThreadData,
    openThreadId,
    steppedThread,
    setSteppedThread,
    draft,
    clearDraft,
    startDraft,
    onDraftSent,
    // The pin marked for a moment after the board panned to it.
    pulse,
    commentPins,
    commentTarget,
    commentAnchorAt,
    openComment,
    closeComment,
    dismissComment,
    closeDeletedComment,
    showComment,
  };
}
