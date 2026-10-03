import { useTracker } from "meteor/react-meteor-data";
import { ViewportPortal } from "@xyflow/react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import { inkPath } from "../../../lib/whiteboard/ink";
import useDocumentVisible from "../../hooks/useDocumentVisible";
import { useWhiteboardZoom } from "../../hooks/useWhiteboardDetail";
import WhiteboardPresence from "../../WhiteboardPresence";
import { userColors } from "../Avatar";
import colors from "./colors";

const IDLE_AFTER = 10_000;

const Cursor = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  pointer-events: none;
  transition:
    transform 120ms linear,
    opacity 600ms ease;
  z-index: 1000;
`;

const NamePill = styled.div<{ $background: string; $text: string }>`
  position: absolute;
  left: 14px;
  top: 16px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
  background: ${({ $background }) => $background};
  color: ${({ $text }) => $text};
`;

const StrokeSvg = styled.svg`
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
  opacity: 0.6;
`;

// Where a tab's pointer was, and when it got there.
interface PointerSeen {
  key: string;
  at: number;
}

// Other people's pointers and their half-drawn ink. Everything is placed in
// flow coordinates, so it lines up whatever each person's zoom or screen size.
// Pointers move constantly, so only this layer follows them.
const CursorLayer = ({
  boardId,
  liveEnabled,
}: {
  boardId: string;
  liveEnabled: boolean;
}) => {
  const presence = useTracker(
    () =>
      liveEnabled ? WhiteboardPresence.find({ board: boardId }).fetch() : [],
    [boardId, liveEnabled],
  );
  const zoom = useWhiteboardZoom();
  const theme = useTheme();
  const { t } = useTranslation();
  const visible = useDocumentVisible();
  const [now, setNow] = useState(Date.now());
  // When each tab's pointer last moved, so idle ones can fade out. Tabs that
  // have gone are forgotten.
  const [lastMoved, setLastMoved] = useState(
    () => new Map<string, PointerSeen>(),
  );
  useEffect(() => {
    setLastMoved((previous) => {
      const next = new Map<string, PointerSeen>();
      presence.forEach((doc) => {
        const key = JSON.stringify(doc.cursor);
        const seen = previous.get(doc._id);
        next.set(doc._id, seen?.key === key ? seen : { key, at: Date.now() });
      });
      return next;
    });
  }, [presence]);

  // Ticks while anyone's pointer is on the board and this tab can be seen, so
  // idle ones fade out.
  const anyCursors = presence.some((doc) => doc.cursor);
  useEffect(() => {
    if (!anyCursors || !visible) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [anyCursors, visible]);

  // Names only change as people come and go, not as their pointers move.
  const userIds = [...new Set(presence.map((doc) => doc.user))]
    .toSorted()
    .join(",");
  const names = useTracker(
    () =>
      new Map(
        (userIds ? userIds.split(",") : []).map((user) => [
          user,
          MeteorUsers.findOne(user)?.displayName ??
            t("whiteboard.cursor.someone", "Someone"),
        ]),
      ),
    [userIds, t],
  );

  return (
    <ViewportPortal>
      {presence.map((doc) => {
        const [background, text] = userColors(doc.user);
        const stroke = doc.stroke ? (
          <StrokeSvg key={`${doc._id}-stroke`}>
            <path
              d={inkPath(doc.stroke.points, doc.stroke.strokeWidth, false)}
              fill={colors.stroke[doc.stroke.color] ?? theme.colors.text}
            />
          </StrokeSvg>
        ) : null;
        if (!doc.cursor) return stroke;
        const idle = now - (lastMoved.get(doc._id)?.at ?? now) > IDLE_AFTER;
        return (
          <React.Fragment key={doc._id}>
            {stroke}
            <Cursor
              style={{
                transform: `translate(${doc.cursor.x}px, ${doc.cursor.y}px) scale(${1 / zoom})`,
                opacity: idle ? 0 : 1,
              }}
            >
              <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden>
                <path
                  d="M1 1 L1 17 L5.5 13 L9 21 L12 19.5 L8.5 12 L15 12 Z"
                  fill={background}
                  stroke={theme.colors.whiteboardCursorOutline}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <NamePill $background={background} $text={text}>
                {names.get(doc.user)}
              </NamePill>
            </Cursor>
          </React.Fragment>
        );
      })}
    </ViewportPortal>
  );
};

export default React.memo(CursorLayer);
