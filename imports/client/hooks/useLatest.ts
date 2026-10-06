import { useEffect, useRef } from "react";

// The latest value, for a listener registered once to read when it fires.
// It's updated once each render has committed, as a listener re-registered
// with the value as a dependency would be.
export default function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
