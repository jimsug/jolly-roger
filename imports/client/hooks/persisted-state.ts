import type { SetStateAction } from "react";
import { useCallback } from "react";
import { useLocalStorage } from "usehooks-ts";

export type AppThemeState = "dark" | "light" | "auto";
export const useAppThemeState = () => {
  return useLocalStorage<AppThemeState>("appTheme", "auto");
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

// Whether the puzzle list shows who is on each puzzle
export type ShowSolversMode = "hide" | "viewers";

export type PuzzleListState = {
  displayMode: "group" | "unlock";
  showSolved: boolean;
  // Only consulted in hunts that allow locked puzzles. State saved before
  // this field existed lacks it, so readers treat undefined as "all".
  lockedDisplayMode?: LockedDisplayMode;
  // Saved state may lack this or hold a retired value, so readers treat
  // anything but "hide" as "viewers".
  showSolvers?: string;
  collapseGroups: Record<string /* tag ID */, boolean>;
};

const defaultPuzzleListState = () => {
  return {
    displayMode: "group",
    showSolved: true,
    lockedDisplayMode: "all",
    showSolvers: "viewers",
    collapseGroups: {},
  } as PuzzleListState;
};

const showSolversMode = (value: string | undefined): ShowSolversMode =>
  value === "hide" ? "hide" : "viewers";
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

export const useHuntPuzzleListShowSolvers = (huntId: string) => {
  const [huntPuzzleListView, setHuntPuzzleListView] =
    useHuntPuzzleListState(huntId);
  return [
    showSolversMode(huntPuzzleListView.showSolvers),
    useCallback(
      (update: SetStateAction<ShowSolversMode>) => {
        setHuntPuzzleListView((prevView) => {
          const newView = {
            ...prevView,
            showSolvers:
              typeof update === "function"
                ? update(showSolversMode(prevView.showSolvers))
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
