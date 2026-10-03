import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faLightbulb as faLightbulbRegular } from "@fortawesome/free-regular-svg-icons/faLightbulb";
import { faAngleDoubleUp } from "@fortawesome/free-solid-svg-icons/faAngleDoubleUp";
import { faAngleDown } from "@fortawesome/free-solid-svg-icons/faAngleDown";
import { faEdit } from "@fortawesome/free-solid-svg-icons/faEdit";
import { faLightbulb as faLightbulbSolid } from "@fortawesome/free-solid-svg-icons/faLightbulb";
import { faMinus } from "@fortawesome/free-solid-svg-icons/faMinus";
import { faNoteSticky } from "@fortawesome/free-solid-svg-icons/faNoteSticky";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { faUnlock } from "@fortawesome/free-solid-svg-icons/faUnlock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, {
  type ComponentPropsWithRef,
  type FC,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styled, { css, useTheme } from "styled-components";
import { indexedById } from "../../lib/listUtils";
import Hunts from "../../lib/models/Hunts";
import PuzzleFeedbacks from "../../lib/models/PuzzleFeedbacks";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import type { Solvedness } from "../../lib/solvedness";
import { computeSolvedness } from "../../lib/solvedness";
import updatePuzzle from "../../methods/updatePuzzle";
import { useOperatorActionsHiddenForHunt } from "../hooks/persisted-state";
import BookmarkButton from "./BookmarkButton";
import PuzzleActivity from "./PuzzleActivity";
import PuzzleAnswer from "./PuzzleAnswer";
import PuzzleDeleteModal from "./PuzzleDeleteModal";
import PuzzleInterestPopover from "./PuzzleInterestPopover";
import type { PuzzleModalFormSubmitPayload } from "./PuzzleModalForm";
import PuzzleModalForm from "./PuzzleModalForm";
import type { PuzzleUnlockModalHandle } from "./PuzzleUnlockModal";
import PuzzleUnlockModal from "./PuzzleUnlockModal";
import { mediaBreakpointDown } from "./styling/responsive";
import TagList from "./TagList";

const PuzzleDiv = styled.div<{
  $solvedness: Solvedness;
  $locked?: boolean;
}>`
  background-color: ${({ $solvedness, theme }) => {
    return theme.colors.solvedness[$solvedness];
  }};
  ${({ $locked }) =>
    $locked &&
    css`
      background-image: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 8px,
        rgb(128 128 128 / 10%) 8px,
        rgb(128 128 128 / 10%) 16px
      );
    `}
  display: flex;
  flex-direction: row;
  align-items: first baseline;
  justify-content: flex-start;
  line-height: 24px;
  padding: 4px 2px;
  margin-bottom: 4px;
  transition: filter 0.1s ease-in-out;

  &:hover {
    filter: ${({ theme }) =>
      theme.basicMode === "dark" ? "brightness(1.2)" : "brightness(0.95)"};
  }

  ${mediaBreakpointDown(
    "xs",
    css`
      flex-wrap: wrap;
    `,
  )}
`;

const PuzzleColumn = styled.div`
  padding: 0 2px;
  display: inline-block;
  flex: none;
  overflow: hidden;
`;

const PuzzleControlButtonsColumn = styled(PuzzleColumn)`
  align-self: flex-start;
  order: -1;
`;

const StyledButton: FC<ComponentPropsWithRef<typeof Button>> = styled(Button)`
  /* Precedence boost needed to override bootstrap default button padding */
  && {
    /* Resize button to fit in one line-height */
    display: block;
    height: 24px;
    width: 24px;
    padding: 0;
  }
`;

// Like StyledButton, but allowed to grow for the interest count badge.
const InterestButton: FC<ComponentPropsWithRef<typeof Button>> = styled(Button)`
  && {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 24px;
    min-width: 24px;
    padding: 0 4px;
  }
`;

const PuzzleTitleColumn = styled(PuzzleColumn)`
  flex: 4;
  overflow-wrap: break-word;
  order: -1;
`;

