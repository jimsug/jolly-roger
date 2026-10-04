import Logger from "../../Logger";
import applyTagSynonyms from "../../lib/jobs/applyTagSynonyms";
import Hunts from "../../lib/models/Hunts";
import Tags from "../../lib/models/Tags";
import planHuntTagSynonyms from "../planHuntTagSynonyms";
import renameOrMergeTag from "../renameOrMergeTag";
import defineJob from "./framework/defineJob";

defineJob(applyTagSynonyms, {
  async run(_args, { signal, setResult }) {
    const hunts = await Hunts.find(
      {},
      { projection: { _id: 1 }, sort: { createdAt: 1 } },
    ).fetchAsync();
    const huntsTotal = hunts.length;
    let renamed = 0;
    let merged = 0;
    Logger.info("Applying tag synonyms", { hunts: huntsTotal });

    for (const [index, { _id: huntId }] of hunts.entries()) {
      signal.throwIfAborted();
      // Planned against the tags as they are now; each step reads its tag
      // again and renameOrMergeTag finds its own target, so a tag changed or
      // removed since is handled as it is then.
      for (const step of await planHuntTagSynonyms(huntId)) {
        signal.throwIfAborted();
        const tag = await Tags.findOneAsync(step.tagId);
        if (tag?.name !== step.from) continue;
        const outcome = await renameOrMergeTag(tag, step.to, true);
        if (outcome === "renamed") renamed += 1;
        if (outcome === "merged") merged += 1;
      }
      await setResult({
        huntsTotal,
        huntsCompleted: index + 1,
        renamed,
        merged,
      });
      Logger.info("Applied tag synonyms to hunt", {
        hunt: huntId,
        huntsCompleted: index + 1,
        huntsTotal,
      });
    }

    Logger.info("Finished applying tag synonyms", {
      hunts: huntsTotal,
      renamed,
      merged,
    });
  },
});
