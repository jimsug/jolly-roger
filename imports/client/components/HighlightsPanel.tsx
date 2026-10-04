import React, {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import Offcanvas from "react-bootstrap/Offcanvas";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import { shortCalendarTimeFormat } from "../../lib/calendarTimeFormat";
import isReaction from "../../lib/isReaction";
import { indexedById } from "../../lib/listUtils";
import type { ChatMessageType } from "../../lib/models/ChatMessages";
import nodeIsMention from "../../lib/nodeIsMention";
import ChatMessage from "./ChatMessage";
import { PuzzlePagePadding } from "./styling/constants";

type HighlightMessage = Pick<
  ChatMessageType,
  "_id" | "sender" | "content" | "timestamp" | "pinTs" | "parentId"
>;

const HighlightsRow = styled.div`
  flex: none;
  padding: 0 ${PuzzlePagePadding} ${PuzzlePagePadding};
`;

// A message in the panel, laid out as it is in the history
const HighlightRow = styled.div<{
  $isSystemMessage: boolean;
  $isPinned: boolean;
}>`
  position: relative;
  padding: 0 ${PuzzlePagePadding} 2px;
  overflow-wrap: break-word;
  font-size: 0.8rem;
  ${({ $isSystemMessage }) =>
    $isSystemMessage &&
    css`
      background-color: ${({ theme }) =>
        theme.colors.systemChatMessageBackground};
    `}

  ${({ $isPinned }) =>
    $isPinned &&
    css`
      background-color: ${({ theme }) => theme.colors.pinnedMessageBackground};
    `}

  &:hover {
    background-color: ${({ theme }) => theme.colors.hoverChatMessageBackground};
  }

  /* Links in the message sit above the button stretched over the row */
  a {
    position: relative;
    z-index: 1;
  }
`;

const HighlightTimestamp = styled.span`
  float: right;
  font-style: italic;
  font-size: 12px;
  color: #666;
`;

// Stretched over the whole row, so picking anywhere on it goes to the message
const GoToMessageButton = styled.button`
  border: none;
  background: none;
  padding: 0;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
  }

  &:focus-visible {
    outline: none;
  }

  &:focus-visible::after {
    outline: auto;
  }
`;

const HighlightListItem = ({
  message,
  displayNames,
  selfUserId,
  roles,
  onPick,
}: {
  message: HighlightMessage;
  displayNames: Map<string, string>;
  selfUserId: string;
  roles: string[];
  onPick: (messageId: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const messageId = message._id;
  const pick = useCallback(() => onPick(messageId), [onPick, messageId]);
  return (
    <HighlightRow
      $isSystemMessage={!message.sender}
      $isPinned={!!message.pinTs}
    >
      <GoToMessageButton type="button" onClick={pick}>
        <span className="visually-hidden">
          {t("chat.highlights.goToMessage", "Go to message")}
        </span>
      </GoToMessageButton>
      <HighlightTimestamp>
        {shortCalendarTimeFormat(message.timestamp, t, i18n.language)}
      </HighlightTimestamp>
      <strong>
        {message.sender
          ? (displayNames.get(message.sender) ?? "???")
          : "jolly-roger"}
      </strong>
      <ChatMessage
        message={message.content}
        displayNames={displayNames}
        selfUserId={selfUserId}
        roles={roles}
      />
    </HighlightRow>
  );
};

// A button under the chat input that opens a panel of the messages worth a
// second look: replies to the user, mentions of them, pins and system
// messages. Picking one scrolls the history to it.
const HighlightsPanel = React.memo(
  ({
    chatMessages,
    displayNames,
    selfUserId,
    roles,
    scrollToMessage,
    onHeightChange,
  }: {
    chatMessages: HighlightMessage[];
    displayNames: Map<string, string>;
    selfUserId: string;
    roles: string[];
    scrollToMessage: (messageId: string) => void;
    onHeightChange: () => void;
  }) => {
    const { t } = useTranslation();
    const [show, setShow] = useState(false);
    const open = useCallback(() => setShow(true), []);
    const close = useCallback(() => setShow(false), []);
    const [activeKey, setActiveKey] = useState<string>();
    const onSelectTab = useCallback(
      (key: string | null) => setActiveKey(key ?? undefined),
      [],
    );

    const tabs = useMemo(() => {
      const messages = chatMessages.filter((m) => !isReaction(m));
      const messagesById = indexedById(messages);
      const all = [
        {
          key: "replies",
          title: t("chat.highlights.replies", "Replies"),
          // Someone else's replies to the user, not the user's own follow-ups
          messages: messages.filter(
            (m) =>
              m.sender !== selfUserId &&
              m.parentId &&
              messagesById.get(m.parentId)?.sender === selfUserId,
          ),
        },
        {
          key: "mentions",
          title: t("chat.highlights.mentions", "Mentions"),
          messages: messages.filter((m) =>
            m.content.children.some(
              (node) => nodeIsMention(node) && node.userId === selfUserId,
            ),
          ),
        },
        {
          key: "pins",
          title: t("chat.highlights.pins", "Pins"),
          messages: messages.filter((m) => m.pinTs),
        },
        {
          key: "system",
          title: t("chat.highlights.system", "System"),
          messages: messages.filter((m) => !m.sender),
        },
      ];
      return all.filter((tab) => tab.messages.length > 0);
    }, [chatMessages, selfUserId, t]);
    const total = tabs.reduce((sum, tab) => sum + tab.messages.length, 0);

    // The row takes its height from the history, so it says when it comes and
    // goes, as ChatPeople does
    const hasHighlights = total > 0;
    useLayoutEffect(() => {
      onHeightChange();
    }, [onHeightChange, hasHighlights]);

    const pick = useCallback(
      (messageId: string) => {
        setShow(false);
        scrollToMessage(messageId);
      },
      [scrollToMessage],
    );

    const idPrefix = useId();

    const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];
    if (!activeTab) {
      return null;
    }

    return (
      <HighlightsRow>
        <Button size="sm" variant="secondary" onClick={open}>
          {t("chat.highlights.button", "Highlights ({{shown}})", {
            shown: total > 99 ? "99+" : total,
          })}
        </Button>
        <Offcanvas show={show} onHide={close}>
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>
              {t("chat.highlights.title", "Highlights")}
            </Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            <Tabs
              id={`${idPrefix}-highlights`}
              activeKey={activeTab.key}
              onSelect={onSelectTab}
              justify
              className="mb-3"
            >
              {tabs.map(({ key, title, messages }) => (
                <Tab
                  key={key}
                  eventKey={key}
                  title={t(
                    "chat.highlights.tabTitle",
                    "{{title}} ({{count}})",
                    {
                      title,
                      count: messages.length,
                    },
                  )}
                >
                  {messages.map((message) => (
                    <HighlightListItem
                      key={message._id}
                      message={message}
                      displayNames={displayNames}
                      selfUserId={selfUserId}
                      roles={roles}
                      onPick={pick}
                    />
                  ))}
                </Tab>
              ))}
            </Tabs>
          </Offcanvas.Body>
        </Offcanvas>
      </HighlightsRow>
    );
  },
);

export default HighlightsPanel;
