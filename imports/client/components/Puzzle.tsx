import { faAngleDoubleUp } from "@fortawesome/free-solid-svg-icons/faAngleDoubleUp";
import { faAngleDown } from "@fortawesome/free-solid-svg-icons/faAngleDown";
import { faEdit } from "@fortawesome/free-solid-svg-icons/faEdit";
import { faMinus } from "@fortawesome/free-solid-svg-icons/faMinus";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
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
import type { PuzzleModalFormSubmitPayload } from "./PuzzleModalForm";
import PuzzleModalForm from "./PuzzleModalForm";
import { mediaBreakpointDown } from "./styling/responsive";
import TagList from "./TagList";

const PuzzleDiv = styled.div<{
  $solvedness: Solvedness;
}>`
  background-color: ${({ $solvedness, theme }) => {
    return theme.colors.solvedness[$solvedness];
  }};
  display: flex;
  flex-direction: row;
  align-items: first baseline;
  justify-content: flex-start;
  line-height: 24px;
  padding: 4px 2px;
  margin-bottom: 4px;
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

const PuzzleTitleColumn = styled(PuzzleColumn)`
  flex: 4;
  overflow-wrap: break-word;
  order: -1;
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
      <PuzzleDiv $solvedness={solvedness}>
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
            <BookmarkButton
              puzzleId={puzzle._id}
              bookmarked={bookmarked}
              as={StyledButton}
              variant={theme.basicMode}
            />
            {showEdit && editButtons}
          </ButtonGroup>
        </PuzzleControlButtonsColumn>
        <PuzzleTitleColumn>
          <Link to={linkTarget}>{puzzle.title}</Link>
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
        <PuzzleActivityColumn>
          {solvedness === "unsolved" && (
            <PuzzleActivity
              huntId={puzzle.hunt}
              puzzleId={puzzle._id}
              unlockTime={puzzle.createdAt}
            />
          )}
        </PuzzleActivityColumn>
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
