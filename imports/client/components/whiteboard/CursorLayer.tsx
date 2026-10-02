import { useTracker } from "meteor/react-meteor-data";
import { ViewportPortal } from "@xyflow/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styled, { useTheme } from "styled-components";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import type { WhiteboardPresenceType } from "../../../lib/models/WhiteboardPresence";
import type { InkPoint } from "../../../lib/whiteboard/ink";
import { inkPath } from "../../../lib/whiteboard/ink";
import { userColours } from "../Avatar";
import { STROKE_COLOURS } from "./colours";
import { useZoom } from "./useDetail";

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

// Other people's pointers and their half-drawn ink. Everything is placed in
// flow coordinates, so it lines up whatever each person's zoom or screen size.
const CursorLayer = ({ presence }: { presence: WhiteboardPresenceType[] }) => {
  const zoom = useZoom();
  const theme = useTheme();
  const [now, setNow] = useState(Date.now());
  const lastMoved = useRef(new Map<string, { key: string; at: number }>());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const movedAt = useMemo(() => {
    const result = new Map<string, number>();
    presence.forEach((doc) => {
      const key = JSON.stringify(doc.cursor);
      const seen = lastMoved.current.get(doc._id);
      if (!seen || seen.key !== key) {
        lastMoved.current.set(doc._id, { key, at: Date.now() });
      }
      result.set(doc._id, lastMoved.current.get(doc._id)!.at);
    });
    return result;
  }, [presence]);

  const names = useTracker(
    () =>
      new Map(
        presence.map((doc) => [
          doc.user,
          MeteorUsers.findOne(doc.user)?.displayName ?? "Someone",
        ]),
      ),
    [presence],
  );

  return (
    <ViewportPortal>
      {presence.map((doc) => {
        const [background, text] = userColours(doc.user);
        const stroke = doc.stroke ? (
          <StrokeSvg key={`${doc._id}-stroke`}>
            <path
              d={inkPath(
                doc.stroke.points as InkPoint[],
                doc.stroke.strokeWidth,
                false,
              )}
              fill={STROKE_COLOURS[doc.stroke.colour] ?? theme.colors.text}
            />
          </StrokeSvg>
        ) : null;
        if (!doc.cursor) return stroke;
        const idle = now - (movedAt.get(doc._id) ?? now) > IDLE_AFTER;
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
                  stroke="#fff"
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
