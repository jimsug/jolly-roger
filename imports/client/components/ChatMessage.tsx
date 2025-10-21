// biome-ignore-all lint/suspicious/noArrayIndexKey: migrated from eslint
import * as he from "he";
import type { Token, Tokens } from "marked";
import { marked } from "marked";
import { useCallback, useEffect, useRef, useState } from "react";
import BSImage from "react-bootstrap/Image";
import styled from "styled-components";
import type { ChatMessageContentType } from "../../lib/models/ChatMessages";
import nodeIsImage from "../../lib/nodeIsImage";
import nodeIsMention from "../../lib/nodeIsMention";
import nodeIsRoleMention from "../../lib/nodeIsRoleMention";
import { MentionSpan } from "./FancyEditor";
import {
  faChevronLeft,
  faChevronRight,
  faPaperclip,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { faDownload } from "@fortawesome/free-solid-svg-icons/faDownload";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "react-router-dom";
import { shortCalendarTimeFormat } from "../../lib/calendarTimeFormat";
import chatMessageNodeType from "../../lib/chatMessageNodeType";
import type { PuzzleType } from "../../lib/models/Puzzles";
import { computeSolvedness } from "../../lib/solvedness";
import type { Theme } from "../theme";
import {
  LightboxOverlay,
  LightboxContent,
  LightboxButton,
  LightboxImage,
  TopRightButtonGroup,
} from "./Lightbox";

// This file implements standalone rendering for the MessageElement format
// defined by FancyEditor, for use in the chat pane.

const PreWrapSpan = styled.span`
  white-space: pre-wrap;
`;

const PreWrapParagraph = styled.p`
  display: inline;
  white-space: pre-wrap;
  margin-bottom: 0;
`;

const StyledBlockquote = styled.blockquote`
  border-left: 2px solid #88a;
  padding-left: 4px;
  margin-bottom: 0;
`;

const StyledCodeBlock = styled.code`
  white-space: pre-wrap;
  display: block;
  border-radius: 4px;
  padding: 4px;
  width: 100%;
  background-color: #eee;
  color: black;
  margin-bottom: 0;
`;

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

// Renders a markdown token to React components.
const MarkdownToken = ({
  token,
  truncate,
}: {
  token: Token;
  // truncate only applies to this immediate node; it isn't propagated
  truncate?: boolean;
}) => {
  // NOTE: Marked's lexer encodes using HTML entities in the text; see:
  // https://github.com/markedjs/marked/discussions/1737
  // We need to decode the text since React will apply its own escaping.
  if (token.type === "text") {
    const text =
      truncate && token.raw.length > 100
        ? `${token.raw.slice(0, 100)}…`
        : token.raw;
    return <PreWrapSpan>{text}</PreWrapSpan>;
  } else if (token.type === "space") {
    return <PreWrapSpan>{token.raw}</PreWrapSpan>;
  } else if (token.type === "paragraph") {
    // If the raw text includes a newline but the consumed text does not,
    // insert the additional space at the end.
    const children = (token as Tokens.Paragraph).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} />
    ));
    const decodedText = he.decode(token.text);
    if (token.raw.length > decodedText.length) {
      const trail = token.raw.substring(decodedText.length);
      if (trail.trim() === "") {
        const syntheticSpace: Tokens.Space = {
          type: "space",
          raw: trail,
        };
        children.push(
          <MarkdownToken key={children.length} token={syntheticSpace} />,
        );
      }
    }
    return <PreWrapParagraph>{children}</PreWrapParagraph>;
  } else if (token.type === "link") {
    const linkToken = token as Tokens.Link;
    // If the link text and the href are identical, this is probably an auto-link, so truncate it
    const truncate =
      linkToken.tokens.length === 1 && linkToken.text === linkToken.href;
    const children = linkToken.tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} truncate={truncate} />
    ));
    return (
      <a target="_blank" rel="noopener noreferrer" href={token.href}>
        {children}
      </a>
    );
  } else if (token.type === "blockquote") {
    const children = (token as Tokens.Blockquote).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} />
    ));
    return <StyledBlockquote>{children}</StyledBlockquote>;
  } else if (token.type === "strong") {
    const children = (token as Tokens.Strong).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} />
    ));
    if (token.raw.startsWith("__")) {
      return <u>{children}</u>;
    } else {
      return <strong>{children}</strong>;
    }
  } else if (token.type === "em") {
    const children = (token as Tokens.Em).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} />
    ));
    return <em>{children}</em>;
  } else if (token.type === "del") {
    const children = (token as Tokens.Del).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} />
    ));
    return <del>{children}</del>;
  } else if (token.type === "codespan") {
    const decodedText = he.decode(token.text);
    return <code>{decodedText}</code>;
  } else if (token.type === "code") {
    // Text in code blocks is _not_ encoded, so pass it through as is.
    return <StyledCodeBlock>{token.text}</StyledCodeBlock>;
  } else {
    // Unhandled token types: just return the raw string with pre-wrap.
    // This covers things like bulleted or numbered lists, which we explicitly
    // do not want to render semantically because markdown does terribly
    // surprising things with the numbers in ordered lists and only supporting
    // unordered lists would be confusing.
    return <PreWrapSpan>{token.raw}</PreWrapSpan>;
  }
};

const ChatMessage = ({
  message,
  displayNames,
  selfUserId,
  roles,
  imageOnLoad,
  timestamp,
  attachments,
}: {
  message: ChatMessageContentType;
  displayNames: Map<string, string>;
  selfUserId: string;
  roles: string[];
  imageOnLoad?: () => void;
  timestamp?: Date;
  attachments: ChatAttachmentType[];
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
      const tokensList = marked.lexer(child.text);
      return tokensList.map((token, j) => {
        return <MarkdownToken key={j} token={token} />;
      });
    }
  });

  return <div>{children}</div>;
};

export default ChatMessage;
