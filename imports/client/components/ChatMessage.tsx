// biome-ignore-all lint/suspicious/noArrayIndexKey: migrated from eslint
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons/faChevronLeft";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons/faChevronRight";
import { faDownload } from "@fortawesome/free-solid-svg-icons/faDownload";
import { faPaperclip } from "@fortawesome/free-solid-svg-icons/faPaperclip";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import BSImage from "react-bootstrap/Image";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { shortCalendarTimeFormat } from "../../lib/calendarTimeFormat";
import chatMessageNodeType from "../../lib/chatMessageNodeType";
import type {
  ChatAttachmentType,
  ChatMessageContentType,
  ChatMessagePuzzleNodeType,
} from "../../lib/models/ChatMessages";
import type { PuzzleType } from "../../lib/models/Puzzles";
import nodeIsImage from "../../lib/nodeIsImage";
import nodeIsMention from "../../lib/nodeIsMention";
import nodeIsRoleMention from "../../lib/nodeIsRoleMention";
import { computeSolvedness } from "../../lib/solvedness";
import { MarkdownText } from "./ChatMarkdown";
import { MentionSpan, PuzzleSpan } from "./FancyEditor";
import {
  LightboxButton,
  LightboxContent,
  LightboxImage,
  LightboxOverlay,
  TopRightButtonGroup,
} from "./Lightbox";

// This file implements standalone rendering for the MessageElement format
// defined by FancyEditor, for use in the chat pane.

const AttachmentLinkTrigger = styled.a`
  cursor: pointer;
  color: ${(props) => props.theme.colors.linkColor ?? "#0d6efd"};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    color: ${(props) => props.theme.colors.linkHoverColor ?? "#0a58ca"};
  }

  small {
    /* Ensure small tag inherits color */
    color: inherit;
  }
`;
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

