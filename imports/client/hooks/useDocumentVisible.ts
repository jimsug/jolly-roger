import { useRef } from "react";
import { useDebounceValue, useEventListener } from "usehooks-ts";

const isVisible = () => document.visibilityState === "visible";

// How long the tab has to stay shown or hidden before the change counts, so
// flicking to another tab and straight back doesn't rewrite presence twice
const SETTLE_MS = 1000;

// Whether the tab is visible, as state, so presence subscriptions can take it
// as an argument and re-subscribe when it changes. A change lands once it has
// held for a second.
export default function useDocumentVisible(): boolean {
  const documentRef = useRef(document);
  const [visible, setVisible] = useDebounceValue(isVisible, SETTLE_MS);
  useEventListener(
    "visibilitychange",
    () => {
      setVisible(isVisible());
    },
    documentRef,
  );
  return visible;
}
