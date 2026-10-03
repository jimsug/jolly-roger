import { useState } from "react";
import { useInterval } from "usehooks-ts";

// The current time, refreshed every intervalMs, for derived state that ages
// (presence that goes idle, "last seen" labels) without any other trigger.
// A null interval pauses it (callers pass null while the tab is hidden); it
// catches up as soon as it resumes rather than at the next tick.
export default function useNow(intervalMs: number | null): Date {
  const [now, setNow] = useState(() => new Date());

  const paused = intervalMs === null;
  const [wasPaused, setWasPaused] = useState(paused);
  if (paused !== wasPaused) {
    setWasPaused(paused);
    if (!paused) {
      setNow(new Date());
    }
  }

  useInterval(() => {
    setNow(new Date());
  }, intervalMs);

  return now;
}
