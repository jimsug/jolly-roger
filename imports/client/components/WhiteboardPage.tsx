import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useParams, useSearchParams } from "react-router-dom";
import { useMediaQuery } from "usehooks-ts";
import Flags from "../../Flags";
import Hunts from "../../lib/models/Hunts";
import Whiteboards from "../../lib/models/Whiteboards";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import whiteboardContents from "../../lib/publications/whiteboardContents";
import whiteboardForHunt from "../../lib/publications/whiteboardForHunt";
import createWhiteboard from "../../methods/createWhiteboard";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import PuzzlePage from "./PuzzlePage";
import type { BoardFocus } from "./whiteboard/BoardFocusContext";
import BoardFocusContext from "./whiteboard/BoardFocusContext";
import WhiteboardCanvas from "./whiteboard/WhiteboardCanvas";

// PuzzlePage's own desktop breakpoint; narrower than this the board is
// view-only.
const DESKTOP_QUERY = "(min-width: 576px)";

const EmptyWhiteboard = ({ huntId }: { huntId: string }) => {
  useBreadcrumb({ title: "Whiteboard", path: `/hunts/${huntId}/whiteboard` });
  const hunt = useTracker(() => Hunts.findOne(huntId), [huntId]);
  const canCreate = useTracker(
    () => userMayWritePuzzlesForHunt(Meteor.user(), hunt),
    [hunt],
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = useCallback(() => {
    setCreating(true);
    setError(undefined);
    createWhiteboard.call({ huntId }, (err) => {
      setCreating(false);
      if (err) setError(err.reason ?? err.message);
    });
  }, [huntId]);

  return (
    <div>
      <h1>Whiteboard</h1>
      <p>
        A shared board for laying out this hunt&apos;s rounds, puzzles and
        answers, with arrows, notes and drawing, and its own chat.
      </p>
      {canCreate ? (
        <>
          <p>
            Creating it lays out every puzzle in a frame for its round, with
            arrows from feeders to their metas. New puzzles are added as
            they&apos;re created.
          </p>
          <Button onClick={create} disabled={creating}>
            {creating ? "Creating…" : "Create whiteboard"}
          </Button>
          {error && (
            <Alert variant="danger" className="mt-3">
              {error}
            </Alert>
          )}
        </>
      ) : (
        <p>An operator hasn&apos;t set one up for this hunt yet.</p>
      )}
    </div>
  );
};

const WhiteboardPage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const loading = useTypedSubscribe(whiteboardForHunt, { huntId });
  const board = useTracker(
    () => Whiteboards.findOne({ hunt: huntId }),
    [huntId],
  );
  const archived = useTracker(
    () => !!Hunts.findOne(huntId)?.isArchived,
    [huntId],
  );
  const disabled = useTracker(() => Flags.active("disable.whiteboard"), []);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Also subscribed by the canvas; kept here so chat can still name what a
  // comment is on while a narrow screen shows chat instead of the board.
  useTypedSubscribe(board ? whiteboardContents : undefined, {
    boardId: board?._id ?? "",
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const initialComment = searchParams.get("comment") ?? undefined;
  const clearInitialComment = useCallback(
    () =>
      setSearchParams(
        (params) => {
          params.delete("comment");
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  const focusRef = useRef<((threadId: string) => boolean) | undefined>(
    undefined,
  );
  const boardFocus: BoardFocus = useMemo(
    () => ({
      focusComment: (threadId) => {
        if (focusRef.current) return focusRef.current(threadId);
        // On a narrow screen the board isn't showing while chat is, so ask
        // it to show the comment once it's back.
        setSearchParams(
          (params) => {
            params.set("comment", threadId);
            return params;
          },
          { replace: true },
        );
        return true;
      },
    }),
    [setSearchParams],
  );

  if (disabled) {
    return <Alert variant="info">The whiteboard is turned off.</Alert>;
  }
  if (loading()) {
    return <div>loading...</div>;
  }
  if (!board) {
    return <EmptyWhiteboard huntId={huntId} />;
  }

  return (
    <BoardFocusContext.Provider value={boardFocus}>
      <PuzzlePage
        puzzleIdOverride={board.puzzle}
        showContentFor={initialComment}
        content={
          <WhiteboardCanvas
            boardId={board._id}
            huntId={huntId}
            puzzleId={board.puzzle}
            readOnly={archived || !isDesktop}
            focusRef={focusRef}
            initialComment={initialComment}
            onInitialCommentShown={clearInitialComment}
          />
        }
      />
    </BoardFocusContext.Provider>
  );
};

export default WhiteboardPage;
