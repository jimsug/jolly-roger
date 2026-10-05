import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faPen } from "@fortawesome/free-solid-svg-icons/faPen";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useStore, ViewportPortal } from "@xyflow/react";
import React, { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { Rect } from "../../../lib/whiteboard/layout";
import { othersSelecting } from "../../../lib/whiteboard/remoteActivity";
import { useWhiteboardZoom } from "../../hooks/useWhiteboardDetail";
import useWhiteboardNames from "../../hooks/useWhiteboardNames";
import WhiteboardPresence from "../../WhiteboardPresence";
import { userColors } from "../Avatar";
import RemoteEditingContext from "./RemoteEditingContext";

// Screen pixels: each person's outline, and the gap between the node and the
// first.
const OUTLINE = 2;
const GAP = 2;

const Outline = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  border-radius: 4px;
  z-index: 999;
`;

const TagAnchor = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  pointer-events: none;
  z-index: 999;
`;

const TagRow = styled.div<{ $centred: boolean }>`
  position: absolute;
  left: 0;
  bottom: 2px;
  transform: ${({ $centred }) => ($centred ? "translateX(-50%)" : "none")};
  display: flex;
  gap: 2px;
  white-space: nowrap;
`;

const Chip = styled.span<{ $background: string; $text: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
  background: ${({ $background }) => $background};
  color: ${({ $text }) => $text};
`;

export interface RemotePerson {
  user: string;
  name: string;
  editing: boolean;
}

// Who else has a node selected or is typing in it (or a line's label), one
// chip each in the colour their cursor has. Set above its anchor, starting
// there or centred on it.
export const RemoteTag = ({
  people,
  centred = false,
}: {
  people: RemotePerson[];
  centred?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <TagRow className="jr-remote-tag" $centred={centred}>
      {people.map(({ user, name, editing }) => {
        const [background, text] = userColors(user);
        return (
          <Chip key={user} $background={background} $text={text}>
            {editing && <FontAwesomeIcon icon={faPen} />}
            {editing
              ? t("whiteboard.live.editing", "{{name}} is editing", {
                  name,
                  // React escapes text, so i18next's escaping would only
                  // show entities. Goes once both i18n inits stop escaping.
                  interpolation: { escapeValue: false },
                })
              : name}
          </Chip>
        );
      })}
    </TagRow>
  );
};

const sameBoxes = (a: (Rect | undefined)[], b: (Rect | undefined)[]) =>
  a.length === b.length &&
  a.every((box, i) => {
    const other = b[i];
    return box && other
      ? box.x === other.x &&
          box.y === other.y &&
          box.width === other.width &&
          box.height === other.height
      : box === other;
  });

// Outlines round the nodes other people have selected or are typing in, in
// their colours, with their names above each node's top left corner. Drawn
// in flow coordinates, with the outlines and names kept the same size on
// screen at any zoom. A node folded into a collapsed frame isn't on the
// board, so gets nothing. Presence is read for the selections alone, so
// cursor moves don't re-render this.
const RemoteSelectionLayer = ({
  boardId,
  liveEnabled,
}: {
  boardId: string;
  liveEnabled: boolean;
}) => {
  const self = useTracker(() => Meteor.userId() ?? undefined, []);
  const selections = useTracker(
    () =>
      liveEnabled
        ? WhiteboardPresence.find(
            { board: boardId },
            { projection: { user: 1, selection: 1 } },
          ).fetch()
        : [],
    [boardId, liveEnabled],
  );
  const selecting = useMemo(
    () => othersSelecting(selections, self),
    [selections, self],
  );
  const editing = useContext(RemoteEditingContext);
  const names = useWhiteboardNames([...selecting.values()].flat());

  // Each node's people: whoever is typing in it first, then whoever has it
  // selected.
  const people = new Map<string, RemotePerson[]>();
  editing.forEach(({ user, name }, id) => {
    people.set(id, [{ user, name, editing: true }]);
  });
  selecting.forEach((users, id) => {
    const here = people.get(id) ?? [];
    users.forEach((user) => {
      if (here.some((p) => p.user === user)) return;
      here.push({ user, name: names.get(user) ?? "", editing: false });
    });
    people.set(id, here);
  });
  const ids = [...people.keys()];

  const zoom = useWhiteboardZoom();
  // Where each of those nodes is, compared by value so the layer only
  // re-renders when one of them moves. Lines aren't nodes, so get nothing
  // here (WhiteboardEdge shows who's typing in a label).
  const boxes = useStore(
    (s) =>
      ids.map((id): Rect | undefined => {
        const n = s.nodeLookup.get(id);
        if (!n || n.hidden) return undefined;
        return {
          ...n.internals.positionAbsolute,
          width: n.measured.width ?? n.width ?? 0,
          height: n.measured.height ?? n.height ?? 0,
        };
      }),
    sameBoxes,
  );

  return (
    <ViewportPortal>
      {ids.map((id, i) => {
        const box = boxes[i];
        const here = people.get(id)!;
        if (!box) return null;
        const gap = GAP / zoom;
        const rings = here
          .map(
            ({ user }, ring) =>
              `0 0 0 ${((ring + 1) * OUTLINE) / zoom}px ${userColors(user)[0]}`,
          )
          .join(", ");
        const outside = gap + (here.length * OUTLINE) / zoom;
        return (
          <React.Fragment key={id}>
            <Outline
              className="jr-remote-selection"
              data-node={id}
              style={{
                transform: `translate(${box.x - gap}px, ${box.y - gap}px)`,
                width: box.width + 2 * gap,
                height: box.height + 2 * gap,
                boxShadow: rings,
              }}
            />
            <TagAnchor
              data-node={id}
              style={{
                transform: `translate(${box.x - outside}px, ${box.y - outside}px) scale(${1 / zoom})`,
              }}
            >
              <RemoteTag people={here} />
            </TagAnchor>
          </React.Fragment>
        );
      })}
    </ViewportPortal>
  );
};

export default React.memo(RemoteSelectionLayer);
