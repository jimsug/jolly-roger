// Sent by useBestEffortLocalStorage (imports/client/hooks/persisted-state.ts)
// to the other hooks in the tab using the same key.
interface WindowEventMap {
  "jr:bestEffortStorage": CustomEvent<{ key: string; value: unknown }>;
}
