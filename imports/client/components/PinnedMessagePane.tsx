import type React from "react";
import { useLayoutEffect } from "react";
import styled from "styled-components";

const PinnedMessageDiv = styled.div`
  flex: none;
  max-height: 12em;
  overflow-y: auto;
  overflow-x: hidden;
  border-bottom: 4px double ${({ theme }) => theme.colors.border};
`;

// The most recently pinned message, kept in view above the history. The pane
// takes its height from the history, so it says whenever its size might have
// changed, as ChatPeople does.
const PinnedMessagePane = ({
  messageId,
  reactionCount,
  onHeightChange,
  children,
}: {
  // Undefined while nothing is pinned
  messageId: string | undefined;
  // Reactions add a row of pills under the message
  reactionCount: number;
  onHeightChange: () => void;
  // The message, rendered as it is in the history
  children: React.ReactNode;
}) => {
  useLayoutEffect(() => {
    onHeightChange();
  }, [onHeightChange, messageId, reactionCount]);

  if (!messageId) {
    return null;
  }
  return <PinnedMessageDiv>{children}</PinnedMessageDiv>;
};

export default PinnedMessagePane;
