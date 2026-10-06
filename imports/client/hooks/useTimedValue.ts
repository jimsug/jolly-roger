import { useCallback, useEffect, useRef, useState } from "react";

// A value shown for `ms`, then dropped. Showing another restarts the clock,
// and unmounting stops it.
export default function useTimedValue<T>(
  ms: number,
): [T | undefined, (value: T) => void] {
  const [value, setValue] = useState<T>();
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (next: T) => {
      setValue(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setValue(undefined), ms);
    },
    [ms],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [value, show];
}
