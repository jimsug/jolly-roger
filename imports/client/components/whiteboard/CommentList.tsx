import { useTracker } from "meteor/react-meteor-data";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import chatMessagePlainText, {
  firstLine,
} from "../../../lib/chatMessagePlainText";
import type { ChatMessageType } from "../../../lib/models/ChatMessages";
import type {
  CommentThread,
  ThreadListRow,
} from "../../../lib/whiteboard/comments";
import indexedDisplayNames from "../../indexedDisplayNames";
import describeCommentTarget from "./describeCommentTarget";

type BoardThreadRow = ThreadListRow<CommentThread<ChatMessageType>>;

const Rows = styled.ul`
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
`;

const RowButton = styled.button<{ $unread: boolean }>`
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  column-gap: 6px;
  width: 100%;
  padding: 4px 2px;
  border: none;
  border-radius: 4px;
  background: none;
  color: inherit;
  text-align: left;
  font-weight: ${({ $unread }) => ($unread ? 600 : "normal")};

  &:hover {
    background: ${({ theme }) => theme.colors.hoverChatMessageBackground};
  }
`;

const UnreadDot = styled.span`
  grid-row: 1 / span 3;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary};
`;

const Line = styled.span`
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Detail = styled(Line)`
  font-weight: normal;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

const None = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CommentListRow = ({
  row,
  target,
  firstLine,
  onShow,
}: {
  row: BoardThreadRow;
  target: string;
  firstLine: string;
  onShow: (threadId: string) => void;
}) => {
  const { t } = useTranslation();
  const id = row.thread.root._id;
  const show = useCallback(() => onShow(id), [onShow, id]);
  const replies = t("whiteboard.comments.replies", "{{count}} replies", {
    count: row.thread.replyCount,
  });
  return (
    <li>
      <RowButton
        type="button"
        $unread={row.unread}
        data-thread={id}
        onClick={show}
      >
        {row.unread ? (
          <UnreadDot>
            <span className="visually-hidden">
              {t("whiteboard.commentList.unread", "Unread")}
            </span>
          </UnreadDot>
        ) : null}
        <Line title={target}>{target}</Line>
        <Line title={firstLine}>{firstLine}</Line>
        <Detail>
          {row.thread.resolved
            ? t(
                "whiteboard.commentList.repliesResolved",
                "{{replies}} (resolved)",
                {
                  replies,
                  // React escapes text, so i18next's escaping would only show
                  // entities. Goes once both i18n inits stop escaping.
                  interpolation: { escapeValue: false },
                },
              )
            : replies}
        </Detail>
      </RowButton>
    </li>
  );
};

// The board's threads, unread first and then the latest activity, for the
// Comments side panel. Picking one shows it on the board.
const CommentList = ({
  rows,
  onShow,
}: {
  rows: BoardThreadRow[];
  onShow: (threadId: string) => void;
}) => {
  const { t } = useTranslation();
  const described = useTracker(() => {
    const displayNames = indexedDisplayNames();
    return new Map(
      rows.map(({ thread }) => [
        thread.root._id,
        {
          target: describeCommentTarget(thread.root.comment?.node, t),
          firstLine: firstLine(
            chatMessagePlainText(thread.root.content, displayNames),
          ),
        },
      ]),
    );
  }, [rows, t]);

  if (rows.length === 0) {
    return (
      <None>{t("whiteboard.commentList.none", "No comments to show.")}</None>
    );
  }
  return (
    <Rows>
      {rows.map((row) => {
        const id = row.thread.root._id;
        const text = described.get(id);
        return (
          <CommentListRow
            key={id}
            row={row}
            target={text?.target ?? ""}
            firstLine={text?.firstLine ?? ""}
            onShow={onShow}
          />
        );
      })}
    </Rows>
  );
};

export default React.memo(CommentList);
