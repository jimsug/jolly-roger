import purgeHuntDocumentCache from "../../lib/jobs/purgeHuntDocumentCache";
import { purgeDocumentCache } from "../documentCache";
import { checkClientOk } from "../gdrive";
import defineJob from "./framework/defineJob";

defineJob(purgeHuntDocumentCache, {
  async run({ huntId }, { signal, setResult }) {
    // The method checked this before queueing the job, but Drive may have
    // gone away since. Without it the files can't be deleted, and removing
    // the rows anyway would lose track of them.
    await checkClientOk();

    await purgeDocumentCache(huntId, {
      signal,
      onProgress: (itemsCompleted, itemsTotal) =>
        setResult({ itemsTotal, itemsCompleted }),
    });
  },
});