const PuzzleNoteIcon = styled.span`
  margin-left: 0.5rem;
`;

const PuzzleActivityColumn = styled(PuzzleColumn)`
  width: 11rem;
  text-align: right;
  ${mediaBreakpointDown(
    "xs",
    css`
      /* Push to take whole row in narrow views */
      flex: 0 0 100%;
    `,
  )}
`;

// Takes the activity column's place while the puzzle is locked.
const LockedSummaryColumn = styled(PuzzleColumn)`
  flex: 3;
  font-style: italic;
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  ${mediaBreakpointDown(
    "xs",
    css`
      flex: 0 0 100%;
    `,
  )}
`;

const PuzzleLinkColumn = styled(PuzzleColumn)`
  width: 26px;
  text-align: center;
  ${mediaBreakpointDown(
    "xs",
    css`
      order: -1;
    `,
  )}
`;

const PuzzleAnswerColumn = styled(PuzzleColumn)`
  flex: 3;
  ${mediaBreakpointDown(
    "xs",
    css`
      /* Push to take whole row in narrow views */
      flex: 0 0 100%;
    `,
  )}
`;

const TagListColumn = styled(TagList)`
  padding: 0 2px;
  display: inline-block;
  flex: 3;
  margin: -2px -4px -2px 0;
  ${mediaBreakpointDown(
    "xs",
    css`
      flex: 0 0 100%;
    `,
  )}
`;

// Priority and stuck status, shown as icons instead of tag chips.
const PuzzleStatusColumn = styled(PuzzleColumn)`
  flex: 1;
  ${mediaBreakpointDown(
    "xs",
    css`
      flex: 0 0 100%;
    `,
  )}
`;

// Meta/metameta status, shown as a badge instead of tag chips.
const PuzzleMetaColumn = styled(PuzzleColumn)`
  flex: 1.5;
  font-size: 1.1rem;
  ${mediaBreakpointDown(
    "xs",
    css`
      flex: 0 0 100%;
    `,
  )}
`;

const MetaBadge = styled(Badge)`
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
`;

const NOTE_PREVIEW_LENGTH = 250;
const truncateNote = (text: string) =>
  text.length <= NOTE_PREVIEW_LENGTH
    ? text
    : `${text.slice(0, NOTE_PREVIEW_LENGTH)}…`;

