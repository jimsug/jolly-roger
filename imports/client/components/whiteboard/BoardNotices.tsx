import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { Notice, SaveError } from "../../hooks/useBoardNotices";
import { NO_ESCAPE } from "./canvasChrome";

const AccessNotice = styled(Alert)`
  max-width: 320px;
  margin: 6px 0 0;
  padding: 6px 36px 6px 10px;
  font-size: 13px;

  .btn-close {
    padding: 10px;
  }
`;

const NoticeAction = styled(Button)`
  padding: 0 0 0 6px;
  font-size: inherit;
  vertical-align: baseline;
`;

// The alerts under the toolbar (see useBoardNotices): being offline, which
// gets a banner of its own rather than a reason; edit rights that came or
// went; a save the server refused; and a passing notice.
const BoardNotices = ({
  offline,
  accessNotice,
  onDismissAccessNotice,
  saveError,
  onDismissSaveError,
  notice,
  onDismissNotice,
  onFollowNotice,
}: {
  offline: boolean;
  accessNotice: "lost" | "gained" | undefined;
  onDismissAccessNotice: () => void;
  saveError: SaveError | undefined;
  onDismissSaveError: () => void;
  notice: Notice | undefined;
  onDismissNotice: () => void;
  onFollowNotice: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <>
      {offline && (
        <AccessNotice variant="warning">
          {t(
            "whiteboard.offline",
            "Offline: the board is view-only until you reconnect",
          )}
        </AccessNotice>
      )}
      {accessNotice && (
        <AccessNotice
          variant="info"
          dismissible
          closeLabel={t("common.close", "Close")}
          onClose={onDismissAccessNotice}
        >
          {accessNotice === "lost"
            ? t("whiteboard.access.lost", "You can no longer edit this board.")
            : t("whiteboard.access.gained", "You can now edit this board.")}
        </AccessNotice>
      )}
      {saveError && (
        <AccessNotice
          key={saveError.id}
          variant="danger"
          dismissible
          closeLabel={t("common.close", "Close")}
          onClose={onDismissSaveError}
        >
          {t("whiteboard.save.refused", "Couldn't save: {{reason}}", {
            reason: saveError.reason,
            ...NO_ESCAPE,
          })}
        </AccessNotice>
      )}
      {notice && (
        <AccessNotice
          variant={notice.variant}
          dismissible
          closeLabel={t("common.close", "Close")}
          onClose={onDismissNotice}
        >
          {notice.text}
          {notice.action && (
            <NoticeAction size="sm" variant="link" onClick={onFollowNotice}>
              {notice.action.label}
            </NoticeAction>
          )}
        </AccessNotice>
      )}
    </>
  );
};

export default BoardNotices;
