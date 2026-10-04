import { useEffect, useState } from "react";

export interface KeyboardInset {
  // How far the on-screen keyboard (or anything else the browser draws over
  // the bottom of the page) reaches up from the bottom of the window.
  inset: number;
  // The height of the part of the page that's showing, or undefined where
  // the browser doesn't say.
  height: number | undefined;
}

const measure = (): KeyboardInset => {
  const viewport = window.visualViewport;
  if (!viewport) return { inset: 0, height: undefined };
  return {
    inset: Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop,
    ),
    height: viewport.height,
  };
};

// Follows the visual viewport, which shrinks when a phone's keyboard opens
// while the window (and anything placed at its bottom) stays where it was, so
// something at the bottom of the screen can sit above the keyboard.
export default function useKeyboardInset(): KeyboardInset {
  const [current, setCurrent] = useState(measure);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => {
      const next = measure();
      setCurrent((previous) =>
        previous.inset === next.inset && previous.height === next.height
          ? previous
          : next,
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return current;
}
