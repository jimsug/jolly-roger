// biome-ignore-all lint/suspicious/noArrayIndexKey: markdown tokens have no stable id
import { decodeHTML } from "entities";
import type { Token, Tokens } from "marked";
import { marked } from "marked";
import { useMemo } from "react";
import styled from "styled-components";
import safeHref from "../../lib/safeHref";
import type { Theme } from "../theme";

// The small subset of markdown that chat renders, shared with anything else
// that shows user-written text the same way. Mentions and puzzle links aren't
// markdown; they're separate message nodes handled by ChatMessage.

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

const StyledCodeBlock = styled.code<{ theme: Theme }>`
  white-space: pre-wrap;
  display: block;
  border-radius: 4px;
  padding: 4px;
  width: 100%;
  background-color: ${({ theme }) => theme.colors.codeBlockBackground};
  color: ${({ theme }) => theme.colors.codeBlockText};
  margin-bottom: 0;
`;

type LinkOptions = {
  safe: boolean;
  className: string | undefined;
};

// Renders a markdown token to React components.
const MarkdownToken = ({
  token,
  links,
  truncate,
}: {
  token: Token;
  links: LinkOptions;
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
      <MarkdownToken key={i} token={t} links={links} />
    ));
    const decodedText = decodeHTML(token.text);
    if (token.raw.length > decodedText.length) {
      const trail = token.raw.substring(decodedText.length);
      if (trail.trim() === "") {
        const syntheticSpace: Tokens.Space = {
          type: "space",
          raw: trail,
        };
        children.push(
          <MarkdownToken
            key={children.length}
            token={syntheticSpace}
            links={links}
          />,
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
      <MarkdownToken key={i} token={t} links={links} truncate={truncate} />
    ));
    const href = links.safe ? safeHref(linkToken.href) : linkToken.href;
    if (href === undefined) {
      return <>{children}</>;
    }
    return (
      <a
        target="_blank"
        rel="noopener noreferrer"
        href={href}
        className={links.className}
      >
        {children}
      </a>
    );
  } else if (token.type === "blockquote") {
    const children = (token as Tokens.Blockquote).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} links={links} />
    ));
    return <StyledBlockquote>{children}</StyledBlockquote>;
  } else if (token.type === "strong") {
    const children = (token as Tokens.Strong).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} links={links} />
    ));
    if (token.raw.startsWith("__")) {
      return <u>{children}</u>;
    } else {
      return <strong>{children}</strong>;
    }
  } else if (token.type === "em") {
    const children = (token as Tokens.Em).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} links={links} />
    ));
    return <em>{children}</em>;
  } else if (token.type === "del") {
    const children = (token as Tokens.Del).tokens.map((t, i) => (
      <MarkdownToken key={i} token={t} links={links} />
    ));
    return <del>{children}</del>;
  } else if (token.type === "codespan") {
    const decodedText = decodeHTML(token.text);
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

// With safeLinks, a link whose href isn't http(s), mailto or a same-site path
// is shown as its text with no link at all.
export const MarkdownText = ({
  text,
  safeLinks = false,
  linkClassName,
}: {
  text: string;
  safeLinks?: boolean;
  linkClassName?: string;
}) => {
  const tokens = useMemo(() => marked.lexer(text), [text]);
  const links = { safe: safeLinks, className: linkClassName };
  return (
    <>
      {tokens.map((token, i) => (
        <MarkdownToken key={i} token={token} links={links} />
      ))}
    </>
  );
};
