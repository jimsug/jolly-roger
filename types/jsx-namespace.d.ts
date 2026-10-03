import type React from "react";

// @types/react 19 dropped the global JSX namespace, but emoji-picker-react's
// typings still refer to JSX.Element. Drop once emoji-picker-react's typings
// use React.JSX.
declare global {
  namespace JSX {
    type Element = React.JSX.Element;
  }
}
