import { createContext } from "react";

// The hovered or selected cards whose feeder arrows stand out (see
// feederFocus). Empty when none do.
const FeederFocusContext = createContext<ReadonlySet<string>>(new Set());

export default FeederFocusContext;
