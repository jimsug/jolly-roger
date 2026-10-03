import { useCallback, useEffect, useRef, useState } from "react";

const LINGER_MS = 400;

// Hover that lingers briefly after the pointer leaves, so something revealed
// on hover (like a node's attribution) can be reached before it vanishes.
export default function useHoverIntent() {
  const [hovered, setHovered] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onMouseEnter = useCallback(() => {
    window.clearTimeout(timer.current);
    setHovered(true);
  }, []);
  const onMouseLeave = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHovered(false), LINGER_MS);
  }, []);

  return { hovered, onMouseEnter, onMouseLeave };
}
