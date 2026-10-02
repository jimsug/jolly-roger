export interface ContributorEntry {
  user: string;
  at: Date;
}

// One entry per person, newest first, using each person's latest edit. Edits
// with the same timestamp are ordered by their position in the log, later
// first.
export default function contributorsByRecency(
  log: ContributorEntry[] | undefined,
): ContributorEntry[] {
  const latest = new Map<string, { entry: ContributorEntry; index: number }>();
  (log ?? []).forEach((entry, index) => {
    const seen = latest.get(entry.user);
    if (!seen || +entry.at >= +seen.entry.at) {
      latest.set(entry.user, { entry, index });
    }
  });
  return [...latest.values()]
    .sort((a, b) => +b.entry.at - +a.entry.at || b.index - a.index)
    .map(({ entry }) => entry);
}
