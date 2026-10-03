import { useEffect, useState } from "react";

const isVisible = () => document.visibilityState === "visible";

// Whether the tab is visible, as state, so presence subscriptions can take it
// as an argument and re-subscribe when it changes.
export default function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(isVisible);
  useEffect(() => {
    const onVisibilityChange = () => {
      setVisible(isVisible());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  return visible;
}
