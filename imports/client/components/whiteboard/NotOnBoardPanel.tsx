import { Panel } from "@xyflow/react";
import { useCallback } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { MissingCard } from "../../../lib/whiteboard/notOnBoard";
import type { HiddenArrow, HiddenFrame } from "../../hooks/useNotOnBoard";
import { SidePanel } from "./canvasChrome";

const HiddenRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;

  span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const HiddenSection = styled.div`
  margin-top: 8px;
  font-weight: 600;
`;

const HiddenNone = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Something in the "Not on the board" panel, with a way to put it back.
const PutBackRow = <Item extends { title: string }>({
  item,
  onPutBack,
}: {
  item: Item;
  onPutBack: (item: Item) => void;
}) => {
  const { t } = useTranslation();
  const onClick = useCallback(() => onPutBack(item), [onPutBack, item]);
  return (
    <HiddenRow>
      <span title={item.title}>{item.title}</span>
      <Button size="sm" variant="link" onClick={onClick}>
        {t("whiteboard.hidden.putBack", "Put back")}
      </Button>
    </HiddenRow>
  );
};

// The "Not on the board" panel (see useNotOnBoard), at the top right.
const NotOnBoardPanel = ({
  title,
  hiddenCards,
  hiddenFrames,
  hiddenArrows,
  showFeederArrows,
  onPutBack,
  onPutBackFrame,
  onPutBackArrow,
  onPutBackAllArrows,
}: {
  title: string;
  hiddenCards: MissingCard[];
  hiddenFrames: HiddenFrame[];
  hiddenArrows: HiddenArrow[];
  // Whether this viewer shows feeder arrows at all.
  showFeederArrows: boolean;
  onPutBack: (card: MissingCard) => void;
  onPutBackFrame: (frame: HiddenFrame) => void;
  onPutBackArrow: (arrow: HiddenArrow) => void;
  onPutBackAllArrows: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Panel position="top-right">
      <SidePanel>
        <strong>{title}</strong>
        <HiddenSection>
          {t("whiteboard.hidden.puzzles", "Puzzles")}
        </HiddenSection>
        {hiddenCards.length === 0 && (
          <HiddenNone>
            {t("whiteboard.hidden.none", "Every puzzle is on the board.")}
          </HiddenNone>
        )}
        {hiddenCards.map((card) => (
          <PutBackRow key={card.puzzle} item={card} onPutBack={onPutBack} />
        ))}
        <HiddenSection>{t("whiteboard.hidden.frames", "Frames")}</HiddenSection>
        {hiddenFrames.length === 0 && (
          <HiddenNone>
            {t(
              "whiteboard.hidden.noFrames",
              "Every round's frame is on the board.",
            )}
          </HiddenNone>
        )}
        {hiddenFrames.map((frame) => (
          <PutBackRow key={frame.id} item={frame} onPutBack={onPutBackFrame} />
        ))}
        <HiddenSection>
          {t("whiteboard.hidden.arrows", "Feeder arrows")}
        </HiddenSection>
        {!showFeederArrows && hiddenArrows.length > 0 && (
          <HiddenNone>
            {t(
              "whiteboard.hidden.arrowsOff",
              "Feeder arrows are hidden for you; turn them on in the toolbar to see these.",
            )}
          </HiddenNone>
        )}
        {hiddenArrows.length === 0 ? (
          <HiddenNone>
            {t(
              "whiteboard.hidden.noArrows",
              "Every feeder arrow is on the board.",
            )}
          </HiddenNone>
        ) : (
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={onPutBackAllArrows}
          >
            {t(
              "whiteboard.hidden.putBackAllArrows",
              "Put back all feeder arrows",
            )}
          </Button>
        )}
        {hiddenArrows.map((arrow) => (
          <PutBackRow key={arrow.id} item={arrow} onPutBack={onPutBackArrow} />
        ))}
      </SidePanel>
    </Panel>
  );
};

export default NotOnBoardPanel;
