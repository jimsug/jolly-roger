import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";

export interface ActivityItem {
  dayOfWeek: number; // 0 (Sun) - 6 (Sat), UTC
  hour: number; // 0 - 23, UTC
  count: number;
  type: string;
}

const CELL = 15;
const GAP = 2;

const StyledContainer = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.secondary};
  padding: 16px;
  width: calc(24 * (${CELL}px + ${GAP}px) + 82px);
  max-width: 90%;
  overflow-x: auto;

  /* Positioned, so the cells' visually hidden (absolutely positioned) labels
     scroll with the graph rather than widening the page */
  position: relative;
  background-color: ${({ theme }) => theme.colors.background};
`;

const GraphLayout = styled.div`
  display: flex;
  align-items: flex-start;
`;

const DayLabelsSide = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(7 * (${CELL}px + ${GAP}px) - ${GAP}px);
  margin-right: 8px;
  padding-top: 2px;
  padding-bottom: 2px;
`;

const DayLabel = styled.div`
  height: ${CELL}px;
  line-height: ${CELL}px;
  flex-grow: 1;
  text-align: right;
  min-width: 30px;
  margin-bottom: ${GAP}px;
  font-family: monospace;

  &:last-child {
    margin-bottom: 0;
  }
`;

const GridAndHoursContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const HourLabels = styled.div`
  display: flex;
  margin-bottom: 4px;
  padding-right: 2px;
  width: calc(24 * (${CELL}px + ${GAP}px) - ${GAP}px);
`;

const HourLabel = styled.div<{ $isVisible: boolean }>`
  max-width: ${CELL}px;
  text-align: left;
  padding-right: 1px;
  font-family: monospace;
  visibility: ${({ $isVisible }) => ($isVisible ? "visible" : "hidden")};
  min-width: ${({ $isVisible }) =>
    $isVisible ? `calc(${CELL}px + 2 * (${CELL}px + ${GAP}px))` : "0"};
`;

const GraphGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(24, ${CELL}px);
  grid-template-rows: repeat(7, ${CELL}px);
  grid-auto-flow: row;
  gap: ${GAP}px;
`;

const GraphCell = styled.div<{ $color: string }>`
  width: ${CELL}px;
  height: ${CELL}px;
  border-radius: 2px;
  background-color: ${({ $color }) => $color};
  box-sizing: border-box;
  cursor: default;

  &:hover {
    outline: 1px solid ${({ theme }) => theme.colors.secondary};
    outline-offset: -1px;
  }
`;

const LegendAndCountRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  width: 100%;
`;

const GraphLegend = styled.div`
  display: flex;
  align-items: center;
  font-size: 11px;
`;

const TotalCount = styled.div`
  font-size: 11px;
  text-align: right;
`;

const TimezoneOffsetMessage = styled.div`
  text-align: right;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text};
  margin-top: 4px;
  width: 100%;
`;

const LegendColor = styled.div<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 2px;
  margin: 0 1px;
  background-color: ${({ $color }) => $color};
  border: 1px solid ${({ theme }) => theme.colors.text};
