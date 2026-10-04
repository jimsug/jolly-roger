import { useTracker } from "meteor/react-meteor-data";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons/faChevronDown";
import { faCopy } from "@fortawesome/free-solid-svg-icons/faCopy";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import FormCheck from "react-bootstrap/FormCheck";
import Overlay from "react-bootstrap/Overlay";
import Popover from "react-bootstrap/Popover";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styled from "styled-components";
import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import WhiteboardNodes from "../../../lib/models/WhiteboardNodes";
import type { Solvedness } from "../../../lib/solvedness";
import { computeSolvedness } from "../../../lib/solvedness";
import {
  feederAnswersText,
  feederCounts,
  feedersOf,
} from "../../../lib/whiteboard/feeders";
import { useWhiteboardFeederOrder } from "../../hooks/persisted-state";
import useTagSynonyms from "../../hooks/useTagSynonyms";
import CopyToClipboardButton from "../CopyToClipboardButton";
import PuzzleAnswers from "../PuzzleAnswers";

const ChevronButton = styled(Button)`
  flex: 0 0 auto;
  padding: 0 4px;
  font-size: 12px;
  line-height: 1;
  color: inherit;
`;

const FeedersPopover = styled(Popover)`
  width: 320px;
  max-width: calc(100vw - 16px);
`;

const Header = styled(Popover.Header)`
  display: flex;
  align-items: baseline;
  gap: 8px;
`;

const Count = styled.span`
  margin-left: auto;
  font-size: 13px;
  font-weight: normal;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

const Rows = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 50vh;
  overflow-y: auto;
`;

const Row = styled.li<{ $solvedness: Solvedness }>`
  border-radius: 4px;
  margin-bottom: 2px;
  background-color: ${({ theme, $solvedness }) =>
    theme.colors.solvedness[$solvedness]};

  a {
    display: flex;
    flex-direction: column;
    padding: 2px 6px;
    color: ${({ theme, $solvedness }) =>
      $solvedness === "unsolved" ? theme.colors.textSecondary : "inherit"};
    text-decoration: none;
  }
`;

