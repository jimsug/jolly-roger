import { Random } from "meteor/random";
import { useTracker } from "meteor/react-meteor-data";
import type { XYPosition } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Tags from "../../lib/models/Tags";
import WhiteboardEdges from "../../lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../../lib/models/WhiteboardNodes";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  frameLabel,
} from "../../lib/whiteboard/layout";
import type { MissingCard } from "../../lib/whiteboard/notOnBoard";
import {
  hiddenFeederArrows,
  missingCards,
} from "../../lib/whiteboard/notOnBoard";
import type { Commit } from "../components/whiteboard/boardWrites";
import { NO_ESCAPE } from "../components/whiteboard/canvasChrome";
import { centeredRect } from "../components/whiteboard/tools";
import type { WhiteboardActions } from "../components/whiteboard/WhiteboardContext";

// A seeded frame someone removed.
export interface HiddenFrame {
  id: string;
  title: string;
}

// A feeder arrow someone removed, named by the puzzles it joins.
export interface HiddenArrow {
  id: string;
  title: string;
}

// What the "Not on the board" panel lists (puzzles with no card showing,
// seeded frames and feeder arrows someone removed) and how each is put
// back.
export default function useNotOnBoard({
  boardId,
  huntId,
  livePuzzles,
  nodeDocs,
  paneCenter,
  updateNodes,
  commit,
}: {
  boardId: string;
  huntId: string;
  livePuzzles: { _id: string; title: string }[];
  nodeDocs: WhiteboardNodeType[];
  // The board point at the middle of the screen, where things are put back.
  paneCenter: () => XYPosition;
  updateNodes: WhiteboardActions["updateNodes"];
  commit: Commit;
}) {
  const { t } = useTranslation();
  const hiddenCards = useMemo(
    () => missingCards(livePuzzles, nodeDocs),
    [livePuzzles, nodeDocs],
  );

  // Frames for rounds that someone removed. Only seeded frames are kept when
  // they're removed; anything made on the board is deleted outright.
  const tagNames = useTracker(
    () =>
      new Map(
        Tags.find({ hunt: huntId }, { projection: { name: 1 } }).map((tag) => [
          tag._id,
          tag.name,
        ]),
      ),
    [huntId],
  );
  const hiddenFrames = useMemo(
    (): HiddenFrame[] =>
      nodeDocs
        .filter((d) => d.type === "frame" && d.hidden)
        .map((d) => ({
          id: d._id,
          title:
            frameLabel(d, d.tag ? tagNames.get(d.tag) : undefined) ??
            t("whiteboard.frame.placeholder", "Frame"),
        }))
        .toSorted((a, b) => a.title.localeCompare(b.title)),
    [nodeDocs, tagNames, t],
  );

  // Feeder arrows someone removed, between puzzles that are still live.
  const hiddenArrowDocs = useTracker(
    () =>
      WhiteboardEdges.find(
        { board: boardId, auto: true, hidden: true },
        { projection: { feeder: 1, meta: 1 } },
      ).fetch(),
    [boardId],
  );
  const hiddenArrows = useMemo(
    (): HiddenArrow[] =>
      hiddenFeederArrows(livePuzzles, hiddenArrowDocs)
        .map(({ id, feeder, meta }) => ({
          id,
          title: t("whiteboard.hidden.arrow", "{{feeder}} → {{meta}}", {
            feeder,
            meta,
            ...NO_ESCAPE,
          }),
        }))
        .toSorted((a, b) => a.title.localeCompare(b.title)),
    [hiddenArrowDocs, livePuzzles, t],
  );
  const notOnBoardCount =
    hiddenCards.length + hiddenFrames.length + hiddenArrows.length;

  // Puts a card back at the middle of the screen, and says which node it is.
  const putBack = useCallback(
    (card: MissingCard) => {
      const { width, height, ...position } = centeredRect(paneCenter(), {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      });
      const _id = card.id ?? Random.id();
      updateNodes([
        card.id
          ? { _id, hidden: false, parent: null, position }
          : {
              _id,
              type: "puzzle",
              puzzle: card.puzzle,
              position,
              width,
              height,
              // Does nothing on insert. Undo only hides a card, so a redo
              // resends this to show it again.
              hidden: false,
            },
      ]);
      return _id;
    },
    [paneCenter, updateNodes],
  );

  // Puts a removed frame back, empty and at the top level, at the middle of
  // the screen.
  const putBackFrame = useCallback(
    ({ id }: { id: string }) => {
      const doc = nodeDocs.find((d) => d._id === id);
      if (!doc) return;
      const { x, y } = centeredRect(paneCenter(), {
        width: doc.width ?? 0,
        height: doc.height ?? 0,
      });
      updateNodes([
        { _id: id, hidden: false, parent: null, position: { x, y } },
      ]);
    },
    [nodeDocs, paneCenter, updateNodes],
  );

  const putBackArrows = useCallback(
    (ids: string[]) =>
      commit({ upsertEdges: ids.map((_id) => ({ _id, hidden: false })) }),
    [commit],
  );
  const putBackArrow = useCallback(
    (arrow: HiddenArrow) => putBackArrows([arrow.id]),
    [putBackArrows],
  );
  // Only the arrows the panel lists: one between puzzles that aren't live
  // may be on its way out, and would fail the whole batch.
  const putBackAllArrows = useCallback(
    () => putBackArrows(hiddenArrows.map((a) => a.id)),
    [putBackArrows, hiddenArrows],
  );

  return {
    hiddenCards,
    hiddenFrames,
    hiddenArrows,
    // Each tag's name, which the Outline labels frames by too.
    tagNames,
    notOnBoardCount,
    putBack,
    putBackFrame,
    putBackArrow,
    putBackAllArrows,
  };
}
