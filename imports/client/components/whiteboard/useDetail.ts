import { useStore } from "@xyflow/react";

type Detail = "full" | "mid" | "far";

const FULL_DETAIL_ZOOM = 0.6;
const MID_DETAIL_ZOOM = 0.3;

function detailForZoom(zoom: number): Detail {
  if (zoom >= FULL_DETAIL_ZOOM) return "full";
  if (zoom >= MID_DETAIL_ZOOM) return "mid";
  return "far";
}

// Bucketed so nodes only re-render when crossing a threshold, not on every
// zoom step.
export default function useDetail(): Detail {
  return useStore((s) => detailForZoom(s.transform[2]));
}

export function useZoom(): number {
  return useStore((s) => s.transform[2]);
}