const RowTitle = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowDetail = styled.span`
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// What the Feeders popover shows. It's only mounted while the popover is
// open, so it reads the hunt's puzzles and tags, the board's cards and the
// viewer's saved order afresh each time it opens.
const FeedersContents = ({
  puzzleId,
  huntId,
  boardId,
  showLocks,
  idPrefix,
}: {
  puzzleId: string;
  huntId: string;
  boardId: string;
  showLocks: boolean;
  idPrefix: string;
}) => {
  const { t } = useTranslation();
  const [order, setOrder] = useWhiteboardFeederOrder();
  const toggleOrder = useCallback(
    () => setOrder(order === "solveTime" ? "board" : "solveTime"),
    [order, setOrder],
  );
  const synonyms = useTagSynonyms();

  const feeders = useTracker(() => {
    const puzzles = Puzzles.find(
      { hunt: huntId, kind: { $ne: "whiteboard" } },
      {
        projection: {
          tags: 1,
          title: 1,
          answers: 1,
          expectedAnswerCount: 1,
          completedWithNoAnswer: 1,
          locked: 1,
          lockedSummary: 1,
          hunt: 1,
          updatedAt: 1,
        },
      },
    ).fetch();
    const meta = puzzles.find((p) => p._id === puzzleId);
    if (!meta) return [];
    const tags = Tags.find(
      { hunt: huntId },
      { projection: { name: 1 } },
    ).fetch();
    const nodes = WhiteboardNodes.find(
      { board: boardId, type: { $in: ["frame", "puzzle"] } },
      {
        projection: {
          type: 1,
          puzzle: 1,
          parent: 1,
          position: 1,
          hidden: 1,
        },
      },
    ).fetch();
    return feedersOf(meta, puzzles, tags, nodes, { order, synonyms });
  }, [huntId, puzzleId, boardId, order, synonyms]);

  const { solved, total } = useMemo(() => feederCounts(feeders), [feeders]);
  const answersText = useMemo(() => feederAnswersText(feeders), [feeders]);

  return (
    <>
      <Header as="h3">
        {t("whiteboard.feeders.title", "Feeders")}
        {total > 0 && (
          <Count>
            {t("whiteboard.feeders.count", "{{solved}} of {{total}} solved", {
              solved,
              total,
            })}
          </Count>
        )}
      </Header>
      <Popover.Body>
        {feeders.length === 0 ? (
          t("whiteboard.feeders.none", "Nothing feeds this meta yet.")
        ) : (
          <>
            <Controls>
              <FormCheck
                type="switch"
                id={`${idPrefix}-solve-time`}
                label={t("whiteboard.feeders.bySolveTime", "By solve time")}
                checked={order === "solveTime"}
                onChange={toggleOrder}
              />
              <CopyToClipboardButton
                size="sm"
                variant="outline-secondary"
                text={answersText}
                tooltipText={t(
                  "whiteboard.feeders.copyTooltip",
                  "Copy the answers in this order, one puzzle per line",
                )}
              >
                <FontAwesomeIcon icon={faCopy} />{" "}
                {t("whiteboard.feeders.copy", "Copy answers")}
              </CopyToClipboardButton>
            </Controls>
            <Rows>
              {feeders.map((p) => {
                const locked = showLocks && !!p.locked;
                let detail: React.ReactNode = null;
                if (locked) {
                  detail = (
                    <>
                      <FontAwesomeIcon icon={faLock} />{" "}
                      {p.lockedSummary ??
                        t("whiteboard.feeders.locked", "Locked")}
                    </>
                  );
                } else if (p.answers.length > 0) {
                  detail = <PuzzleAnswers answers={p.answers} />;
                }
                return (
                  <Row key={p._id} $solvedness={computeSolvedness(p)}>
                    <Link to={`/hunts/${p.hunt}/puzzles/${p._id}`}>
                      <RowTitle>{p.title}</RowTitle>
                      {detail && <RowDetail>{detail}</RowDetail>}
                    </Link>
                  </Row>
                );
              })}
            </Rows>
          </>
        )}
      </Popover.Body>
    </>
  );
};

// The chevron on a meta card that lists the puzzles feeding it, with their
// answers, for working on the meta.
const FeedersButton = ({
  puzzleId,
  huntId,
  boardId,
  showLocks,
}: {
  puzzleId: string;
  huntId: string;
  boardId: string;
  // The hunt has locked puzzles, so they show as locked.
  showLocks: boolean;
}) => {
  const { t } = useTranslation();
  const idPrefix = useId();
  const target = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);
  const toggle = useCallback(() => setShow((shown) => !shown), []);
  const hide = useCallback(() => setShow(false), []);

  // Escape closes the popover before anything else: it's caught on its way
  // down, so the board's own Escape (closing a thread or History, leaving a
  // preview) waits for the next press.
  useEffect(() => {
    if (!show) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      hide();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [show, hide]);

  const label = t("whiteboard.feeders.button", "Feeders");
  return (
    <>
      <ChevronButton
        ref={target}
        size="sm"
        variant="link"
        className="nodrag nopan"
        title={label}
        aria-label={label}
        aria-expanded={show}
        onClick={toggle}
      >
        <FontAwesomeIcon icon={faChevronDown} />
      </ChevronButton>
      <Overlay
        show={show}
        target={target}
        placement="bottom"
        rootClose
        onHide={hide}
      >
        <FeedersPopover id={`${idPrefix}-feeders`} className="nokey">
          <FeedersContents
            puzzleId={puzzleId}
            huntId={huntId}
            boardId={boardId}
            showLocks={showLocks}
            idPrefix={idPrefix}
          />
        </FeedersPopover>
      </Overlay>
    </>
  );
};

export default FeedersButton;
