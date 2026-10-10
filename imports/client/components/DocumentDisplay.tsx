import type { Meteor } from "meteor/meteor";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faDiagramProject } from "@fortawesome/free-solid-svg-icons/faDiagramProject";
import { faFileAlt } from "@fortawesome/free-solid-svg-icons/faFileAlt";
import { faTable } from "@fortawesome/free-solid-svg-icons/faTable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import styled from "styled-components";
import type {
  BoardDocumentType,
  DocumentType,
  GoogleDocumentType,
} from "../../lib/models/Documents";
import boardToken from "../../methods/boardToken";

// Google Sheets steals focus during initialization. The number of times
// depends on the browser engine: Chromium does it twice, Firefox once, and
// Safari not at all (it blocks cross-origin iframe focus stealing).
const EXPECTED_FOCUS_STEALS = (() => {
  const ua = navigator.userAgent;
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return 0;
  if ("userAgentData" in navigator) return 2; // Chromium-based
  return 1; // Firefox and others
})();

interface DocumentDisplayProps {
  document: DocumentType;
  displayMode: "link" | "embed";
  user: Meteor.User;
}

// The URL a document opens at, or undefined for a type we can't link to.
export const googleDocumentUrl = (
  document: GoogleDocumentType,
  user: Meteor.User,
) => {
  // If the user has linked their Google account, try to force usage of that specific account.
  // Otherwise, they may open the document anonymously. If the user isn't signed in, they will be
  // redirected to the default account in their browser session anyway.
  const authUserParam = user.googleAccount
    ? `authuser=${user.googleAccount}&`
    : "";
  switch (document.value.type) {
    case "spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${document.value.id}/edit?${authUserParam}ui=2&rm=embedded&gid=0#gid=0`;
    case "document":
      return `https://docs.google.com/document/d/${document.value.id}/edit?${authUserParam}ui=2&rm=embedded#gid=0`;
    default:
      return undefined;
  }
};

const StyledDeepLink = styled.a`
  display: inline-block;
  font-weight: bold;
  white-space: nowrap;
`;

const StyledBoardLink = styled(Link)`
  display: inline-block;
  font-weight: bold;
  white-space: nowrap;
`;

const StyledIframe = styled.iframe`
  /* Workaround for unusual sizing behavior of iframes in iOS Safari:
   * Width and height need to be specified in absolute values then adjusted by min and max */
  width: 0;
  height: 0;
  min-width: 100%;
  max-width: 100%;
  min-height: 100%;
  max-height: 100%;
  position: absolute;
  inset: 0;
  border: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
  background-color: #f1f3f4;
`;

const FocusGuard = styled.button`
  all: unset;
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 15%);
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 500;
  user-select: none;
`;

const FocusGuardLabel = styled.span`
  background: rgb(255 255 255 / 85%);
  padding: 0.4em 0.8em;
  border-radius: 0.3em;
  color: #333;
`;

export const DocumentMessage = styled.span`
  display: block;
  width: 100%;
  height: 100%;
  background-color: ${({ theme }) => theme.colors.documentMessageBackground};
`;

const GoogleDocumentDisplay = ({
  document,
  displayMode,
  user,
}: DocumentDisplayProps & { document: GoogleDocumentType }) => {
  const isSpreadsheet = document.value.type === "spreadsheet";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastFocusedRef = useRef<Element | null>(null);
  // Only the embed has an iframe to guard; without one the poll below would
  // never see a steal and so never stop.
  const [focusGuarded, setFocusGuarded] = useState(
    displayMode === "embed" && isSpreadsheet && EXPECTED_FOCUS_STEALS > 0,
  );
  const lastStolenAtRef = useRef<number | undefined>(undefined);

  // While the focus guard overlay is up, poll activeElement and restore focus
  // when Sheets steals it. The overlay prevents user clicks from reaching the
  // iframe, so any focus steal we detect is programmatic. We auto-dismiss
  // after countering EXPECTED_FOCUS_STEALS, or after a quiet period following
  // an iframe load (as a fallback). The user can also click the overlay to
  // dismiss early.
  useEffect(() => {
    if (!focusGuarded) return undefined;

    const QUIET_PERIOD_MS = 3_000;

    let rafId: number;
    let stealCount = 0;

    const poll = () => {
      if (
        stealCount >= EXPECTED_FOCUS_STEALS ||
        (lastStolenAtRef.current !== undefined &&
          Date.now() - lastStolenAtRef.current > QUIET_PERIOD_MS)
      ) {
        setFocusGuarded(false);
        return;
      }

      const active = window.document.activeElement;
      if (active === iframeRef.current) {
        stealCount += 1;
        lastStolenAtRef.current = Date.now();
        if (lastFocusedRef.current instanceof HTMLElement) {
          lastFocusedRef.current.focus();
        } else {
          iframeRef.current?.blur();
        }
      } else if (active && active !== window.document.body) {
        lastFocusedRef.current = active;
      }

      rafId = requestAnimationFrame(poll);
    };

    // If a steal happened while the tab was hidden, RAF wasn't running to
    // detect it. When the tab becomes visible again, check if the iframe has
    // focus and dismiss the guard if so.
    const onVisibilityChange = () => {
      if (
        window.document.visibilityState === "visible" &&
        window.document.activeElement === iframeRef.current
      ) {
        setFocusGuarded(false);
      }
    };

    window.document.addEventListener("visibilitychange", onVisibilityChange);
    rafId = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(rafId);
      window.document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
    };
  }, [focusGuarded]);

  const dismissFocusGuard = useCallback(() => {
    setFocusGuarded(false);
  }, []);

  const onFocusGuardKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFocusGuarded(false);
    }
  }, []);

  const onIframeLoad = useCallback(() => {
    lastStolenAtRef.current ??= Date.now();
  }, []);

  const url = googleDocumentUrl(document, user);
  let title: string;
  let icon: IconDefinition;
  switch (document.value.type) {
    case "spreadsheet":
      title = "Sheet";
      icon = faTable;
      break;
    case "document":
      title = "Doc";
      icon = faFileAlt;
      break;
    default:
      return (
        <DocumentMessage>
          Don&apos;t know how to link to a document of type{" "}
          {document.value.type}
        </DocumentMessage>
      );
  }

  switch (displayMode) {
    case "link":
      return (
        <StyledDeepLink href={url} target="_blank" rel="noreferrer noopener">
          <FontAwesomeIcon icon={icon} /> <span>{title}</span>
        </StyledDeepLink>
      );
    case "embed":
      /* To workaround iOS Safari iframe behavior, scrolling should be "no" */
      return (
        <>
          <StyledIframe
            ref={iframeRef}
            title="document"
            src={url}
            onLoad={onIframeLoad}
          />
          {focusGuarded && (
            <FocusGuard
              type="button"
              tabIndex={0}
              onClick={dismissFocusGuard}
              onKeyDown={onFocusGuardKeyDown}
            >
              <FocusGuardLabel>
                Click to interact with spreadsheet
              </FocusGuardLabel>
            </FocusGuard>
          )}
        </>
      );
    default:
      return (
        <DocumentMessage>Unknown displayMode {displayMode}</DocumentMessage>
      );
  }
};

