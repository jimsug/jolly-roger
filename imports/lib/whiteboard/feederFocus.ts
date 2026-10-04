interface Arrow {
  source: string;
  target: string;
}

// The cards whose feeder arrows stand out: those of the hovered or selected
// cards that have any, sorted and without repeats. A feeder arrow runs from
// the feeder's card to the meta's, so a meta brings out its feeders' arrows
// and a feeder its metas'.
export function feederFocus(
  cardIds: Iterable<string | undefined>,
  feederArrows: Arrow[],
): string[] {
  const ends = new Set(feederArrows.flatMap((a) => [a.source, a.target]));
  return [...new Set(cardIds)]
    .filter((id): id is string => id !== undefined && ends.has(id))
    .toSorted();
}

export type FeederArrowEmphasis = "raised" | "faded";

// How a feeder arrow is drawn while some cards are in focus: raised when it
// touches one of them, faded otherwise. With nothing in focus, as usual.
export function feederArrowEmphasis(
  arrow: Arrow,
  focus: ReadonlySet<string>,
): FeederArrowEmphasis | undefined {
  if (focus.size === 0) return undefined;
  return focus.has(arrow.source) || focus.has(arrow.target)
    ? "raised"
    : "faded";
}

// A feeder arrow's stroke: thin and quiet as a rule, full strength when
// selected, thicker too when raised, and nearly gone when faded.
export function feederArrowLook(
  emphasis: FeederArrowEmphasis | undefined,
  selected: boolean,
): { strokeWidth: number; opacity: number } {
  const strokeWidth = emphasis === "raised" ? 2 : 1;
  if (selected || emphasis === "raised") return { strokeWidth, opacity: 1 };
  return { strokeWidth, opacity: emphasis === "faded" ? 0.15 : 0.55 };
}
