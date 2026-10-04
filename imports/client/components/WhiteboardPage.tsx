import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useCallback, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import Flags from "../../Flags";
import Hunts from "../../lib/models/Hunts";
import Whiteboards from "../../lib/models/Whiteboards";
import type {
  WhiteboardAccess,
  WhiteboardAccessReason,
} from "../../lib/permission_stubs";
import {
  userMayMakeOperatorForHunt,
  userMayWritePuzzlesForHunt,
  whiteboardAccess,
} from "../../lib/permission_stubs";
import whiteboardContents from "../../lib/publications/whiteboardContents";
import whiteboardForHunt from "../../lib/publications/whiteboardForHunt";
import createWhiteboard from "../../methods/createWhiteboard";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import PuzzlePage, { MinimumDesktopWidth } from "./PuzzlePage";
import type { BoardFocus } from "./whiteboard/BoardFocusContext";
import BoardFocusContext from "./whiteboard/BoardFocusContext";
import WhiteboardCanvas from "./whiteboard/WhiteboardCanvas";

const EmptyWhiteboard = ({ huntId }: { huntId: string }) => {
  const { t } = useTranslation();
  const title = t("whiteboard.title", "Whiteboard");
  useBreadcrumb({ title, path: `/hunts/${huntId}/whiteboard` });
  const hunt = useTracker(() => Hunts.findOne(huntId), [huntId]);
  const canCreate = useTracker(
    () => userMayWritePuzzlesForHunt(Meteor.user(), hunt),
    [hunt],
  );
  const archived = !!hunt?.isArchived;
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
      <h1>{title}</h1>
      <p>
        {t(
          "whiteboard.empty.description",
          "A shared board for laying out this hunt's rounds, puzzles and answers, with arrows, notes and drawing, and its own chat.",
        )}
      </p>
      {archived && (
        <p>
          {t(
            "whiteboard.empty.archived",
            "This hunt is archived, so a whiteboard can't be set up for it.",
          )}
        </p>
      )}
      {!archived && canCreate && (
        <>
          <p>
            {t(
              "whiteboard.empty.createHelp",
              "Creating it lays out every puzzle in a frame for its round, with arrows from feeders to their metas. New puzzles are added as they're created.",
            )}
          </p>
          <Button onClick={create} disabled={creating}>
            {creating
              ? t("whiteboard.empty.creating", "Creating…")
              : t("whiteboard.empty.create", "Create whiteboard")}
          </Button>
          {error && (
            <Alert variant="danger" className="mt-3">
              {error}
            </Alert>
          )}
        </>
      )}
      {!archived && !canCreate && (
        <p>
          {t(
            "whiteboard.empty.noBoard",
            "An operator hasn't set one up for this hunt yet.",
          )}
        </p>
      )}
    </div>
  );
};

const WhiteboardPage = () => {
  const huntId = useParams<"huntId">().huntId!;
  const { t } = useTranslation();
  const loading = useTypedSubscribe(whiteboardForHunt, { huntId });
  const board = useTracker(
    () => Whiteboards.findOne({ hunt: huntId }),
    [huntId],
  );
  const policyAccess = useTracker(() => {
    const user = Meteor.user();
    const hunt = Hunts.findOne(huntId);
    const current = Whiteboards.findOne(
      { hunt: huntId },
      { projection: { editPolicy: 1, editors: 1 } },
    );
    return {
      ...(current
        ? whiteboardAccess(user, hunt, current)
        : { access: "none" as const }),
      editPolicy: current?.editPolicy ?? "members",
      editors: current?.editors ?? [],
      mayChangePolicy: userMayMakeOperatorForHunt(user, hunt),
    };
  }, [huntId]);
  const disabled = useTracker(() => Flags.active("disable.whiteboard"), []);
  // PuzzlePage's own breakpoint; narrower than this the board can only be
  // commented on.
  const isDesktop = useMediaQuery(`(min-width: ${MinimumDesktopWidth}px)`);
  let access: WhiteboardAccess = policyAccess.access;
  let accessReason: WhiteboardAccessReason | undefined = policyAccess.reason;
  if (access === "edit" && !isDesktop) {
    access = "comment";
    accessReason = "narrow";
  }
  // Here rather than in the canvas, so chat can still name what a comment is
  // on while a narrow screen shows chat instead of the board.
  const contentsLoading = useTypedSubscribe(
    board ? whiteboardContents : undefined,
    { boardId: board?._id ?? "" },
  );
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
  const focusRef = useRef<((threadId: string) => void) | undefined>(undefined);
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
      },
    }),
    [setSearchParams],
  );

  if (disabled) {
    return (
      <Alert variant="info">
        {t("whiteboard.disabled", "The whiteboard is turned off.")}
      </Alert>
    );
  }
  if (loading()) {
    return <div>{t("common.loading", "loading")}...</div>;
  }
  if (!board) {
    return <EmptyWhiteboard huntId={huntId} />;
  }

  return (
    <BoardFocusContext value={boardFocus}>
      <PuzzlePage
        puzzleIdOverride={board.puzzle}
        showContentFor={initialComment}
        content={
          <WhiteboardCanvas
            boardId={board._id}
            huntId={huntId}
            puzzleId={board.puzzle}
            access={access}
            accessReason={accessReason}
            mayChangeEditPolicy={
              policyAccess.mayChangePolicy && access !== "view"
            }
            editPolicy={policyAccess.editPolicy}
            editors={policyAccess.editors}
            showMiniMap={isDesktop}
            boardLoaded={!contentsLoading()}
            focusRef={focusRef}
            initialComment={initialComment}
            onInitialCommentShown={clearInitialComment}
          />
        }
      />
    </BoardFocusContext>
  );
};

export default WhiteboardPage;
