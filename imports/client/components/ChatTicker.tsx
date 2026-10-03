import { faComments } from "@fortawesome/free-solid-svg-icons/faComments";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback } from "react";
import Button from "react-bootstrap/Button";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import useDocumentVisible from "../hooks/useDocumentVisible";

// While the chat pane is minimised, new messages roll past as toasts in the
// bottom-left corner.

// Toasts stay between these bounds, scaled by the message length
const TICKER_MIN_MS = 3000;
const TICKER_MAX_MS = 8000;
const TICKER_MS_PER_CHAR = 50;
// How many toasts show at once; the rest are counted in a pill
const MAX_VISIBLE_TICKERS = 3;

export type TickerToastType = {
  // The puzzle whose chat the message is in
  puzzleId: string;
  id: string;
  text: string;
  sender: string;
  duration: number;
};

// Other tabs on the same puzzle hear about dismissals, so a toast cleared in
// one tab clears everywhere
export type TickerSyncMessage =
  | { type: "dismiss"; id: string; auto: boolean }
  | { type: "clear" };

// Anything on the same origin can post to the channel, so check the shape
export const isTickerSyncMessage = (
  data: unknown,
): data is TickerSyncMessage => {
  if (typeof data !== "object" || data === null || !("type" in data)) {
    return false;
  }
  switch (data.type) {
    case "dismiss":
      return (
        "id" in data &&
        typeof data.id === "string" &&
        "auto" in data &&
        typeof data.auto === "boolean"
      );
    case "clear":
      return true;
    default:
      return false;
  }
};

export const tickerDuration = (text: string) =>
  Math.min(
    TICKER_MAX_MS,
    Math.max(TICKER_MIN_MS, text.length * TICKER_MS_PER_CHAR),
  );

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const countDown = keyframes`
  from {
    width: 100%;
  }

  to {
    width: 0;
  }
`;

const TickerContainer = styled.div`
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1050;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  width: 350px;
  max-width: calc(100vw - 40px);
`;

const TickerQueuePill = styled.div`
  background-color: ${({ theme }) => theme.colors.secondary};
  color: ${({ theme }) => theme.colors.chatBadgeText};
  font-size: 0.75rem;
  font-weight: bold;
  padding: 2px 10px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgb(0 0 0 / 20%);
  animation: ${slideIn} 0.3s ease;
`;

const TickerToast = styled.div`
  width: 100%;
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid ${({ theme }) => theme.colors.secondary};
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  font-size: 0.9rem;
  animation: ${slideIn} 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
`;

const TickerToastBody = styled.div`
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  position: relative;
  z-index: 1;
`;

// Clicking the message dismisses the toast
const TickerToastContent = styled.button`
  flex: 1;
  overflow: hidden;
  overflow-wrap: break-word;
  text-align: left;
  border: none;
  background: none;
  padding: 0;
  color: inherit;
  font: inherit;
`;

// Runs down over the toast's time, which only passes while it isn't paused
const TickerProgress = styled.div<{ $duration: number; $paused: boolean }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background-color: ${({ theme }) => theme.colors.secondary};
  opacity: 0.15;
  z-index: 0;
  animation: ${countDown} ${({ $duration }) => $duration}ms linear forwards;
  animation-play-state: ${({ $paused }) => ($paused ? "paused" : "running")};
`;

const ManagedTickerToast = ({
  msg,
  isPaused,
  dismiss,
  onRestore,
}: {
  msg: TickerToastType;
  isPaused: boolean;
  dismiss: (id: string, auto: boolean) => void;
  onRestore: (id: string) => void;
}) => {
  const { t } = useTranslation();
  // Hidden tabs don't count the time down either
  const visible = useDocumentVisible();

  const onExpired = useCallback(() => dismiss(msg.id, true), [dismiss, msg.id]);
  const onDismiss = useCallback(
    () => dismiss(msg.id, false),
    [dismiss, msg.id],
  );
  const restore = useCallback(() => onRestore(msg.id), [onRestore, msg.id]);

  return (
    <TickerToast>
      <TickerProgress
        $duration={msg.duration}
        $paused={isPaused || !visible}
        onAnimationEnd={onExpired}
      />
      <TickerToastBody>
        <TickerToastContent
          type="button"
          title={t("chat.ticker.dismiss", "Dismiss")}
          onClick={onDismiss}
        >
          <strong>{msg.sender}:</strong> {msg.text}
        </TickerToastContent>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={restore}
          title={t("chat.ticker.openChat", "Open chat")}
        >
          <FontAwesomeIcon icon={faComments} />
        </Button>
      </TickerToastBody>
    </TickerToast>
  );
};

// The stack of toasts, oldest first. Only the oldest counts down, and not
// while the stack is hovered.
const ChatTicker = ({
  toasts,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  dismiss,
  onRestore,
}: {
  toasts: TickerToastType[];
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  dismiss: (id: string, auto: boolean) => void;
  onRestore: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TICKERS);
  const overflowCount = toasts.length - visibleToasts.length;
  return createPortal(
    <TickerContainer onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {overflowCount > 0 && (
        <TickerQueuePill>
          {t("chat.ticker.moreMessages", { count: overflowCount })}
        </TickerQueuePill>
      )}
      {visibleToasts.map((msg, index) => (
        <ManagedTickerToast
          key={msg.id}
          msg={msg}
          isPaused={isHovered || index !== 0}
          dismiss={dismiss}
          onRestore={onRestore}
        />
      ))}
    </TickerContainer>,
    document.body,
  );
};

export default ChatTicker;
