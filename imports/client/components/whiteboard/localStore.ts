// Per-viewer board conveniences (viewport, pen, toggles) kept in
// localStorage. Private windows and full storage just lose them.

export function readLocal<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do; the setting just won't stick.
  }
}
