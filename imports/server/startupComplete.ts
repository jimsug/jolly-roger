let resolveStartupComplete: () => void;

// Resolves once the startup hooks have run (or been skipped). The test runner
// starts server tests without waiting for them, so test helpers wait on this
// before touching the database; wiping it while migrations are still being
// applied corrupts the migration control record.
export const startupComplete = new Promise<void>((resolve) => {
  resolveStartupComplete = resolve;
});

// Called by runIfLatestBuild once its startup hooks are done
export function markStartupComplete() {
  resolveStartupComplete();
}