const Puzzle = React.memo(
  ({
    puzzle,
    bookmarked,
    allTags,
    canUpdate,
    suppressTags,
    segmentAnswers,
  }: {
    puzzle: PuzzleType;
    bookmarked: boolean;
    // All tags associated with the hunt.
    allTags: TagType[];
    canUpdate: boolean;
    suppressTags?: string[];
    segmentAnswers?: boolean;
  }) => {
    const [operatorActionsHidden] = useOperatorActionsHiddenForHunt(
      puzzle.hunt,
    );
    const showEdit = canUpdate && !operatorActionsHidden;

    // Generating the edit modals for all puzzles is expensive, so we do it
    // lazily. The first time the modal button is clicked, we change this state
    // variable, which causes us to mount a new modal, which is set to open on
    // mount. Subsequent times, we just open the existing modal.
    const [showEditModal, setShowEditModal] = useState(false);
    const editModalRef =
      useRef<React.ComponentRef<typeof PuzzleModalForm>>(null);
    const [renderDeleteModal, setRenderDeleteModal] = useState(false);
    const deleteModalRef =
      useRef<React.ComponentRef<typeof PuzzleDeleteModal>>(null);

    // A locked puzzle only renders as such while its hunt allows them, so
    // turning the hunt setting off turns these back into ordinary rows.
    const allowUnlockablePuzzles = useTracker(
      () => Hunts.findOne(puzzle.hunt)?.allowUnlockablePuzzles ?? false,
      [puzzle.hunt],
    );
    const renderAsLocked = (puzzle.locked ?? false) && allowUnlockablePuzzles;
    const feedbacks = useTracker(
      () =>
        renderAsLocked
          ? PuzzleFeedbacks.find({ puzzle: puzzle._id }).fetch()
          : [],
      [puzzle._id, renderAsLocked],
    );
    const myFeedback = useTracker(
      () =>
        renderAsLocked
          ? PuzzleFeedbacks.findOne({
              puzzle: puzzle._id,
              createdBy: Meteor.userId()!,
            })
          : undefined,
      [puzzle._id, renderAsLocked],
    );
    const interestScore = feedbacks.reduce((acc, f) => acc + f.score, 0);
    const [showInterestPopover, setShowInterestPopover] = useState(false);
    const interestButtonRef = useRef<HTMLButtonElement>(null);
    const toggleInterestPopover = useCallback(() => {
      setShowInterestPopover((shown) => !shown);
    }, []);
    const hideInterestPopover = useCallback(() => {
      setShowInterestPopover(false);
    }, []);
    const [renderUnlockModal, setRenderUnlockModal] = useState(false);
    const unlockModalRef = useRef<PuzzleUnlockModalHandle>(null);
    const onShowUnlockModal = useCallback(() => {
      if (renderUnlockModal && unlockModalRef.current) {
        unlockModalRef.current.show();
      } else {
        setRenderUnlockModal(true);
      }
    }, [renderUnlockModal]);

    const onEdit = useCallback(
      (
        state: PuzzleModalFormSubmitPayload,
        callback: (error?: Error) => void,
      ) => {
        const { huntId: _huntId, docType: _docType, ...rest } = state;
        updatePuzzle.call({ puzzleId: puzzle._id, ...rest }, callback);
      },
      [puzzle._id],
    );

    const onShowEditModal = useCallback(() => {
      if (showEditModal && editModalRef.current) {
        editModalRef.current.show();
      } else {
        setShowEditModal(true);
      }
    }, [showEditModal]);
    const onShowDeleteModal = useCallback(() => {
      if (renderDeleteModal && deleteModalRef.current) {
        deleteModalRef.current.show();
      } else {
        setRenderDeleteModal(true);
      }
    }, [renderDeleteModal]);

    const theme = useTheme();

    const { t } = useTranslation();

    const editButtons = useMemo(() => {
      if (showEdit) {
        return (
          <>
            <StyledButton
              onClick={onShowEditModal}
              variant={theme.basicMode}
              title={`${t("puzzle.edit.editPuzzle", "Edit puzzle")}...`}
            >
              <FontAwesomeIcon icon={faEdit} />
            </StyledButton>
            {!puzzle.deleted && (
              <StyledButton
                onClick={onShowDeleteModal}
                variant={theme.basicMode}
                title={`${t("puzzle.delete.deletePuzzle", "Delete puzzle")}...`}
              >
                <FontAwesomeIcon icon={faMinus} />
              </StyledButton>
            )}
          </>
        );
      }
      return null;
    }, [
      showEdit,
      puzzle.deleted,
      onShowEditModal,
      onShowDeleteModal,
      theme.basicMode,
      t,
    ]);

    // A sticky-note icon previews the notes posted from the puzzle's sheet.
    const noteLines = useMemo(() => {
      const note = puzzle.noteContent;
      if (!note) {
        return [];
      }
      const lines = [];
      if (note.flavor) {
        lines.push(
          <div key="flavor">
            <strong>{t("notes.fields.flavorShort", "Flavor")}:</strong>{" "}
            <em>{truncateNote(note.flavor)}</em>
          </div>,
        );
      }
      if (note.summary) {
        lines.push(
          <div key="summary">
            <strong>{t("notes.columns.summary", "Summary")}:</strong>{" "}
            {truncateNote(note.summary)}
          </div>,
        );
      }
      if (note.theories) {
        lines.push(
          <div key="theories">
            <strong>{t("notes.columns.theories", "Theories")}:</strong>{" "}
            <em>{truncateNote(note.theories)}</em>
          </div>,
        );
      }
      return lines;
    }, [puzzle.noteContent, t]);

    // id, title, answer, tags
    const linkTarget = `/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`;
    const tagIndex = indexedById(allTags);
    const tagNames = new Set(
      puzzle.tags.map((tagId) => tagIndex.get(tagId)?.name),
    );

    // Some tags are shown as icons in their own columns rather than as chips.
    const isMetameta = tagNames.has("is:metameta");
    const isMeta =
      !isMetameta &&
      (tagNames.has("is:meta") ||
        [...tagNames].some((name) => name?.startsWith("meta-for:")));
    const isHighPriority = tagNames.has("priority:high");
    const isLowPriority = !isHighPriority && tagNames.has("priority:low");
    const isStuck = tagNames.has("stuck") || tagNames.has("is:stuck");

    const emojifiedTagNames = new Set<string>();
    if (isMetameta) {
      emojifiedTagNames.add("is:metameta");
    } else if (isMeta) {
      emojifiedTagNames.add("is:meta");
    }
    if (isHighPriority) {
      emojifiedTagNames.add("priority:high");
    } else if (isLowPriority) {
      emojifiedTagNames.add("priority:low");
    }
    if (isStuck) {
      emojifiedTagNames.add("stuck");
      emojifiedTagNames.add("is:stuck");
    }

    // Inside a group:X section the meta-for:X chip only repeats the heading.
    const suppressedTagIds = new Set(suppressTags);
    const suppressedMetaForNames = new Set(
      [...suppressedTagIds]
        .map((tagId) => tagIndex.get(tagId)?.name)
        .filter((name): name is string => name?.startsWith("group:") ?? false)
        .map((name) => `meta-for:${name.slice("group:".length)}`),
    );

    const ownTags = puzzle.tags
      .map((tagId) => tagIndex.get(tagId))
      .filter<TagType>((t): t is TagType => t !== undefined)
      .filter(
        (tag) =>
          !suppressedTagIds.has(tag._id) &&
          !emojifiedTagNames.has(tag.name) &&
          !suppressedMetaForNames.has(tag.name),
      );

    const tooltipId = useId();
    let statusIcon;
    let statusText;
    if (isHighPriority) {
      statusIcon = <FontAwesomeIcon icon={faAngleDoubleUp} color="red" />;
      statusText = t("puzzleList.highPriority", "High priority");
    } else if (isLowPriority) {
      statusIcon = <FontAwesomeIcon icon={faAngleDown} />;
      statusText = t("puzzleList.lowPriority", "Low priority");
    }

    const solvedness = computeSolvedness(puzzle);
    const answers = puzzle.answers.map((answer, i) => {
      return (
        <PuzzleAnswer
          key={`${i}-${answer}`}
          answer={answer}
          respace={segmentAnswers}
          breakable={!segmentAnswers}
          indented={!segmentAnswers}
        />
      );
    });

    return (
      <PuzzleDiv $solvedness={solvedness} $locked={renderAsLocked}>
        {showEditModal ? (
          <PuzzleModalForm
            key={puzzle._id}
            ref={editModalRef}
            puzzle={puzzle}
            huntId={puzzle.hunt}
            tags={allTags}
            onSubmit={onEdit}
            showOnMount
          />
        ) : null}
        {renderDeleteModal && (
          <PuzzleDeleteModal ref={deleteModalRef} puzzle={puzzle} />
        )}
        <PuzzleControlButtonsColumn>
          <ButtonGroup size="sm">
            {renderAsLocked ? (
              <>
                <InterestButton
                  ref={interestButtonRef}
                  variant={myFeedback ? "info" : theme.basicMode}
                  onClick={toggleInterestPopover}
                  title={
                    myFeedback
                      ? `${t("puzzle.interest.update", "Update interest")}...`
                      : `${t("puzzle.interest.register", "I'm interested")}...`
                  }
                >
                  <FontAwesomeIcon
                    icon={myFeedback ? faLightbulbSolid : faLightbulbRegular}
                  />
                  {interestScore > 0 && (
                    <Badge bg="light" text="dark">
                      {interestScore}
                    </Badge>
                  )}
                </InterestButton>
                {showEdit && (
                  <StyledButton
                    variant="danger"
                    onClick={onShowUnlockModal}
                    title={`${t("puzzle.unlock.title", "Unlock puzzle")}...`}
                  >
                    <FontAwesomeIcon icon={faUnlock} />
                  </StyledButton>
                )}
              </>
            ) : (
              <BookmarkButton
                puzzleId={puzzle._id}
                bookmarked={bookmarked}
                as={StyledButton}
                variant={theme.basicMode}
              />
            )}
            {showEdit && editButtons}
          </ButtonGroup>
          {renderAsLocked && (
            <PuzzleInterestPopover
              puzzleId={puzzle._id}
              lockedSummary={puzzle.lockedSummary}
              myFeedback={myFeedback}
              target={interestButtonRef.current}
              show={showInterestPopover}
              placement="right"
              onHide={hideInterestPopover}
            />
          )}
          {renderAsLocked && renderUnlockModal && (
            <PuzzleUnlockModal
              ref={unlockModalRef}
              puzzle={puzzle}
              feedbacks={feedbacks}
              showOnMount
            />
          )}
        </PuzzleControlButtonsColumn>
        <PuzzleTitleColumn>
          <Link to={linkTarget}>{puzzle.title}</Link>
          {noteLines.length > 0 && (
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip id={`${tooltipId}-note`}>{noteLines}</Tooltip>}
            >
              <PuzzleNoteIcon>
                <FontAwesomeIcon icon={faNoteSticky} />
              </PuzzleNoteIcon>
            </OverlayTrigger>
          )}
        </PuzzleTitleColumn>
        <PuzzleStatusColumn>
          {statusIcon && (
            <OverlayTrigger
              placement="top"
              overlay={
                <Tooltip id={`${tooltipId}-priority`}>{statusText}</Tooltip>
              }
            >
              <span>{statusIcon}</span>
            </OverlayTrigger>
          )}
          {isStuck && (
            <OverlayTrigger
              placement="top"
              overlay={
                <Tooltip id={`${tooltipId}-stuck`}>
                  {t("puzzleList.stuck", "Stuck")}
                </Tooltip>
              }
            >
              <span>🤷</span>
            </OverlayTrigger>
          )}
        </PuzzleStatusColumn>
        <PuzzleMetaColumn>
          {(isMetameta || isMeta) && (
            <MetaBadge pill bg="warning" text="dark">
              <FontAwesomeIcon icon={faStar} />
              {isMetameta
                ? t("puzzleList.metameta", "Metameta")
                : t("puzzleList.meta", "Meta")}
            </MetaBadge>
          )}
        </PuzzleMetaColumn>
        {renderAsLocked ? (
          <LockedSummaryColumn title={puzzle.lockedSummary}>
            {puzzle.lockedSummary}
          </LockedSummaryColumn>
        ) : (
          <PuzzleActivityColumn>
            {solvedness === "unsolved" && (
              <PuzzleActivity
                huntId={puzzle.hunt}
                puzzleId={puzzle._id}
                unlockTime={puzzle.createdAt}
              />
            )}
          </PuzzleActivityColumn>
        )}
        <PuzzleLinkColumn>
          {puzzle.url ? (
            <span>
              <a
                href={puzzle.url}
                target="_blank"
                rel="noopener noreferrer"
                title={t("puzzleList.openPuzzle", "Open the puzzle")}
                aria-label={t("puzzleList.openPuzzle", "Open the puzzle")}
              >
                <FontAwesomeIcon icon={faPuzzlePiece} />
              </a>
            </span>
          ) : null}
        </PuzzleLinkColumn>
        <PuzzleAnswerColumn>{answers}</PuzzleAnswerColumn>
        <TagListColumn
          puzzle={puzzle}
          tags={ownTags}
          linkToSearch
          popoverRelated={false}
        />
      </PuzzleDiv>
    );
  },
);

export default Puzzle;