const ChatMessage = ({
  message,
  displayNames,
  puzzleData,
  selfUserId,
  timestamp,
  attachments,
  roles,
  imageOnLoad,
}: {
  message: ChatMessageContentType;
  displayNames: Map<string, string>;
  puzzleData: Map<string, PuzzleType>;
  selfUserId: string;
  timestamp?: Date;
  attachments?: ChatAttachmentType[];
  roles: string[];
  imageOnLoad?: () => void;
}) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const imageAttachments = useMemo(
    () => attachments?.filter((a) => a.mimeType.startsWith("image/")) ?? [],
    [attachments],
  );
  const openLightbox = useCallback((index: number) => {
    setCurrentImageIndex(index);
    setIsLightboxOpen(true);
  }, []);
  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);
  const navigateLightbox = useCallback(
    (direction: "prev" | "next") => {
      setCurrentImageIndex((prevIndex) => {
        if (direction === "prev") {
          return prevIndex > 0 ? prevIndex - 1 : imageAttachments.length - 1;
        } else {
          return prevIndex < imageAttachments.length - 1 ? prevIndex + 1 : 0;
        }
      });
    },
    [imageAttachments.length],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isLightboxOpen) {
        if (event.key === "Escape") {
          closeLightbox();
        } else if (event.key === "ArrowLeft") {
          navigateLightbox("prev");
        } else if (event.key === "ArrowRight") {
          navigateLightbox("next");
        }
      }
    };

    if (isLightboxOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen, closeLightbox, navigateLightbox]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeLightbox();
    }
  };

  const children = message.children.map((child, i) => {
    if (nodeIsMention(child)) {
      const displayName = displayNames.get(child.userId);
      return (
        <MentionSpan key={i} $isSelf={child.userId === selfUserId}>
          @{`${displayName ?? child.userId}`}
        </MentionSpan>
      );
    } else if (chatMessageNodeType(child) === "puzzle") {
      const puzzleNode = child as ChatMessagePuzzleNodeType;
      const puzzle = puzzleData ? puzzleData.get(puzzleNode.puzzleId) : null;
      if (puzzle) {
        const solvedness = computeSolvedness(puzzle);
        return (
          <PuzzleSpan key={i} $solvedness={solvedness}>
            <FontAwesomeIcon icon={faPuzzlePiece} />{" "}
            <Link
              target="_blank"
              to={`/hunts/${puzzle.hunt}/puzzles/${puzzleNode.puzzleId}`}
            >
              {puzzle?.title ?? "(unnamed puzzle)"}
            </Link>
          </PuzzleSpan>
        );
      }
      return (
        <MentionSpan key={i} $isSelf={false}>
          <FontAwesomeIcon icon={faPuzzlePiece} /> (unknown puzzle)
        </MentionSpan>
      );
    } else if (nodeIsRoleMention(child)) {
      const hasRole = roles.includes(child.roleId);
      return (
        <MentionSpan key={i} $isSelf={hasRole}>
          @{child.roleId}
        </MentionSpan>
      );
    } else if (nodeIsImage(child)) {
      return <ResponsiveImage key={i} src={child.url} onLoadCB={imageOnLoad} />;
    } else {
      // Chat links aren't filtered yet; safeLinks would drop javascript: and
      // other unsafe hrefs here too.
      const text = "text" in child ? child.text : "";
      return <MarkdownText key={i} text={text} />;
    }
  });

  return (
    <div>
      {timestamp ? (
        <span>
          {shortCalendarTimeFormat(timestamp)}:<br />
        </span>
      ) : null}
      {children}
      {attachments?.map((a) => {
        const isImage = a.mimeType.startsWith("image/");
        if (isImage) {
          const imageIndex = imageAttachments.findIndex(
            (img) => img.url === a.url,
          );
          return (
            <React.Fragment key={a.url}>
              <br />
              <AttachmentLinkTrigger
                href={a.url}
                onClick={(e) => {
                  e.preventDefault();
                  if (imageIndex >= 0) {
                    openLightbox(imageIndex);
                  }
                }}
                title={`View image: ${a.filename}`}
              >
                <small>
                  <FontAwesomeIcon icon={faPaperclip} size="sm" />{" "}
                  <em>{a.filename}</em>
                </small>
              </AttachmentLinkTrigger>
            </React.Fragment>
          );
        } else {
          return (
            <React.Fragment key={a.url}>
              <br />
              <Link
                to={a.url}
                target="_blank"
                title={`Download: ${a.filename}`}
                download={imageAttachments[currentImageIndex]?.filename}
              >
                <small>
                  <FontAwesomeIcon icon={faPaperclip} size="sm" />{" "}
                  <em>{a.filename}</em>
                </small>
              </Link>
            </React.Fragment>
          );
        }
      })}
      {isLightboxOpen && imageAttachments.length > 0 && (
        <LightboxOverlay onClick={handleOverlayClick}>
          <LightboxContent>
            <LightboxButton
              $position="center-left"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox("prev");
              }}
              title="Previous image (Left arrow)"
            >
              <FontAwesomeIcon icon={faChevronLeft} size="xs" />
            </LightboxButton>

            <LightboxImage
              src={imageAttachments[currentImageIndex]?.url}
              alt={imageAttachments[currentImageIndex]?.filename}
              onClick={(e) => e.stopPropagation()}
            />
            <LightboxButton
              $position="center-right"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox("next");
              }}
              title="Next image (Right arrow)"
            >
              <FontAwesomeIcon icon={faChevronRight} size="xs" />
            </LightboxButton>
            <TopRightButtonGroup>
              <Link
                to={imageAttachments[currentImageIndex]?.url ?? ""}
                target="_blank"
                download={imageAttachments[currentImageIndex]?.filename}
              >
                <LightboxButton title="Download">
                  <FontAwesomeIcon icon={faDownload} size="2xs" />
                </LightboxButton>
              </Link>
              <LightboxButton
                onClick={(e) => {
                  e.stopPropagation();
                  closeLightbox();
                }}
                title="Close lightbox (Escape)"
              >
                <FontAwesomeIcon icon={faTimes} size="xs" />
              </LightboxButton>
            </TopRightButtonGroup>
          </LightboxContent>
        </LightboxOverlay>
      )}
    </div>
  );
};

export default ChatMessage;
