import type React from "react";

// @types/react 19 dropped the global JSX namespace, but emoji-picker-react's
// typings still refer to JSX.Element.
declare global {
  namespace JSX {
    type Element = React.JSX.Element;
  }
}
