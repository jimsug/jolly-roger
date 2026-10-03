import { useTracker } from "meteor/react-meteor-data";
import { faReply } from "@fortawesome/free-solid-svg-icons/faReply";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import Overlay from "react-bootstrap/Overlay";
import Popover from "react-bootstrap/Popover";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { ChatMessageType } from "../../lib/models/ChatMessages";
import ChatMessages from "../../lib/models/ChatMessages";
import ChatMessage from "./ChatMessage";

// How many ancestors the popover shows before offering "More"
const MAX_REPLY_ANCESTORS = 3;

type ThreadMessage = Pick<ChatMessageType, "_id" | "sender" | "content">;

const ReplyIconButton = styled.button`
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.replyButtonText};

  &:hover {
    color: ${({ theme }) => theme.colors.hoverReplyButtonText};
  }
`;

const ReplyPopover = styled(Popover)`
  max-width: min(400px, 90vw);
`;

const ReplyPopoverContent = styled.div`
  max-height: 200px;
  overflow-y: auto;
`;

const ReplyPopoverMessage = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

// The icon on a reply: clicking it scrolls to the message replied to, and
// hovering or focusing it shows the chain of messages above in a popover.
const ReplyThreadPopover = ({
  parentId,
  displayNames,
  selfUserId,
  roles,
  scrollToMessage,
}: {
  parentId: string;
  displayNames: Map<string, string>;
  selfUserId: string;
  roles: string[];
  scrollToMessage: (messageId: string) => void;
}) => {
  const { t } = useTranslation();
  const idPrefix = useId();

  // The chain of messages this one replies to, nearest last, plus the id
  // of the next one up when the chain goes on past what the popover shows
  const thread = useTracker(() => {
    const ancestors: ThreadMessage[] = [];
    let next: string | undefined = parentId;
    while (next && ancestors.length < MAX_REPLY_ANCESTORS) {
      const ancestor: ChatMessageType | undefined = ChatMessages.findOne(next);
      if (!ancestor) {
        // The chain goes on into messages we can't see, so there is
        // nothing to scroll to
        next = undefined;
        break;
      }
      ancestors.push(ancestor);
      next = ancestor.parentId;
    }
    ancestors.reverse();
    return { ancestors, more: next };
  }, [parentId]);

  const [showThread, setShowThread] = useState(false);
  const threadHideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const replyIconRef = useRef<HTMLButtonElement>(null);
  const openThread = useCallback(() => {
    clearTimeout(threadHideTimeout.current);
    setShowThread(true);
  }, []);
  // Leave the popover up long enough to move the mouse into it
  const closeThreadSoon = useCallback(() => {
    clearTimeout(threadHideTimeout.current);
    threadHideTimeout.current = setTimeout(() => setShowThread(false), 300);
  }, []);
  useEffect(() => () => clearTimeout(threadHideTimeout.current), []);

  const scrollToParent = useCallback(() => {
    scrollToMessage(parentId);
  }, [scrollToMessage, parentId]);
  const { more } = thread;
  const scrollToMore = useCallback(() => {
    if (more) {
      scrollToMessage(more);
    }
  }, [scrollToMessage, more]);

  return (
    <>
      <ReplyIconButton
        type="button"
        ref={replyIconRef}
        title={t("chat.showReplyTarget", "Show the message this replies to")}
        onClick={scrollToParent}
        onMouseEnter={openThread}
        onMouseLeave={closeThreadSoon}
        onFocus={openThread}
        onBlur={closeThreadSoon}
      >
        <FontAwesomeIcon icon={faReply} />
      </ReplyIconButton>
      <Overlay target={replyIconRef} show={showThread} placement="top">
        <ReplyPopover
          id={`${idPrefix}-thread`}
          onMouseEnter={openThread}
          onMouseLeave={closeThreadSoon}
        >
          <Popover.Header as="h3">
            {t("chat.replyingToHeader", "Replying to:")}
          </Popover.Header>
          <Popover.Body>
            <ReplyPopoverContent>
              {more && (
                <Button variant="link" size="sm" onClick={scrollToMore}>
                  {t("chat.moreReplies", "More…")}
                </Button>
              )}
              {thread.ancestors.map((ancestor) => (
                <ReplyPopoverMessage key={ancestor._id}>
                  <strong>
                    {ancestor.sender
                      ? (displayNames.get(ancestor.sender) ?? "???")
                      : "jolly-roger"}
                  </strong>
                  <ChatMessage
                    message={ancestor.content}
                    displayNames={displayNames}
                    selfUserId={selfUserId}
                    roles={roles}
                  />
                </ReplyPopoverMessage>
              ))}
            </ReplyPopoverContent>
          </Popover.Body>
        </ReplyPopover>
      </Overlay>
    </>
  );
};

export default ReplyThreadPopover;
