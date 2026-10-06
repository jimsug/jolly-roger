import type { Meteor } from "meteor/meteor";
import { useCallback, useState } from "react";
import type { WhiteboardAccessReason } from "../../lib/permission_stubs";

// How long a note about a link that couldn't be followed stays up.
const NOTICE_MS = 8000;

// Reasons for less access that come from the screen or the connection, not
// from anyone's choice, and aren't announced.
export const unannounced = (reason: WhiteboardAccessReason | undefined) =>
  reason === "narrow" || reason === "offline";

export interface Notice {
  id: number;
  text: string;
  variant: "warning" | "success";
  action?: { label: string; onClick: () => void };
}

export type ShowNotice = (
  text: string,
  variant?: Notice["variant"],
  action?: Notice["action"],
) => void;

export interface SaveError {
  id: number;
  reason: string;
}

export type ReportRefusal = (error?: Meteor.Error | string) => void;

interface BoardNotices {
  // A short message under the toolbar, gone after a while: a link that
  // couldn't be followed, a version that couldn't be loaded, an undo that
  // someone else's edit got in the way of, or a restore or reset that worked.
  // It can carry a button for what to do next.
  notice: Notice | undefined;
  showNotice: ShowNotice;
  dismissNotice: () => void;
  followNotice: () => void;
  // The last save the server refused, shown until dismissed or replaced. An
  // image that couldn't be added gives its reason in words.
  saveError: SaveError | undefined;
  reportRefusal: ReportRefusal;
  dismissSaveError: () => void;
  // Says so when the viewer's edit rights come or go while the board is
  // open.
  accessNotice: "lost" | "gained" | undefined;
  dismissAccessNotice: () => void;
}

// The alerts the canvas shows under its toolbar, and what puts them up.
export default function useBoardNotices({
  mayEdit,
  accessReason,
  tidyLater,
}: {
  mayEdit: boolean;
  accessReason: WhiteboardAccessReason | undefined;
  // Runs something after a while, unless the canvas has gone by then.
  tidyLater: (tidy: () => void, ms: number) => void;
}): BoardNotices {
  // A screen becoming phone-sized (compact, see WhiteboardPage) or ceasing
  // to be isn't news, and losing the connection has its own banner. The
  // reason is tracked even when edit rights don't change, so a later change
  // is judged against the current one. Time offline isn't tracked, so a
  // change made meanwhile is announced on reconnecting.
  const [seenAccess, setSeenAccess] = useState({
    mayEdit,
    reason: accessReason,
  });
  const [accessNotice, setAccessNotice] = useState<"lost" | "gained">();
  if (
    accessReason !== "offline" &&
    (seenAccess.mayEdit !== mayEdit || seenAccess.reason !== accessReason)
  ) {
    setSeenAccess({ mayEdit, reason: accessReason });
    if (
      seenAccess.mayEdit !== mayEdit &&
      !unannounced(seenAccess.reason) &&
      !unannounced(accessReason)
    ) {
      setAccessNotice(mayEdit ? "gained" : "lost");
    }
  }
  const dismissAccessNotice = useCallback(() => setAccessNotice(undefined), []);

  const [saveError, setSaveError] = useState<SaveError>();
  const reportRefusal = useCallback<ReportRefusal>((error) => {
    if (error === undefined) return;
    setSaveError({
      id: Date.now(),
      reason:
        typeof error === "string" ? error : (error.reason ?? error.message),
    });
  }, []);
  const dismissSaveError = useCallback(() => setSaveError(undefined), []);

  const [notice, setNotice] = useState<Notice>();
  const showNotice = useCallback(
    (
      text: string,
      variant: Notice["variant"] = "warning",
      action?: Notice["action"],
    ) => {
      const id = Date.now();
      setNotice({ id, text, variant, action });
      tidyLater(
        () =>
          setNotice((current) => (current?.id === id ? undefined : current)),
        NOTICE_MS,
      );
    },
    [tidyLater],
  );
  const dismissNotice = useCallback(() => setNotice(undefined), []);
  const followNotice = useCallback(() => {
    setNotice(undefined);
    notice?.action?.onClick();
  }, [notice]);

  return {
    notice,
    showNotice,
    dismissNotice,
    followNotice,
    saveError,
    reportRefusal,
    dismissSaveError,
    accessNotice,
    dismissAccessNotice,
  };
}
