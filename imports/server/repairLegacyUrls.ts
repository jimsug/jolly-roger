import Logger from "../Logger";
import Hunts from "../lib/models/Hunts";
import Puzzles from "../lib/models/Puzzles";
import { Url } from "../lib/typedModel/regexes";

// The Palindrome fork checked URLs loosely (anything the URL parser took, and
// a database pattern that wasn't anchored), so its database can hold URLs the
// schema's Url pattern rejects, like " https://example.com/puzzle" or
// "Jamboard: https://...". The validator then refuses every later write to
// that puzzle or hunt. Each such field is repaired where it can be and
// cleared where it can't: a puzzle without a URL is better than one nothing
// can update. Validation is bypassed, as in migrations 54 and 56, so a
// document that's invalid for some other reason doesn't stop the rest, and
// the raw collections are used so soft-deleted documents are fixed too.

// A URL the pattern rejects, made into one it accepts if possible: trimmed,
// or failing that as the URL parser writes it out, which percent-encodes what
// needs it and punycodes the host.
export function repairUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (Url.test(trimmed)) {
    return trimmed;
  }
  const href = URL.parse(trimmed)?.href;
  return href !== undefined && Url.test(href) ? href : undefined;
}

// The update that repairs or clears each of a document's URL fields that the
// pattern rejects, logging each one it has to clear.
function repairsFor(
  kind: "puzzle" | "hunt",
  id: string,
  values: Record<string, unknown>,
) {
  const $set: Record<string, string> = {};
  const $unset: Record<string, ""> = {};
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined || (typeof value === "string" && Url.test(value))) {
      continue;
    }
    const repaired = repairUrl(value);
    if (repaired === undefined) {
      Logger.warn("Clearing a URL that can't be made valid", {
        [kind]: id,
        field,
        url: value,
      });
      $unset[field] = "";
    } else {
      $set[field] = repaired;
    }
  }
  return {
    ...(Object.keys($set).length > 0 ? { $set } : {}),
    ...(Object.keys($unset).length > 0 ? { $unset } : {}),
  };
}

const rejected = { $exists: true, $not: Url };

export default async function repairLegacyUrls() {
  // Read up front: url is indexed, so updating it under an open cursor could
  // bring a document round again
  const puzzles = Puzzles.collection.rawCollection();
  const badPuzzles = await puzzles
    .find(
      {
        $or: [{ url: rejected }, { "noteContent.externalLinkUrl": rejected }],
      },
      { projection: { url: 1, "noteContent.externalLinkUrl": 1 } },
    )
    .toArray();
  for (const puzzle of badPuzzles) {
    const update = repairsFor("puzzle", puzzle._id, {
      url: puzzle.url,
      "noteContent.externalLinkUrl": puzzle.noteContent?.externalLinkUrl,
    });
    if (Object.keys(update).length > 0) {
      await puzzles.updateOne({ _id: puzzle._id }, update, {
        bypassDocumentValidation: true,
      });
    }
  }

  const hunts = Hunts.collection.rawCollection();
  const badHunts = await hunts
    .find(
      {
        $or: [
          { homepageUrl: rejected },
          { archivedHuntUrl: rejected },
          { customLinkUrl: rejected },
        ],
      },
      { projection: { homepageUrl: 1, archivedHuntUrl: 1, customLinkUrl: 1 } },
    )
    .toArray();
  for (const hunt of badHunts) {
    const update = repairsFor("hunt", hunt._id, {
      homepageUrl: hunt.homepageUrl,
      archivedHuntUrl: hunt.archivedHuntUrl,
      customLinkUrl: hunt.customLinkUrl,
    });
    if (Object.keys(update).length > 0) {
      await hunts.updateOne({ _id: hunt._id }, update, {
        bypassDocumentValidation: true,
      });
    }
  }
}