// What a link into the board page may ask it to show, passed on to the
// board as-is
const BOARD_PASSTHROUGH_PARAMS = ["comment", "puzzle", "node", "v"];

// The board's page with the viewer's token and whatever the page's own URL
// asks the board to show
export const boardDocumentUrl = (
  document: BoardDocumentType,
  token: string,
  params: URLSearchParams,
) => {
  const url = new URL(document.value.url);
  url.searchParams.set("token", token);
  for (const name of BOARD_PASSTHROUGH_PARAMS) {
    const value = params.get(name);
    if (value !== null) url.searchParams.set(name, value);
  }
  return url.toString();
};

const BoardDocumentDisplay = ({
  document,
  displayMode,
}: Pick<DocumentDisplayProps, "displayMode"> & {
  document: BoardDocumentType;
}) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { hunt, puzzle } = document;
  const mintToken = useCallback(
    () =>
      boardToken.callPromise({
        huntId: hunt,
        ...(puzzle ? { puzzleId: puzzle } : {}),
      }),
    [hunt, puzzle],
  );

  // The token the iframe is opened with. Renewals go to the iframe by
  // message instead, so its src (and so the board) never reloads.
  const [initialToken, setInitialToken] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (displayMode !== "embed") return undefined;
    let cancelled = false;
    void mintToken().then(
      (token) => {
        if (!cancelled) setInitialToken(token);
      },
      (err: Meteor.Error) => {
        if (!cancelled) setError(err.reason ?? err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [displayMode, mintToken]);

  // The board asks for a fresh token before its one runs out. Only the
  // board's own origin is answered, and the answer goes back to whoever
  // asked, at that origin.
  const boardOrigin = useMemo(
    () => new URL(document.value.url).origin,
    [document.value.url],
  );
  useEffect(() => {
    if (displayMode !== "embed") return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== boardOrigin) return;
      const data = event.data as { t?: unknown } | null;
      if (data?.t !== "token" || !event.source) return;
      // A cross-origin frame's window only lets us post to it
      const source = event.source as WindowProxy;
      void mintToken().then(
        (token) => {
          source.postMessage({ t: "token", token }, event.origin);
        },
        () => {
          // The board shows its own "reload" notice once the token runs out
        },
      );
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [displayMode, boardOrigin, mintToken]);

  const url = useMemo(
    () =>
      initialToken
        ? boardDocumentUrl(document, initialToken, searchParams)
        : undefined,
    [document, initialToken, searchParams],
  );

  const title = t("board.title", "Board");
  switch (displayMode) {
    case "link":
      return (
        <StyledBoardLink to={`/hunts/${hunt}/board`}>
          <FontAwesomeIcon icon={faDiagramProject} /> <span>{title}</span>
        </StyledBoardLink>
      );
    case "embed":
      if (error) {
        return (
          <DocumentMessage>
            {t("board.openFailed", "Couldn't open the board")}: {error}
          </DocumentMessage>
        );
      }
      if (!url) {
        return (
          <DocumentMessage>
            {t("board.opening", "Opening the board")}...
          </DocumentMessage>
        );
      }
      return <StyledIframe title={title} src={url} />;
    default:
      return (
        <DocumentMessage>Unknown displayMode {displayMode}</DocumentMessage>
      );
  }
};

const DocumentDisplay = ({
  document,
  displayMode,
  user,
}: DocumentDisplayProps) => {
  switch (document.provider) {
    case "google":
      return (
        <GoogleDocumentDisplay
          document={document}
          displayMode={displayMode}
          user={user}
        />
      );
    case "board":
      return (
        <BoardDocumentDisplay document={document} displayMode={displayMode} />
      );
    default: {
      // Every provider is handled above; this is for a row the client's
      // model doesn't know yet
      const unknown: never = document;
      return (
        <DocumentMessage>
          Unable to display document from provider{" "}
          {(unknown as { provider: string }).provider}
        </DocumentMessage>
      );
    }
  }
};

export default DocumentDisplay;
