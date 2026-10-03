import { faPencilAlt } from "@fortawesome/free-solid-svg-icons/faPencilAlt";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback } from "react";
import DropdownItem from "react-bootstrap/DropdownItem";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useOperatorActionsHiddenForHunt } from "../hooks/persisted-state";

const ModeIcon = styled(FontAwesomeIcon)`
  font-size: 1.1rem;
`;

const ModeLabel = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.2;
`;

const CurrentMode = styled.span`
  font-size: 0.7rem;
`;

// Flips the same per-hunt setting as the Solver/Deputy toggle on the puzzle
// list, so operators can switch from any page of the hunt.
const OperatorModeMenuItem = ({ huntId }: { huntId: string }) => {
  const { t } = useTranslation();
  const [operatorActionsHidden, setOperatorActionsHidden] =
    useOperatorActionsHiddenForHunt(huntId);

  const toggleOperatorMode = useCallback(() => {
    setOperatorActionsHidden((hidden) => !hidden);
  }, [setOperatorActionsHidden]);

  return (
    <DropdownItem
      onClick={toggleOperatorMode}
      className="d-flex align-items-center"
    >
      <ModeIcon
        icon={operatorActionsHidden ? faStar : faPencilAlt}
        className="me-2"
      />
      <ModeLabel>
        <span>
          {operatorActionsHidden
            ? t("navigation.operatorMode.switchToDeputy", "Switch to Deputy")
            : t("navigation.operatorMode.switchToSolver", "Switch to Solver")}
        </span>
        <CurrentMode className="text-muted">
          {operatorActionsHidden
            ? t(
                "navigation.operatorMode.currentlySolver",
                "Currently in Solver mode",
              )
            : t(
                "navigation.operatorMode.currentlyDeputy",
                "Currently in Deputy mode",
              )}
        </CurrentMode>
      </ModeLabel>
    </DropdownItem>
  );
};

export default OperatorModeMenuItem;
