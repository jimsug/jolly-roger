import type { Meteor } from "meteor/meteor";
import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
import { faLockOpen } from "@fortawesome/free-solid-svg-icons/faLockOpen";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import setWhiteboardLayoutLocked from "../../../methods/setWhiteboardLayoutLocked";

// Lock layout and Unlock layout, beside Reset layout, for operators: every
// frame on the board at once.
const LockLayoutButtons = ({
  boardId,
  onRefused,
}: {
  boardId: string;
  onRefused: (error?: Meteor.Error) => void;
}) => {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const setLocked = useCallback(
    (locked: boolean) => {
      setRunning(true);
      setWhiteboardLayoutLocked.call({ boardId, locked }, (error) => {
        setRunning(false);
        onRefused(error);
      });
    },
    [boardId, onRefused],
  );
  const lock = useCallback(() => setLocked(true), [setLocked]);
  const unlock = useCallback(() => setLocked(false), [setLocked]);
  const lockLabel = t("whiteboard.lock.layout", "Lock layout");
  const unlockLabel = t("whiteboard.lock.unlockLayout", "Unlock layout");
  return (
    <>
      <Button
        variant="outline-secondary"
        onClick={lock}
        disabled={running}
        title={t(
          "whiteboard.lock.layoutTitle",
          "Lock layout: lock every frame, so none can be moved, resized, edited or deleted",
        )}
        aria-label={lockLabel}
      >
        <FontAwesomeIcon icon={faLock} />
      </Button>
      <Button
        variant="outline-secondary"
        onClick={unlock}
        disabled={running}
        title={t(
          "whiteboard.lock.unlockLayoutTitle",
          "Unlock layout: unlock every frame",
        )}
        aria-label={unlockLabel}
      >
        <FontAwesomeIcon icon={faLockOpen} />
      </Button>
    </>
  );
};

export default React.memo(LockLayoutButtons);
