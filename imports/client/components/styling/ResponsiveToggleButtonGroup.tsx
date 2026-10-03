import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import styled from "styled-components";

// Takes the full width on very narrow screens
export default styled(ToggleButtonGroup)`
  @media (width < 360px) {
    width: 100%;
  }
`;
