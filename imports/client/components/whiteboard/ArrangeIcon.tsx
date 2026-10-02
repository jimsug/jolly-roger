import React from "react";
import type {
  AlignMode,
  DistributeAxis,
} from "../../../lib/whiteboard/arrange";

// Font Awesome's free set only has text-alignment icons, which read wrongly
// for lining up objects, so these are drawn here: a guide line plus two
// shapes for alignment, three evenly spaced shapes for distribution.
const SHAPES: Record<AlignMode | DistributeAxis, React.ReactNode> = {
  left: (
    <>
      <rect x="1" y="1" width="1.5" height="14" />
      <rect x="4" y="3" width="10" height="3" />
      <rect x="4" y="10" width="6" height="3" />
    </>
  ),
  centre: (
    <>
      <rect x="7.25" y="1" width="1.5" height="14" />
      <rect x="3" y="3" width="10" height="3" />
      <rect x="5" y="10" width="6" height="3" />
    </>
  ),
  right: (
    <>
      <rect x="13.5" y="1" width="1.5" height="14" />
      <rect x="2" y="3" width="10" height="3" />
      <rect x="6" y="10" width="6" height="3" />
    </>
  ),
  top: (
    <>
      <rect x="1" y="1" width="14" height="1.5" />
      <rect x="3" y="4" width="3" height="10" />
      <rect x="10" y="4" width="3" height="6" />
    </>
  ),
  middle: (
    <>
      <rect x="1" y="7.25" width="14" height="1.5" />
      <rect x="3" y="3" width="3" height="10" />
      <rect x="10" y="5" width="3" height="6" />
    </>
  ),
  bottom: (
    <>
      <rect x="1" y="13.5" width="14" height="1.5" />
      <rect x="3" y="2" width="3" height="10" />
      <rect x="10" y="6" width="3" height="6" />
    </>
  ),
  horizontal: (
    <>
      <rect x="1" y="3" width="3" height="10" />
      <rect x="6.5" y="3" width="3" height="10" />
      <rect x="12" y="3" width="3" height="10" />
    </>
  ),
  vertical: (
    <>
      <rect x="3" y="1" width="10" height="3" />
      <rect x="3" y="6.5" width="10" height="3" />
      <rect x="3" y="12" width="10" height="3" />
    </>
  ),
};

const ArrangeIcon = ({ kind }: { kind: AlignMode | DistributeAxis }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden
  >
    {SHAPES[kind]}
  </svg>
);

export default React.memo(ArrangeIcon);
