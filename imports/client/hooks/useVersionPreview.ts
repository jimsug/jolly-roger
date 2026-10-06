import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import WhiteboardEdges from "../../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import type { WhiteboardVersionType } from "../../lib/models/WhiteboardVersions";
import type {
  WhiteboardAccess,
  WhiteboardAccessReason,
} from "../../lib/permission_stubs";
import { versionDifferences } from "../../lib/whiteboard/versions";
import restoreWhiteboardItems from "../../methods/restoreWhiteboardItems";
import restoreWhiteboardVersion from "../../methods/restoreWhiteboardVersion";
import { NO_ESCAPE } from "../components/whiteboard/canvasChrome";
import type { VersionPreview } from "../components/whiteboard/HistoryPanel";
import {
  loadVersion,
  versionMoment,
} from "../components/whiteboard/HistoryPanel";
import type { ReportRefusal, ShowNotice } from "./useBoardNotices";

const NO_CHANGES: ReadonlySet<string> = new Set();

// An earlier version of the board being looked at (see docs/whiteboard.md,
// History): fetching it, what it has differently from the board as it is
// now, and restoring it, whole or one item of it.
export default function useVersionPreview({
  boardId,
  hideInk,
  isOperator,
  access,
  accessReason,
  closeComment,
  showNotice,
  reportRefusal,
}: {
  boardId: string;
  hideInk: boolean;
  isOperator: boolean;
  access: WhiteboardAccess;
  accessReason: WhiteboardAccessReason | undefined;
  // Closes any open thread, or comment being started, as a preview opens.
  closeComment: () => void;
  showNotice: ShowNotice;
  reportRefusal: ReportRefusal;
}) {
  const { t, i18n } = useTranslation();
  // The version being looked at, which can't be edited or commented on.
  const [preview, setPreview] = useState<VersionPreview>();
  // A version is previewed without its ink while this viewer hides ink, as
  // the board is.
  const shownPreview = useMemo(
    () =>
      preview && hideInk
        ? { ...preview, nodes: preview.nodes.filter((n) => n.type !== "ink") }
        : preview,
    [preview, hideInk],
  );
  // The version being fetched to preview. Picking another, or going back to
  // now, drops it.
  const [previewLoading, setPreviewLoading] = useState<string>();
  const previewRequest = useRef(0);
  const backToNow = useCallback(() => {
    previewRequest.current += 1;
    setPreviewLoading(undefined);
    setPreview(undefined);
  }, []);
  // Restoring the version being previewed asks first. The confirmation
  // stays up until the server answers, and shows why if it refuses.
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  const showVersion = useCallback(
    (version: WhiteboardVersionType) => {
      previewRequest.current += 1;
      const request = previewRequest.current;
      const failed = (reason: string) =>
        showNotice(
          t(
            "whiteboard.history.loadFailed",
            "Couldn't load that version: {{reason}}",
            { reason, ...NO_ESCAPE },
          ),
        );
      // Versions are gzipped, and only newer browsers can unpack that
      if (typeof DecompressionStream === "undefined") {
        setPreviewLoading(undefined);
        failed(
          t(
            "whiteboard.history.browserTooOld",
            "this browser can't open saved versions",
          ),
        );
        return;
      }
      setPreviewLoading(version._id);
      closeComment();
      void loadVersion(boardId, version).then(
        (loaded) => {
          if (previewRequest.current !== request) return;
          setPreviewLoading(undefined);
          setPreview(loaded);
        },
        (error: unknown) => {
          if (previewRequest.current !== request) return;
          setPreviewLoading(undefined);
          if (error instanceof Meteor.Error) {
            failed(error.reason ?? error.message);
            return;
          }
          // oxlint-disable-next-line no-console
          console.error("Couldn't load a whiteboard version", error);
          failed(t("whiteboard.history.unreadable", "it couldn't be read"));
        },
      );
    },
    [boardId, closeComment, showNotice, t],
  );
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();
  const askRestore = useCallback(() => {
    setRestoreError(undefined);
    setConfirmingRestore(true);
  }, []);
  const cancelRestore = useCallback(() => {
    if (!restoring) setConfirmingRestore(false);
  }, [restoring]);
  const previewTime = preview
    ? versionMoment(preview.version.createdAt, t, i18n.language)
    : "";
  const restore = useCallback(() => {
    if (!preview) return;
    const versionId = preview.version._id;
    setRestoreError(undefined);
    setRestoring(true);
    restoreWhiteboardVersion.call({ boardId, versionId }, (error) => {
      setRestoring(false);
      if (error) {
        setRestoreError(error.reason ?? error.message);
        return;
      }
      setConfirmingRestore(false);
      setPreview((current) =>
        current?.version._id === versionId ? undefined : current,
      );
      showNotice(
        t("whiteboard.history.restored", "Board restored to {{time}}.", {
          time: previewTime,
        }),
        "success",
      );
    });
  }, [preview, boardId, showNotice, t, previewTime]);

  // In a preview, the board as it is now, so what the version has
  // differently can be marked. Nodes and lines are matched by what they are,
  // as a restore matches them. A lock is only marked for an operator, since
  // only their Restore this version changes locks.
  const liveBoard = useTracker(
    () =>
      preview
        ? {
            nodes: WhiteboardNodes.find({ board: boardId }).fetch(),
            edges: WhiteboardEdges.find({ board: boardId }).fetch(),
          }
        : undefined,
    [preview, boardId],
  );
  // Restoring a version replaces the board's ink with the version's, which a
  // viewer hiding ink can't see in the preview, so the banner says so.
  const inkHiddenInPreview =
    hideInk &&
    !!preview &&
    [...preview.nodes, ...(liveBoard?.nodes ?? [])].some(
      (n) => n.type === "ink",
    );
  const changed = useMemo(
    () =>
      shownPreview && liveBoard
        ? versionDifferences(liveBoard, shownPreview, { locks: isOperator })
        : NO_CHANGES,
    [shownPreview, liveBoard, isOperator],
  );

  // Puts back the one thing picked in the preview (a node, or a whole ink
  // stroke) as it was in the version.
  const [restoringItem, setRestoringItem] = useState(false);
  const restoreItem = useCallback(
    (pick: { ids: string[] }) => {
      if (!preview) return;
      setRestoringItem(true);
      restoreWhiteboardItems.call(
        {
          boardId,
          versionId: preview.version._id,
          nodeIds: pick.ids,
        },
        (error, result) => {
          setRestoringItem(false);
          if (error) {
            reportRefusal(error);
            return;
          }
          const restored = result?.restored;
          showNotice(
            restored
              ? t(
                  "whiteboard.history.restoredItem",
                  "Put back as it was at {{time}}.",
                  { time: previewTime },
                )
              : t(
                  "whiteboard.history.itemUnchanged",
                  "That's already as it was at {{time}}.",
                  { time: previewTime },
                ),
            restored ? "success" : "warning",
          );
        },
      );
    },
    [preview, boardId, reportRefusal, showNotice, t, previewTime],
  );

  // Why the version can't be restored, if it can't.
  const restoreBlocked =
    access === "edit"
      ? undefined
      : accessReason === "archived"
        ? t("whiteboard.history.archived", "This hunt is archived.")
        : accessReason === "offline"
          ? t(
              "whiteboard.offline",
              "Offline: the board is view-only until you reconnect",
            )
          : t(
              "whiteboard.history.cantEdit",
              "Only people who can edit the board can restore it.",
            );

  return {
    preview,
    shownPreview,
    previewLoading,
    backToNow,
    confirmingRestore,
    showVersion,
    // What the version has differently from the board, by id.
    changed,
    inkHiddenInPreview,
    previewTime,
    restoreBlocked,
    restoring,
    restoreError,
    askRestore,
    cancelRestore,
    restore,
    restoringItem,
    restoreItem,
  };
}
