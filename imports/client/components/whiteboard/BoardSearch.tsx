import { useTracker } from "meteor/react-meteor-data";
import React, { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Puzzles from "../../../lib/models/Puzzles";
import Tags from "../../../lib/models/Tags";
import WhiteboardEdges from "../../../lib/models/WhiteboardEdges";
import WhiteboardNodes from "../../../lib/models/WhiteboardNodes";
import type {
  BoardSearchHit,
  BoardSearchKind,
} from "../../../lib/whiteboard/search";
import { searchBoard, searchKeys } from "../../../lib/whiteboard/search";
import useTagSynonyms from "../../hooks/useTagSynonyms";
import { compilePuzzleMatcher } from "../../search";

const SearchBox = styled.div`
  position: relative;

  input {
    width: 180px;
  }
`;

const Results = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  width: 300px;
  max-height: 50vh;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
  font-size: 13px;
`;

const Result = styled.li<{ $active: boolean; $muted: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 8px;
  cursor: ${({ $muted }) => ($muted ? "default" : "pointer")};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.hoverChatMessageBackground : "transparent"};
`;

const ResultLabel = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ResultNote = styled.span`
  flex: none;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PutBack = styled.button`
  flex: none;
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.colors.primary};
  text-decoration: underline;
`;

const NoResults = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  width: 300px;
  padding: 8px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// The search field on the board's toolbar, with what it finds in a list
// under it.
const BoardSearch = ({
  boardId,
  huntId,
  shownLines,
  canPutBack,
  inputRef,
  onShow,
  onPutBack,
}: {
  boardId: string;
  huntId: string;
  // The lines the board draws, counting those inside collapsed frames, by
  // id.
  shownLines: ReadonlySet<string>;
  // Whether a puzzle or frame that isn't on the board can be put back from
  // here.
  canPutBack: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onShow: (hit: BoardSearchHit) => void;
  onPutBack: (hit: BoardSearchHit) => void;
}) => {
  const { t } = useTranslation();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const tagSynonyms = useTagSynonyms();
  const hits = useTracker(() => {
    if (searchKeys(query).length === 0) return [];
    const tags = Tags.find({ hunt: huntId }).fetch();
    return searchBoard({
      query,
      nodes: WhiteboardNodes.find(
        {
          board: boardId,
          type: { $in: ["puzzle", "frame", "sticky", "text"] },
        },
        {
          projection: {
            type: 1,
            puzzle: 1,
            hidden: 1,
            label: 1,
            tag: 1,
            text: 1,
          },
        },
      ).fetch(),
      edges: WhiteboardEdges.find(
        { board: boardId, label: { $exists: true } },
        { projection: { label: 1 } },
      ).fetch(),
      shownLines,
      puzzles: Puzzles.find({
        hunt: huntId,
        kind: { $ne: "whiteboard" },
      }).fetch(),
      puzzleMatcher: (keys) =>
        compilePuzzleMatcher(tags, keys, undefined, tagSynonyms),
      tagNames: new Map(tags.map((tag) => [tag._id, tag.name])),
    });
  }, [query, boardId, huntId, shownLines, tagSynonyms]);

  const kindNames: Record<BoardSearchKind, string> = {
    puzzle: t("whiteboard.search.kind.puzzle", "Puzzle"),
    frame: t("whiteboard.search.kind.frame", "Frame"),
    sticky: t("whiteboard.search.kind.sticky", "Note"),
    text: t("whiteboard.search.kind.text", "Text"),
    line: t("whiteboard.search.kind.line", "Line"),
  };

  // Picking a puzzle or frame that isn't on the board does nothing: it can
  // only be put back with its own button, so a search never moves anything
  // by itself.
  const pick = useCallback(
    (hit: BoardSearchHit | undefined) => {
      if (!hit || hit.notOnBoard) return;
      setOpen(false);
      onShow(hit);
    },
    [onShow],
  );

  const putBack = useCallback(
    (hit: BoardSearchHit) => {
      if (!canPutBack) return;
      setOpen(false);
      onPutBack(hit);
    },
    [canPutBack, onPutBack],
  );

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setActive(0);
    setOpen(true);
  }, []);

  const onFocus = useCallback(() => setOpen(true), []);
  const onBlur = useCallback(() => setOpen(false), []);

  // The highlighted row, which a list that shrank while open may have lost.
  const current = Math.min(active, Math.max(hits.length - 1, 0));

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const count = hits.length;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setOpen(true);
          if (count > 0) setActive((current + 1) % count);
          break;
        case "ArrowUp":
          event.preventDefault();
          setOpen(true);
          if (count > 0) setActive((current - 1 + count) % count);
          break;
        case "Enter":
          event.preventDefault();
          pick(hits[current]);
          break;
        case "Escape":
          event.preventDefault();
          if (open && query) {
            setOpen(false);
          } else {
            setQuery("");
            event.currentTarget.blur();
          }
          break;
        default:
          break;
      }
    },
    [hits, current, open, query, pick],
  );

  const showResults = open && searchKeys(query).length > 0;
  const showList = showResults && hits.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;
  const label = t("whiteboard.search.label", "Search the board");

  return (
    <SearchBox>
      <input
        ref={inputRef}
        type="search"
        className="form-control form-control-sm"
        value={query}
        placeholder={label}
        aria-label={label}
        title={
          navigator.userAgent.includes("Mac")
            ? t(
                "whiteboard.search.titleMac",
                "Search puzzles, answers, frames, notes and line labels (/ or ⌘F)",
              )
            : t(
                "whiteboard.search.title",
                "Search puzzles, answers, frames, notes and line labels (/ or Ctrl+F)",
              )
        }
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? optionId(current) : undefined}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {showResults && hits.length === 0 && (
        <NoResults>
          {t("whiteboard.search.none", "Nothing on the board matches.")}
        </NoResults>
      )}
      {showList && (
        <Results
          id={listId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a select can't list results under a text field
          role="listbox"
          aria-label={label}
        >
          {hits.map((hit, index) => (
            <SearchResult
              key={hit.key}
              id={optionId(index)}
              hit={hit}
              active={index === current}
              canPutBack={canPutBack}
              kindName={kindNames[hit.kind]}
              onPick={pick}
              onPutBack={putBack}
            />
          ))}
        </Results>
      )}
    </SearchBox>
  );
};

const SearchResult = ({
  id,
  hit,
  active,
  canPutBack,
  kindName,
  onPick,
  onPutBack,
}: {
  id: string;
  hit: BoardSearchHit;
  active: boolean;
  canPutBack: boolean;
  kindName: string;
  onPick: (hit: BoardSearchHit) => void;
  onPutBack: (hit: BoardSearchHit) => void;
}) => {
  const { t } = useTranslation();
  // Keeps focus in the search field, which would otherwise close the list
  // before the click arrives.
  const onMouseDown = useCallback(
    (event: React.MouseEvent) => event.preventDefault(),
    [],
  );
  const onClick = useCallback(() => onPick(hit), [onPick, hit]);
  const onPutBackClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onPutBack(hit);
    },
    [onPutBack, hit],
  );
  return (
    <Result
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option outside a select, for the listbox above
      role="option"
      tabIndex={-1}
      aria-selected={active}
      aria-disabled={!!hit.notOnBoard}
      $active={active}
      $muted={!!hit.notOnBoard}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <ResultLabel title={hit.label}>{hit.label}</ResultLabel>
      <ResultNote>
        {hit.notOnBoard
          ? t("whiteboard.search.notOnBoard", "Not on the board")
          : kindName}
      </ResultNote>
      {hit.notOnBoard && canPutBack && (
        <PutBack type="button" tabIndex={-1} onClick={onPutBackClick}>
          {t("whiteboard.hidden.putBack", "Put back")}
        </PutBack>
      )}
    </Result>
  );
};

export default BoardSearch;
