import Tags from "../lib/models/Tags";
import planTagSynonymApply from "../lib/planTagSynonymApply";
import currentTagSynonyms from "./tagSynonyms";

// What applying the current synonym table would do to one hunt's tags, oldest
// tag first.
export default async function planHuntTagSynonyms(huntId: string) {
  const tags = await Tags.find(
    { hunt: huntId },
    { projection: { name: 1, aliases: 1 }, sort: { createdAt: 1, _id: 1 } },
  ).fetchAsync();
  return planTagSynonymApply(tags, currentTagSynonyms());
}
