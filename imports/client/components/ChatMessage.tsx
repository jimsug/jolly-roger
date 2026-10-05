import { useTracker } from "meteor/react-meteor-data";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useRef, useState } from "react";
import BSImage from "react-bootstrap/Image";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styled from "styled-components";
import type { ChatMessageContentType } from "../../lib/models/ChatMessages";
import Puzzles from "../../lib/models/Puzzles";
import nodeIsImage from "../../lib/nodeIsImage";
import nodeIsMention from "../../lib/nodeIsMention";
import nodeIsPuzzle from "../../lib/nodeIsPuzzle";
import nodeIsRoleMention from "../../lib/nodeIsRoleMention";
import { computeSolvedness } from "../../lib/solvedness";
import ChatMarkdown from "./ChatMarkdown";
import { MentionSpan, PuzzleSpan } from "./FancyEditor";

// This file implements standalone rendering for the MessageElement format
// defined by FancyEditor, for use in the chat pane.

const ResponsiveImage = ({
  src,
  onLoadCB,
}: {
  src: string;
  onLoadCB?: () => void;
}) => {
  const [isLarge, setIsLarge] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleLoad = useCallback(() => {
    if (imgRef.current && containerRef.current) {
      const imgWidth = imgRef.current.naturalWidth;
      const containerWidth = containerRef.current.offsetWidth;
      setIsLarge(imgWidth > containerWidth);
    }
    onLoadCB?.();
  }, [onLoadCB]);

  // update on container resize
  useEffect(() => {
    const container = containerRef.current;
    const observer = container ? new ResizeObserver(() => handleLoad()) : null;

    if (observer && container) {
      observer.observe(container);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [handleLoad]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {isLarge ? (
        <a href={src} target="_blank" rel="noopener noreferrer">
          <BSImage
            ref={imgRef}
            src={src}
            onLoad={handleLoad}
            className={isLarge ? "img-thumbnail" : ""}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
            }}
          />
        </a>
      ) : (
        <BSImage
          ref={imgRef}
          src={src}
          onLoad={handleLoad}
          style={{
            display: "block",
          }}
        />
      )}
    </div>
  );
};

// A link to another puzzle in the hunt, looked up here so a change to any
// puzzle only re-renders the mentions of it rather than the whole chat. A
// puzzle the viewer can't see renders as a placeholder.
const PuzzleMention = ({ puzzleId }: { puzzleId: string }) => {
  const { t } = useTranslation();
  const puzzle = useTracker(() => Puzzles.findOne(puzzleId), [puzzleId]);
  if (!puzzle) {
    return (
      <MentionSpan $isSelf={false}>
        <FontAwesomeIcon icon={faPuzzlePiece} />{" "}
        {t("chat.unknownPuzzle", "unknown puzzle")}
      </MentionSpan>
    );
  }
  return (
    <PuzzleSpan $solvedness={computeSolvedness(puzzle)}>
      <FontAwesomeIcon icon={faPuzzlePiece} />{" "}
      <Link
        to={`/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`}
        target="_blank"
        rel="noreferrer"
      >
        {puzzle.title}
      </Link>
    </PuzzleSpan>
  );
};

const DeletedMessage = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
`;

const ChatMessage = ({
  message,
  displayNames,
  selfUserId,
  roles,
  imageOnLoad,
  deleted = false,
}: {
  message: ChatMessageContentType;
  displayNames: Map<string, string>;
  selfUserId: string;
  roles: string[];
  imageOnLoad?: () => void;
  // Its sender deleted it, which leaves this in its place
  deleted?: boolean;
}) => {
  const { t } = useTranslation();
  if (deleted) {
    return (
      <DeletedMessage>{t("chat.deleted", "Message deleted")}</DeletedMessage>
    );
  }

  const children = message.children.map((child, i) => {
    if (nodeIsMention(child)) {
      const displayName = displayNames.get(child.userId);
      return (
        <MentionSpan key={i} $isSelf={child.userId === selfUserId}>
          @{displayName ?? child.userId}
        </MentionSpan>
      );
    } else if (nodeIsRoleMention(child)) {
      const hasRole = roles.includes(child.roleId);
      return (
        <MentionSpan key={i} $isSelf={hasRole}>
          @{child.roleId}
        </MentionSpan>
      );
    } else if (nodeIsPuzzle(child)) {
      return <PuzzleMention key={i} puzzleId={child.puzzleId} />;
    } else if (nodeIsImage(child)) {
      return <ResponsiveImage key={i} src={child.url} onLoadCB={imageOnLoad} />;
    } else {
      return <ChatMarkdown key={i} text={child.text} />;
    }
  });

  return <div>{children}</div>;
};

export default ChatMessage;
