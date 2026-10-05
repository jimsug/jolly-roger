import type { Viewport } from "@xyflow/react";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEventListener, useLocalStorage } from "usehooks-ts";
import type {
  WhiteboardColor,
  WhiteboardShape,
  WhiteboardStrokeWidth,
} from "../../lib/models/WhiteboardNodes";
import type { FeederOrder } from "../../lib/whiteboard/feeders";
import type { LineStyle } from "../../lib/whiteboard/lineStyle";
import { lineStyleFrom } from "../../lib/whiteboard/lineStyle";

export type AppThemeState = "dark" | "light" | "auto";
export const useAppThemeState = () => {
  return useLocalStorage<AppThemeState>("appTheme", "auto");
};

// The dragged width of the puzzle page's chat pane, shared across puzzles
export const usePersistedSidebarWidth = (defaultWidth: number) => {
  return useLocalStorage("persistentSidebarWidth", defaultWidth);
};

export type NotesPageViewMode = "list" | "table" | "fullwidth";
export const useNotesPageViewMode = () => {
  return useLocalStorage<NotesPageViewMode>("notesPageViewMode", "list");
};

export const useNotesPageShowSolved = () => {
  return useLocalStorage<boolean>("notesPageShowSolved", false);
};

export type OperatorActionsHiddenState = Record<string /* huntId */, boolean>;

export const useOperatorActionsHidden = () => {
  return useLocalStorage<OperatorActionsHiddenState>(
    "operatorActionsHidden",
    {},
  );
};

export const useOperatorActionsHiddenForHunt = (huntId: string) => {
  const [operatorActionsHidden, setOperatorActionsHidden] =
    useOperatorActionsHidden();
  return [
    operatorActionsHidden?.[huntId] ?? false,
    useCallback(
      (update: SetStateAction<boolean>) => {
        setOperatorActionsHidden((prevHidden) => {
          const newHidden = {
            ...prevHidden,
            [huntId]:
              typeof update === "function"
                ? update(prevHidden?.[huntId] ?? false)
                : update,
          };
          return newHidden;
        });
      },
      [setOperatorActionsHidden, huntId],
    ),
  ] as const;
};

export type LockedDisplayMode = "all" | "unlocked" | "locked";

export type PuzzleListState = {
  displayMode: "group" | "unlock";
  showSolved: boolean;
  // Only consulted in hunts that allow locked puzzles. State saved before
  // this field existed lacks it, so readers treat undefined as "all".
  lockedDisplayMode?: LockedDisplayMode;
  // Whether the list shows who is on each puzzle. State saved before this
  // field existed lacks it and may have showSolvers instead.
  showViewers?: boolean;
  // Superseded by showViewers. Anything but "hide" (including a retired
  // value) means shown.
  showSolvers?: string;
  collapseGroups: Record<string /* tag ID */, boolean>;
};

const defaultPuzzleListState = () => {
  return {
    displayMode: "group",
    showSolved: true,
    lockedDisplayMode: "all",
    showViewers: true,
    collapseGroups: {},
  } as PuzzleListState;
};

const viewersShown = (state: PuzzleListState) =>
  state.showViewers ?? state.showSolvers !== "hide";
export const useHuntPuzzleListState = (huntId: string) => {
  const [puzzleListView, setPuzzleListView] = useLocalStorage<
    Record<string /* huntId */, PuzzleListState>
  >("puzzleListView", {});
  return [
    puzzleListView?.[huntId] ?? defaultPuzzleListState(),
    useCallback(
      (update: SetStateAction<PuzzleListState>) => {
        setPuzzleListView((prevView) => {
          const newView = {
            ...prevView,
            [huntId]:
              typeof update === "function"
                ? update(prevView?.[huntId] ?? defaultPuzzleListState())
                : update,
          };
          return newView;
        });
      },
      [setPuzzleListView, huntId],
    ),
  ] as const;
};

export const useHuntPuzzleListDisplayMode = (huntId: string) => {
  const [huntPuzzleListView, setHuntPuzzleListView] =
    useHuntPuzzleListState(huntId);
  return [
    huntPuzzleListView.displayMode,
    useCallback(
      (update: SetStateAction<"group" | "unlock">) => {
        setHuntPuzzleListView((prevView) => {
          const newView = {
            ...prevView,
            displayMode:
              typeof update === "function"
                ? update(prevView.displayMode)
                : update,
          };
          return newView;
        });
      },
      [setHuntPuzzleListView],
    ),
  ] as const;
};

export const useHuntPuzzleListShowSolved = (huntId: string) => {
  const [huntPuzzleListView, setHuntPuzzleListView] =
    useHuntPuzzleListState(huntId);
  return [
    huntPuzzleListView.showSolved,
    useCallback(
      (update: SetStateAction<boolean>) => {
        setHuntPuzzleListView((prevView) => {
          const newView = {
            ...prevView,
            showSolved:
              typeof update === "function"
                ? update(prevView.showSolved)
                : update,
          };
          return newView;
        });
      },
      [setHuntPuzzleListView],
    ),
  ] as const;
};

