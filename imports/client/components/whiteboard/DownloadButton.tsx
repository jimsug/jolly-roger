import { faDownload } from "@fortawesome/free-solid-svg-icons/faDownload";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback } from "react";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Dropdown from "react-bootstrap/Dropdown";
import Spinner from "react-bootstrap/Spinner";
import { useTranslation } from "react-i18next";

export type DownloadKind = "png" | "json";

// The toolbar's Download menu: the board as a picture or as data. Busy, and
// not to be picked again, while a download is being made.
const DownloadButton = ({
  busy,
  onDownload,
}: {
  busy: boolean;
  onDownload: (kind: DownloadKind) => void;
}) => {
  const { t } = useTranslation();
  const select = useCallback(
    (key: string | null) => {
      if (key === "png" || key === "json") onDownload(key);
    },
    [onDownload],
  );
  const title = busy
    ? t("whiteboard.download.busy", "Preparing the download")
    : t("whiteboard.download.title", "Download");
  return (
    <Dropdown as={ButtonGroup} onSelect={select}>
      <Dropdown.Toggle
        variant="outline-secondary"
        size="sm"
        title={title}
        aria-label={title}
        aria-busy={busy}
        disabled={busy}
      >
        {busy ? (
          <Spinner animation="border" size="sm" />
        ) : (
          <FontAwesomeIcon icon={faDownload} />
        )}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item as="button" eventKey="png">
          {t("whiteboard.download.png", "Picture (PNG)")}
        </Dropdown.Item>
        <Dropdown.Item as="button" eventKey="json">
          {t("whiteboard.download.json", "Data (JSON)")}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default React.memo(DownloadButton);