`;

type Slot = { total: number; byType: Map<string, number> };

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Localised day names, indexed by day of week. 2023-01-01 was a Sunday.
function dayNames(language: string, weekday: "short" | "long") {
  const formatter = new Intl.DateTimeFormat(language, {
    weekday,
    timeZone: "UTC",
  });
  return DAY_INDICES.map((day) =>
    formatter.format(new Date(Date.UTC(2023, 0, 1 + day))),
  );
}

// "UTC+9:30"
function formatUtcOffset(hours: number) {
  const sign = hours < 0 ? "-" : "+";
  const whole = Math.floor(Math.abs(hours));
  const minutes = Math.round((Math.abs(hours) - whole) * 60);
  const suffix = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";
  return `UTC${sign}${whole}${suffix}`;
}

// A day-of-week by hour heatmap of activity, in the style of a contribution
// graph. Activity comes in UTC buckets and is shifted into the viewer's
// timezone by timezoneOffset hours. The buckets are whole hours, so a
// half-hour timezone is shifted by the nearest whole hour (and says so).
const ContributionGraph = ({
  data,
  showCount = false,
  title,
  timezoneOffset = 0,
}: {
  data: ActivityItem[];
  showCount?: boolean;
  title?: string;
  timezoneOffset?: number;
}) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const palette = theme.colors.contributionsGraph;
  const hourShift = Math.round(timezoneOffset);

  const { slots, maxTotal, total } = useMemo(() => {
    const slotsAcc = new Map<string, Slot>();
    let maxTotalAcc = 0;
    let totalAcc = 0;
    for (const item of data) {
      // Shift into the viewer's day, wrapping across the week
      const shifted = item.hour + hourShift;
      const hour = ((shifted % 24) + 24) % 24;
      const dayOfWeek =
        (((item.dayOfWeek + Math.floor(shifted / 24)) % 7) + 7) % 7;
      const key = `${dayOfWeek}-${hour}`;
      let slot = slotsAcc.get(key);
      if (!slot) {
        slot = { total: 0, byType: new Map() };
        slotsAcc.set(key, slot);
      }
      slot.total += item.count;
      slot.byType.set(
        item.type,
        (slot.byType.get(item.type) ?? 0) + item.count,
      );
      totalAcc += item.count;
      maxTotalAcc = Math.max(maxTotalAcc, slot.total);
    }
    return { slots: slotsAcc, maxTotal: maxTotalAcc, total: totalAcc };
  }, [data, hourShift]);

  const colorFor = (count: number) => {
    if (count === 0 || maxTotal === 0) {
      return palette[0];
    }
    const ratio = count / maxTotal;
    if (ratio <= 0.25) return palette[1];
    if (ratio <= 0.5) return palette[2];
    if (ratio <= 0.75) return palette[3];
    return palette[4];
  };

  const shortDays = dayNames(i18n.language, "short");
  const longDays = dayNames(i18n.language, "long");

  const tooltipFor = (dayIndex: number, hour: number, slot?: Slot) => {
    const when = {
      day: longDays[dayIndex],
      from: `${hour}:00`,
      to: `${hour}:59`,
    };
    if (!slot || slot.total === 0) {
      return t(
        "history.graph.noActivity",
        "{{day}} {{from}} - {{to}}: no activity",
        when,
      );
    }
    const breakdown = [...slot.byType]
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${type}: ${count}`)
      .join(", ");
    return t(
      "history.graph.activitySummary",
      "{{day}} {{from}} - {{to}}: {{count}} activities ({{breakdown}})",
      { ...when, count: slot.total, breakdown },
    );
  };

  return (
    <StyledContainer>
      {title && <strong>{title}</strong>}
      <GraphLayout>
        <DayLabelsSide>
          {shortDays.map((day) => (
            <DayLabel key={day}>{day}</DayLabel>
          ))}
        </DayLabelsSide>

        <GridAndHoursContainer>
          <GraphGrid>
            {DAY_INDICES.map((dayIndex) =>
              HOURS.map((hour) => {
                const slot = slots.get(`${dayIndex}-${hour}`);
                const label = tooltipFor(dayIndex, hour, slot);
                return (
                  <GraphCell
                    key={`${dayIndex}-${hour}`}
                    $color={colorFor(slot?.total ?? 0)}
                    title={label}
                  >
                    <span className="visually-hidden">{label}</span>
                  </GraphCell>
                );
              }),
            )}
          </GraphGrid>
          <HourLabels>
            {HOURS.map((hour) => {
              const isVisible = hour % 3 === 0;
              return (
                <HourLabel key={hour} $isVisible={isVisible}>
                  {isVisible ? hour.toString().padStart(2, "0") : ""}
                </HourLabel>
              );
            })}
          </HourLabels>
          <LegendAndCountRow>
            <GraphLegend>
              <span>{t("history.graph.less", "Less")}</span>
              {palette.map((color) => (
                <LegendColor key={color} $color={color} />
              ))}
              <span>{t("history.graph.more", "More")}</span>
            </GraphLegend>
            {showCount && (
              <TotalCount>
                {t("history.graph.total", "Total activities: {{count}}", {
                  count: total,
                })}
              </TotalCount>
            )}
          </LegendAndCountRow>
          {timezoneOffset !== 0 && (
            <TimezoneOffsetMessage>
              <Trans
                i18nKey="history.graph.timezoneNote"
                t={t}
                defaults="Your activity has been shifted into your browser's <strong>current</strong> timezone ({{zone}})."
                values={{ zone: formatUtcOffset(timezoneOffset) }}
                components={{ strong: <strong /> }}
              />
              {hourShift !== timezoneOffset && (
                <>
                  {" "}
                  {t(
                    "history.graph.timezoneRounded",
                    "The buckets are hourly, so the shift is rounded to the nearest hour.",
                  )}
                </>
              )}
            </TimezoneOffsetMessage>
          )}
        </GridAndHoursContainer>
      </GraphLayout>
    </StyledContainer>
  );
};

export default ContributionGraph;