export const useHuntPuzzleListLockedDisplayMode = (huntId: string) => {
  const [huntPuzzleListView, setHuntPuzzleListView] =
    useHuntPuzzleListState(huntId);
  return [
    huntPuzzleListView.lockedDisplayMode ?? "all",
    useCallback(
      (update: SetStateAction<LockedDisplayMode>) => {
        setHuntPuzzleListView((prevView) => {
          const newView = {
            ...prevView,
            lockedDisplayMode:
              typeof update === "function"
                ? update(prevView.lockedDisplayMode ?? "all")
                : update,
          };
          return newView;
        });
      },
      [setHuntPuzzleListView],
    ),
  ] as const;
};

export const useHuntPuzzleListShowViewers = (huntId: string) => {
  const [huntPuzzleListView, setHuntPuzzleListView] =
    useHuntPuzzleListState(huntId);
  return [
    viewersShown(huntPuzzleListView),
    useCallback(
      (update: SetStateAction<boolean>) => {
        setHuntPuzzleListView((prevView) => {
          const newView = {
            ...prevView,
            showViewers:
              typeof update === "function"
                ? update(viewersShown(prevView))
                : update,
          };
          return newView;
        });
      },
      [setHuntPuzzleListView],
    ),
  ] as const;
};

export const useHuntPuzzleListCollapseGroups = (huntId: string) => {
  const [huntPuzzleListView, setHuntPuzzleListView] =
    useHuntPuzzleListState(huntId);
  return [
    huntPuzzleListView.collapseGroups,
    useCallback(
      (update: SetStateAction<Record<string /* tag ID */, boolean>>) => {
        setHuntPuzzleListView((prevView) => {
          const newView = {
            ...prevView,
            collapseGroups:
              typeof update === "function"
                ? update(prevView.collapseGroups)
                : update,
          };
          return newView;
        });
      },
      [setHuntPuzzleListView],
    ),
  ] as const;
};

export const useHuntPuzzleListCollapseGroup = (
  huntId: string,
  tagId: string,
) => {
  const [huntPuzzleListCollapseGroups, setHuntPuzzleListCollapseGroups] =
    useHuntPuzzleListCollapseGroups(huntId);
  return [
    huntPuzzleListCollapseGroups[tagId] ?? false,
    useCallback(
      (update: SetStateAction<boolean>) => {
        setHuntPuzzleListCollapseGroups((prevView) => {
          const newView = {
            ...prevView,
            [tagId]:
              typeof update === "function"
                ? update(prevView[tagId] ?? false)
                : update,
          };
          return newView;
        });
      },
      [setHuntPuzzleListCollapseGroups, tagId],
    ),
  ] as const;
};

