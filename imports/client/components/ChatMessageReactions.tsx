import React, { Suspense, useCallback, useMemo, useState } from "react";
import Overlay from "react-bootstrap/Overlay";
import styled from "styled-components";
import { reactionEmoji } from "../../lib/isReaction";
import type { ChatMessageType } from "../../lib/models/ChatMessages";
import removeChatReaction from "../../methods/removeChatReaction";
import sendChatMessage from "../../methods/sendChatMessage";
import Loading from "./Loading";

const ReactionPicker = React.lazy(() => import("./ReactionPicker"));

type ReactionMessage = Pick<
  ChatMessageType,
  "_id" | "sender" | "content" | "parentId"
>;

const PICKER_WIDTH = 300;
const PICKER_HEIGHT = 350;

const ReactionContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
`;

const ReactionPill = styled.button<{ $mine: boolean }>`
  background-color: ${({ $mine, theme }) =>
    $mine
      ? theme.colors.ownReactionBackground
      : theme.colors.fancyEditorBackground};
  color: ${({ theme }) => theme.colors.text};
  padding: 2px 8px;
  margin: 2px 4px 2px 0;
  border-radius: 16px;
  cursor: pointer;
  border: 1px solid
    ${({ $mine, theme }) =>
      $mine ? theme.colors.ownReactionBorder : "transparent"};
`;

const PickerContainer = styled.div`
  z-index: 1000;
`;

// Holds the picker's place, at its size, while it loads
const PickerFallback = styled.div`
  width: ${PICKER_WIDTH}px;
  height: ${PICKER_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
`;

const ReactionPillButton = ({
  emoji,
  mine,
  title,
  count,
  disabled,
  onToggle,
}: {
  emoji: string;
  mine: boolean;
  // Who reacted, one name per line
  title: string;
  count: number;
  disabled: boolean;
  onToggle: (emoji: string) => void;
}) => {
  const toggle = useCallback(() => onToggle(emoji), [onToggle, emoji]);
  return (
    <ReactionPill
      type="button"
      $mine={mine}
      title={title}
      disabled={disabled}
      onClick={toggle}
    >
      {emoji}
      {count > 1 ? ` ${count}` : ""}
    </ReactionPill>
  );
};

// A message's reactions, as a pill per emoji that adds or takes back the
// viewer's own, and the picker for reacting with something new.
const ChatMessageReactions = ({
  messageId,
  puzzleId,
  reactions,
  displayNames,
  selfUserId,
  pickerTarget,
  showPicker,
  onHidePicker,
  onError,
  disabled = false,
}: {
  messageId: string;
  puzzleId: string;
  reactions: ReactionMessage[];
  displayNames: Map<string, string>;
  selfUserId: string;
  // The button that opens the picker, which the picker sits above
  pickerTarget: React.RefObject<HTMLElement | null>;
  showPicker: boolean;
  onHidePicker: () => void;
  onError: (error: unknown) => void;
  // Shows the reactions without letting the viewer add or take one back.
  disabled?: boolean;
}) => {
  // emoji -> reacting user -> that user's reactions (one, apart from
  // duplicates written before the server kept them out)
  const reactionsByEmoji = useMemo(() => {
    const byEmoji = new Map<string, Map<string, string[]>>();
    reactions.forEach((reaction) => {
      if (!reaction.sender) {
        return;
      }
      const emoji = reactionEmoji(reaction);
      let users = byEmoji.get(emoji);
      if (!users) {
        users = new Map();
        byEmoji.set(emoji, users);
      }
      let theirs = users.get(reaction.sender);
      if (!theirs) {
        theirs = [];
        users.set(reaction.sender, theirs);
      }
      theirs.push(reaction._id);
    });
    return byEmoji;
  }, [reactions]);

  // The pills wait while a reaction is on its way to the server
  const [callsInFlight, setCallsInFlight] = useState(0);
  const toggleReaction = useCallback(
    (emoji: string) => {
      const mine = reactionsByEmoji.get(emoji)?.get(selfUserId);
      setCallsInFlight((count) => count + 1);
      void (async () => {
        try {
          if (mine) {
            await Promise.all(
              mine.map((id) =>
                removeChatReaction.callPromise({ messageId: id }),
              ),
            );
          } else {
            await sendChatMessage.callPromise({
              puzzleId,
              content: JSON.stringify({
                type: "message",
                children: [{ text: emoji }],
              }),
              parentId: messageId,
            });
          }
        } catch (error) {
          onError(error);
        } finally {
          setCallsInFlight((count) => count - 1);
        }
      })();
    },
    [reactionsByEmoji, selfUserId, puzzleId, messageId, onError],
  );

  const pickReaction = useCallback(
    (emoji: string) => {
      toggleReaction(emoji);
      onHidePicker();
    },
    [toggleReaction, onHidePicker],
  );

  return (
    <>
      <Overlay
        target={pickerTarget}
        show={showPicker}
        placement="top-start"
        rootClose
        onHide={onHidePicker}
      >
        {({
          placement: _placement,
          arrowProps: _arrowProps,
          show: _show,
          popper: _popper,
          hasDoneInitialMeasure: _hasDoneInitialMeasure,
          ...overlayProps
        }) => (
          <PickerContainer {...overlayProps}>
            <Suspense
              fallback={
                <PickerFallback>
                  <Loading inline />
                </PickerFallback>
              }
            >
              <ReactionPicker
                width={PICKER_WIDTH}
                height={PICKER_HEIGHT}
                onPick={pickReaction}
              />
            </Suspense>
          </PickerContainer>
        )}
      </Overlay>
      {reactionsByEmoji.size > 0 && (
        <ReactionContainer>
          {[...reactionsByEmoji].map(([emoji, users]) => (
            <ReactionPillButton
              key={emoji}
              emoji={emoji}
              mine={users.has(selfUserId)}
              title={[...users.keys()]
                .map((userId) => displayNames.get(userId) ?? "???")
                .toSorted()
                .join("\n")}
              count={users.size}
              disabled={disabled || callsInFlight > 0}
              onToggle={toggleReaction}
            />
          ))}
        </ReactionContainer>
      )}
    </>
  );
};

export default ChatMessageReactions;
