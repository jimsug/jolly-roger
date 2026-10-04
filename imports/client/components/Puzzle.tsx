import { useTracker } from "meteor/react-meteor-data";
import { faEye } from "@fortawesome/free-regular-svg-icons/faEye";
import { faLightbulb as faLightbulbRegular } from "@fortawesome/free-regular-svg-icons/faLightbulb";
import { faAngleDoubleUp } from "@fortawesome/free-solid-svg-icons/faAngleDoubleUp";
import { faAngleDown } from "@fortawesome/free-solid-svg-icons/faAngleDown";
import { faEdit } from "@fortawesome/free-solid-svg-icons/faEdit";
import { faLightbulb as faLightbulbSolid } from "@fortawesome/free-solid-svg-icons/faLightbulb";
import { faMinus } from "@fortawesome/free-solid-svg-icons/faMinus";
import { faNoteSticky } from "@fortawesome/free-solid-svg-icons/faNoteSticky";
import { faPhone } from "@fortawesome/free-solid-svg-icons/faPhone";
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
import MeteorUsers from "../../lib/models/MeteorUsers";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import type { PuzzleViewers } from "../../lib/puzzleViewers";
import type { Solvedness } from "../../lib/solvedness";
import { computeSolvedness } from "../../lib/solvedness";
import updatePuzzle from "../../methods/updatePuzzle";
import { useOperatorActionsHiddenForHunt } from "../hooks/persisted-state";
import usePuzzleInterest from "../hooks/usePuzzleInterest";
import type { AvatarStackUser } from "./AvatarStack";
import AvatarStack from "./AvatarStack";
import BookmarkButton from "./BookmarkButton";
import PuzzleActivity from "./PuzzleActivity";
import PuzzleAnswer from "./PuzzleAnswer";
import PuzzleDeleteModal from "./PuzzleDeleteModal";
import PuzzleInterestPopover from "./PuzzleInterestPopover";
import type { PuzzleModalFormSubmitPayload } from "./PuzzleModalForm";
import PuzzleModalForm from "./PuzzleModalForm";
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
  ${({ $locked, theme }) =>
    $locked &&
    css`
      background-image: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 8px,
        ${theme.colors.lockedPuzzleStripe} 8px,
        ${theme.colors.lockedPuzzleStripe} 16px
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

// Stands in for the viewers column while the puzzle is locked (or for the
// activity column when viewers are hidden), at the same size, so the columns
// after it line up with the unlocked rows'.
const LockedSummaryColumn = styled(PuzzleColumn)<{ $viewersShown: boolean }>`
  ${({ $viewersShown }) =>
    $viewersShown
      ? css`
          flex: 3;
        `
      : css`
          width: 11rem;
        `}
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

const PriorityHighIcon = styled(FontAwesomeIcon)`
  color: ${({ theme }) => theme.colors.priorityHighIcon};
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

// Who is on the call and who is looking at the puzzle
const ViewersColumn = styled(PuzzleColumn)`
  flex: 3;
  cursor: default;
  ${mediaBreakpointDown(
    "xs",
    css`
      flex: 0 0 100%;
    `,
  )}
`;

const ViewerRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  line-height: normal;
`;

const ViewerTooltipLine = styled.div<{ $passive?: boolean }>`
  text-align: left;
  ${({ $passive }) =>
    $passive &&
    css`
      font-style: italic;
      opacity: 0.8;
    `}
`;

const NO_VIEWER_USERS: {
  callerUsers: AvatarStackUser[];
  viewerUsers: AvatarStackUser[];
} = { callerUsers: [], viewerUsers: [] };

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
    showViewers = false,
    viewers,
  }: {
    puzzle: PuzzleType;
    bookmarked: boolean;
    // All tags associated with the hunt.
    allTags: TagType[];
    canUpdate: boolean;
    suppressTags?: string[];
    segmentAnswers?: boolean;
    // Whether to show who is on the puzzle, and who that is
    showViewers?: boolean;
    viewers?: PuzzleViewers;
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
    const {
      interests,
      myInterest,
      interestScore,
      showInterestPopover,
      interestButtonRef,
      toggleInterestPopover,
      hideInterestPopover,
      renderUnlockModal,
      unlockModalRef,
      showUnlockModal,
    } = usePuzzleInterest(puzzle._id, renderAsLocked);

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
            <strong>{t("puzzle.notePreview.flavor", "Flavor")}:</strong>{" "}
            <em>{truncateNote(note.flavor)}</em>
          </div>,
        );
      }
      if (note.summary) {
        lines.push(
          <div key="summary">
            <strong>{t("puzzle.notePreview.summary", "Summary")}:</strong>{" "}
            {truncateNote(note.summary)}
          </div>,
        );
      }
      if (note.theories) {
        lines.push(
          <div key="theories">
            <strong>{t("puzzle.notePreview.theories", "Theories")}:</strong>{" "}
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

    // Display names and avatars come from the list page's subscriptions
    const { callerUsers, viewerUsers } = useTracker(() => {
      if (!showViewers || !viewers) {
        return NO_VIEWER_USERS;
      }
      const toUsers = (ids: string[], isPassive: boolean): AvatarStackUser[] =>
        ids.flatMap((id) => {
          const user = MeteorUsers.findOne(id);
          return user?.displayName
            ? [
                {
                  _id: id,
                  displayName: user.displayName,
                  discordAccount: user.discordAccount,
                  isPassive,
                },
              ]
            : [];
        });
      return {
        callerUsers: toUsers(viewers.rtcViewers, false),
        viewerUsers: [
          ...toUsers(viewers.activeViewers, false),
          ...toUsers(viewers.passiveViewers, true),
        ],
      };
    }, [showViewers, viewers]);
    const activeViewers = viewerUsers.filter((u) => !u.isPassive);
    const passiveViewers = viewerUsers.filter((u) => u.isPassive);
    const viewersTooltip = (
      <Tooltip id={`${tooltipId}-viewers`}>
        {callerUsers.length > 0 && (
          <ViewerTooltipLine>
            <FontAwesomeIcon icon={faPhone} />{" "}
            {callerUsers.map((u) => u.displayName).join(", ")}
          </ViewerTooltipLine>
        )}
        {activeViewers.length > 0 && (
          <ViewerTooltipLine>
            <FontAwesomeIcon icon={faEye} />{" "}
            {activeViewers.map((u) => u.displayName).join(", ")}
          </ViewerTooltipLine>
        )}
        {passiveViewers.length > 0 && (
          <ViewerTooltipLine $passive>
            {passiveViewers.map((u) => u.displayName).join(", ")}
          </ViewerTooltipLine>
        )}
      </Tooltip>
    );

    let statusIcon;
    let statusText;
    if (isHighPriority) {
      statusIcon = <PriorityHighIcon icon={faAngleDoubleUp} />;
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
                  variant={myInterest ? "info" : theme.basicMode}
                  onClick={toggleInterestPopover}
                  title={
                    myInterest
                      ? `${t("puzzle.interest.update", "Update interest")}...`
                      : `${t("puzzle.interest.register", "I'm interested")}...`
                  }
                >
                  <FontAwesomeIcon
                    icon={myInterest ? faLightbulbSolid : faLightbulbRegular}
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
                    onClick={showUnlockModal}
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
              myInterest={myInterest}
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
              interests={interests}
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
          <>
            <LockedSummaryColumn
              $viewersShown={showViewers}
              title={puzzle.lockedSummary}
            >
              {puzzle.lockedSummary}
            </LockedSummaryColumn>
            {showViewers && <PuzzleActivityColumn />}
          </>
        ) : (
          <>
            {showViewers && (
              <ViewersColumn>
                {solvedness === "unsolved" &&
                  (callerUsers.length > 0 || viewerUsers.length > 0) && (
                    <OverlayTrigger placement="left" overlay={viewersTooltip}>
                      <div>
                        {callerUsers.length > 0 && (
                          <ViewerRow>
                            <FontAwesomeIcon icon={faPhone} />
                            <AvatarStack
                              users={callerUsers}
                              withTooltip={false}
                            />
                          </ViewerRow>
                        )}
                        {viewerUsers.length > 0 && (
                          <ViewerRow>
                            <FontAwesomeIcon icon={faEye} />
                            <AvatarStack
                              users={viewerUsers}
                              withTooltip={false}
                            />
                          </ViewerRow>
                        )}
                      </div>
                    </OverlayTrigger>
                  )}
              </ViewersColumn>
            )}
            <PuzzleActivityColumn>
              {solvedness === "unsolved" && (
                <PuzzleActivity
                  huntId={puzzle.hunt}
                  puzzleId={puzzle._id}
                  unlockTime={puzzle.createdAt}
                />
              )}
            </PuzzleActivityColumn>
          </>
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
