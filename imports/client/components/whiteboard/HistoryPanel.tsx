import { EJSON } from "meteor/ejson";
import { useTracker } from "meteor/react-meteor-data";
import type { TFunction } from "i18next";
import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Flags from "../../../Flags";
import {
  getTodayFormatter,
  shortCalendarTimeFormat,
} from "../../../lib/calendarTimeFormat";
import MeteorUsers from "../../../lib/models/MeteorUsers";
import type { WhiteboardEdgeType } from "../../../lib/models/WhiteboardEdges";
import type { WhiteboardNodeType } from "../../../lib/models/WhiteboardNodes";
import Whiteboards from "../../../lib/models/Whiteboards";
import type { WhiteboardVersionType } from "../../../lib/models/WhiteboardVersions";
import WhiteboardVersions from "../../../lib/models/WhiteboardVersions";
import whiteboardVersions from "../../../lib/publications/whiteboardVersions";
import fetchWhiteboardVersion from "../../../methods/fetchWhiteboardVersion";
import useTypedSubscribe from "../../hooks/useTypedSubscribe";
import { gunzipChunks } from "./boardFiles";

export interface VersionPreview {
  version: WhiteboardVersionType;
  nodes: WhiteboardNodeType[];
  edges: WhiteboardEdgeType[];
}

// Fetches a version's chunks one call at a time, so no one message carries a
// whole board, and unpacks them.
export async function loadVersion(
  boardId: string,
  version: WhiteboardVersionType,
): Promise<VersionPreview> {
  const parts: Uint8Array[] = [];
  for (let index = 0; index < version.chunkCount; index++) {
    parts.push(
      await fetchWhiteboardVersion.callPromise({
        boardId,
        versionId: version._id,
        index,
      }),
    );
  }
  const payload = EJSON.parse(await gunzipChunks(parts)) as {
    nodes: WhiteboardNodeType[];
    edges: WhiteboardEdgeType[];
  };
  return { version, nodes: payload.nodes, edges: payload.edges };
}

// When a version was taken, as a row under its day shows it.
const versionTime = (date: Date, language: string) =>
  getTodayFormatter(language).format(date);

// When a version was taken, with its day unless that's today, for places
// with no day heading over them.
export const versionMoment = (date: Date, t: TFunction, language: string) =>
  shortCalendarTimeFormat(date, t, language);

const Day = styled.div`
  margin-top: 8px;
  font-weight: 600;
`;

const Row = styled.button`
  display: block;
  width: 100%;
  margin: 2px 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.hoverChatMessageBackground};
  }

  &[aria-pressed="true"] {
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.6;
  }
`;

const Note = styled.div`
  margin-top: 8px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

function describeVersion(
  version: WhiteboardVersionType,
  names: string,
  firstName: string,
  t: TFunction,
  language: string,
) {
  const time = versionTime(version.createdAt, language);
  // React escapes text, so i18next's escaping would only show entities. Goes
  // once both i18n inits stop escaping.
  const interpolation = { escapeValue: false };
  switch (version.kind) {
    case "edits": {
      const until = versionTime(version.lastEditAt, language);
      return t(
        "whiteboard.history.edits",
        "Before edits by {{names}}, {{time}} ({{changes}})",
        {
          names,
          time:
            until === time
              ? time
              : t("whiteboard.history.timeRange", "{{from}} to {{to}}", {
                  from: time,
                  to: until,
                  interpolation,
                }),
          changes: t("whiteboard.history.changes", "{{count}} changes", {
            count: version.changeCount,
          }),
          interpolation,
        },
      );
    }
    case "reset":
      return t(
        "whiteboard.history.reset",
        "Before {{name}} reset the layout · {{time}}",
        { name: firstName, time, interpolation },
      );
    case "restore":
      return t(
        "whiteboard.history.restore",
        "Before {{name}} restored the {{restored}} version · {{time}}",
        {
          name: firstName,
          restored: versionMoment(
            version.restoredFromAt ?? version.createdAt,
            t,
            language,
          ),
          time,
          interpolation,
        },
      );
    default:
      return version.kind satisfies never;
  }
}

// The board's earlier versions by day, newest first, each named for the
// edits that followed it. Picking one previews it; Now goes back to the
// board as it is.
const HistoryPanel = ({
  boardId,
  previewId,
  loadingId,
  onPreview,
  onBackToNow,
}: {
  boardId: string;
  previewId: string | undefined;
  loadingId: string | undefined;
  onPreview: (version: WhiteboardVersionType) => void;
  onBackToNow: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const enabled = useTracker(
    () => !Flags.active("disable.whiteboard_versions"),
    [],
  );
  useTypedSubscribe(enabled ? whiteboardVersions : undefined, { boardId });
  const versions = useTracker(
    () =>
      enabled
        ? WhiteboardVersions.find(
            { board: boardId },
            { sort: { createdAt: -1 } },
          ).fetch()
        : [],
    [boardId, enabled],
  );
  const prunedBefore = useTracker(
    () =>
      Whiteboards.findOne(boardId, { projection: { versionsPrunedBefore: 1 } })
        ?.versionsPrunedBefore,
    [boardId],
  );
  const userIds = useMemo(
    () => [...new Set(versions.flatMap((v) => v.users.map((u) => u.user)))],
    [versions],
  );
  const displayNames = useTracker(
    () =>
      new Map(
        userIds.map((id) => [
          id,
          MeteorUsers.findOne(id)?.displayName ??
            t("whiteboard.avatar.unknownUser", "Unknown"),
        ]),
      ),
    [userIds, t],
  );
  const language = i18n.language;
  const days = useMemo(() => {
    const dayFormat = new Intl.DateTimeFormat(language, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const list = new Intl.ListFormat(language, { type: "conjunction" });
    const grouped: { day: string; rows: { id: string; text: string }[] }[] = [];
    versions.forEach((version) => {
      const day = dayFormat.format(version.createdAt);
      // A merge can leave one person on a version twice
      const names = [
        ...new Set(version.users.map((u) => displayNames.get(u.user) ?? "")),
      ];
      const text = describeVersion(
        version,
        list.format(names),
        names[0] ?? "",
        t,
        language,
      );
      const last = grouped.at(-1);
      if (last?.day === day) {
        last.rows.push({ id: version._id, text });
      } else {
        grouped.push({ day, rows: [{ id: version._id, text }] });
      }
    });
    return grouped;
  }, [versions, displayNames, t, language]);

  const byId = useMemo(
    () => new Map(versions.map((v) => [v._id, v])),
    [versions],
  );
  const pick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const version = byId.get(event.currentTarget.value);
      if (version) onPreview(version);
    },
    [byId, onPreview],
  );

  if (!enabled) {
    return (
      <Note>
        {t("whiteboard.history.off", "The board's history is turned off.")}
      </Note>
    );
  }

  return (
    <>
      <Row type="button" aria-pressed={!previewId} onClick={onBackToNow}>
        {t("whiteboard.history.now", "Now")}
      </Row>
      {days.map(({ day, rows }) => (
        <React.Fragment key={day}>
          <Day>{day}</Day>
          {rows.map((row) => (
            <Row
              key={row.id}
              type="button"
              value={row.id}
              aria-pressed={previewId === row.id}
              aria-busy={loadingId === row.id}
              disabled={loadingId === row.id}
              onClick={pick}
            >
              {row.text}
            </Row>
          ))}
        </React.Fragment>
      ))}
      {prunedBefore && (
        <Note>
          {t(
            "whiteboard.history.pruned",
            "Older history was cleared to save space",
          )}
        </Note>
      )}
    </>
  );
};

export default React.memo(HistoryPanel);