// None of the settings below are functions, so a function is an update.
function isUpdate<T>(update: SetStateAction<T>): update is (previous: T) => T {
  return typeof update === "function";
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Tells the other hooks in this tab using a key about a new value, which
// "storage" events only do for other tabs. The value travels with the event
// so that it arrives even when storage wouldn't take it. The event's type is
// declared in types/window-events.d.ts.
const SAME_TAB_CHANGE = "jr:bestEffortStorage";

// Values this visit couldn't save, so that a hook mounted later starts from
// them rather than from what storage still has.
const unsaved = new Map<string, unknown>();

function readSetting<T>(key: string, fallback: T): T {
  return unsaved.has(key) ? (unsaved.get(key) as T) : readStored(key, fallback);
}

// Like useLocalStorage, but React state holds the value and saving it is best
// effort. useLocalStorage only takes a new value once it has written it, so
// with storage blocked or full a setting couldn't change at all; here it still
// changes for the visit. Values saved in other tabs come through as well.
function useBestEffortLocalStorage<T>(key: string, initialValue: T) {
  const [setting, setSetting] = useState(() => ({
    key,
    value: readSetting(key, initialValue),
    changed: false,
  }));
  let current = setting;
  if (setting.key !== key) {
    // Another key (another board's, say) starts from what's saved under it.
    current = { key, value: readSetting(key, initialValue), changed: false };
    setSetting(current);
  }

  useEffect(() => {
    if (!setting.changed) return;
    try {
      window.localStorage.setItem(setting.key, JSON.stringify(setting.value));
      unsaved.delete(setting.key);
    } catch {
      unsaved.set(setting.key, setting.value);
    }
    window.dispatchEvent(
      new CustomEvent(SAME_TAB_CHANGE, {
        detail: { key: setting.key, value: setting.value },
      }),
    );
  }, [setting]);

  useEventListener(SAME_TAB_CHANGE, (event) => {
    const change = event.detail;
    if (change.key !== key) return;
    // The hook that made the change already has it, so it doesn't render
    // again.
    setSetting((previous) =>
      previous.key === key && previous.value === change.value
        ? previous
        : { key, value: change.value as T, changed: false },
    );
  });

  useEventListener("storage", (event) => {
    if (event.key === key) {
      unsaved.delete(key);
      setSetting({ key, value: readStored(key, initialValue), changed: false });
    }
  });

  const setValue = useCallback((update: SetStateAction<T>) => {
    setSetting((previous) => ({
      key: previous.key,
      value: isUpdate(update) ? update(previous.value) : update,
      changed: true,
    }));
  }, []);

  return [current.value, setValue] as const;
}

// Each viewer's own pan and zoom for a board.
export const useWhiteboardViewport = (boardId: string) => {
  return useBestEffortLocalStorage<Viewport | undefined>(
    `whiteboard:viewport:${boardId}`,
    undefined,
  );
};

export const useWhiteboardFeederArrows = () => {
  return useBestEffortLocalStorage("whiteboard:feederArrows", true);
};

// Whether this viewer has hidden ink on the board, which also stops its
// points being sent to them.
export const useWhiteboardHideInk = () => {
  return useBestEffortLocalStorage("whiteboard:hideInk", false);
};

// How a meta card's Feeders popover orders its list. Anything saved that
// isn't an order reads as board order.
export const useWhiteboardFeederOrder = () => {
  const [order, setOrder] = useBestEffortLocalStorage<FeederOrder>(
    "whiteboard:feederOrder",
    "board",
  );
  return [order === "solveTime" ? "solveTime" : "board", setOrder] as const;
};

export const useWhiteboardPenColor = () => {
  return useBestEffortLocalStorage<WhiteboardColor>(
    "whiteboard:penColor",
    "black",
  );
};

export const useWhiteboardPenWidth = () => {
  return useBestEffortLocalStorage<WhiteboardStrokeWidth>(
    "whiteboard:penWidth",
    "medium",
  );
};

// Which shape the Shape tool draws. Anything saved that isn't one reads as a
// rectangle.
export const useWhiteboardShapeKind = () => {
  const [shape, setShape] = useBestEffortLocalStorage<WhiteboardShape>(
    "whiteboard:shapeKind",
    "rect",
  );
  return [shape === "ellipse" ? "ellipse" : "rect", setShape] as const;
};

export const useWhiteboardShowResolvedComments = () => {
  return useBestEffortLocalStorage("whiteboard:showResolvedComments", false);
};

// The line tool's style. What's saved may be from another build of the
// board, so it's read as a style (see lineStyleFrom), and an update starts
// from that rather than from what's saved as it is.
export const useWhiteboardLineStyle = (defaultStyle: LineStyle) => {
  const [saved, setSaved] = useBestEffortLocalStorage<unknown>(
    "whiteboard:lineStyle",
    defaultStyle,
  );
  const style = useMemo(
    () => lineStyleFrom(saved, defaultStyle),
    [saved, defaultStyle],
  );
  const setStyle = useCallback(
    (update: SetStateAction<LineStyle>) => {
      setSaved((previous: unknown) =>
        isUpdate(update)
          ? update(lineStyleFrom(previous, defaultStyle))
          : update,
      );
    },
    [setSaved, defaultStyle],
  );
  return [style, setStyle] as const;
};

const NOTHING_SEEN: Record<string /* thread ID */, number> = {};

// When this viewer last read each of a board's comment threads
export const useWhiteboardCommentsSeen = (boardId: string) => {
  return useBestEffortLocalStorage(
    `whiteboard:commentsSeen:${boardId}`,
    NOTHING_SEEN,
  );
};

const ADD_PUZZLE_RECENT_TAGS_LIMIT = 10;

const NO_RECENT_TAGS: Record<string /* huntId */, string[]> = {};

const savedHuntTags = (saved: unknown): string[] =>
  Array.isArray(saved)
    ? saved.filter((name): name is string => typeof name === "string")
    : [];

// The tags this browser last used on puzzles in each hunt, newest first, for
// the puzzle form to offer again. Adding tags moves them to the front.
export const useAddPuzzleHuntRecentTags = (huntId?: string) => {
  const [allRecentTags, setAllRecentTags] = useBestEffortLocalStorage<
    Record<string /* huntId */, string[]>
  >("huntRecentTags", NO_RECENT_TAGS);

  const savedForHunt = huntId ? allRecentTags?.[huntId] : undefined;
  const recentTags = useMemo(() => savedHuntTags(savedForHunt), [savedForHunt]);

  const addPuzzleHuntRecentTags = useCallback(
    (newTags: string[]) => {
      if (!huntId || newTags.length === 0) return;
      setAllRecentTags((prev) => {
        const tags = [...new Set(newTags)];
        const prevHuntTags = savedHuntTags(prev?.[huntId]);
        const combined = [
          ...tags,
          ...prevHuntTags.filter((t) => !tags.includes(t)),
        ].slice(0, ADD_PUZZLE_RECENT_TAGS_LIMIT);
        return {
          ...prev,
          [huntId]: combined,
        };
      });
    },
    [setAllRecentTags, huntId],
  );

  return [recentTags, addPuzzleHuntRecentTags] as const;
};
