import type { Meteor } from "meteor/meteor";
import CallActivities from "../../lib/models/CallActivities";
import ChatMessages from "../../lib/models/ChatMessages";
import DocumentActivities from "../../lib/models/DocumentActivities";
import MeteorUsers from "../../lib/models/MeteorUsers";
import activitySummaryForUser from "../../lib/publications/activitySummaryForUser";
import {
  ACTIVITY_HISTORY_SUMMARIES,
  type ActivityHistorySummary,
  type GraphedActivityKind,
} from "../../lib/puzzleHistory";
import definePublication from "./definePublication";

type ActivityCursor = {
  type: GraphedActivityKind;
  observe: (callbacks: {
    added: (id: string, fields: { hunt?: string; ts?: Date }) => void;
    changed: (id: string, fields: { hunt?: string; ts?: Date }) => void;
    removed: (id: string) => void;
  }) => Promise<Meteor.LiveQueryHandle>;
};

function bucketFor(
  hunt: string,
  ts: Date,
  type: GraphedActivityKind,
): ActivityHistorySummary {
  const dayOfWeek = ts.getUTCDay();
  const hour = ts.getUTCHours();
  return {
    _id: `${hunt}-${dayOfWeek}-${hour}-${type}`,
    huntId: hunt,
    dayOfWeek,
    hour,
    type,
    count: 0,
  };
}

// Counts a user's chat messages, sheet edits and call activity by UTC day of
// week and hour, for the contribution graph. Call rows count whether or not
// the user was speaking: being on the call is the activity.
definePublication(activitySummaryForUser, {
  async run() {
    const { userId } = this;
    if (!userId) {
      return [];
    }

    const hunts = (await MeteorUsers.findOneAsync(userId))?.hunts ?? [];
    if (hunts.length === 0) {
      return [];
    }
    const huntFilter = { $in: hunts };

    const buckets = new Map<string, ActivityHistorySummary>();
    const counts = new Map<string, number>();
    // Where each source document currently counts, so a change or removal
    // can take it back out
    const bucketOf = new Map<string, string>();
    // The observers deliver every existing document through `added` before
    // they resolve. Publishing a change per document would send thousands of
    // messages for a result of at most a few hundred buckets, so the counts
    // are only published once the initial results are in.
    let initialized = false;

    const add = (docKey: string, bucket: ActivityHistorySummary) => {
      const count = (counts.get(bucket._id) ?? 0) + 1;
      counts.set(bucket._id, count);
      bucketOf.set(docKey, bucket._id);
      if (!initialized) {
        buckets.set(bucket._id, bucket);
        return;
      }
      if (count === 1) {
        this.added(ACTIVITY_HISTORY_SUMMARIES, bucket._id, {
          ...bucket,
          count,
        });
      } else {
        this.changed(ACTIVITY_HISTORY_SUMMARIES, bucket._id, { count });
      }
    };

    const remove = (docKey: string) => {
      const bucketId = bucketOf.get(docKey);
      if (!bucketId) {
        return;
      }
      bucketOf.delete(docKey);
      const count = (counts.get(bucketId) ?? 1) - 1;
      if (count <= 0) {
        counts.delete(bucketId);
        buckets.delete(bucketId);
        if (initialized) {
          this.removed(ACTIVITY_HISTORY_SUMMARIES, bucketId);
        }
      } else {
        counts.set(bucketId, count);
        if (initialized) {
          this.changed(ACTIVITY_HISTORY_SUMMARIES, bucketId, { count });
        }
      }
    };

    const cursors: ActivityCursor[] = [
      {
        type: "call",
        observe: (callbacks) =>
          CallActivities.find(
            { user: userId, hunt: huntFilter },
            { projection: { hunt: 1, ts: 1 } },
          ).observeChangesAsync(callbacks),
      },
      {
        type: "chat",
        observe: (callbacks) =>
          ChatMessages.find(
            { sender: userId, hunt: huntFilter },
            { projection: { hunt: 1, timestamp: 1 } },
          ).observeChangesAsync({
            added: (id, fields) =>
              callbacks.added(id, { hunt: fields.hunt, ts: fields.timestamp }),
            changed: (id, fields) =>
              callbacks.changed(id, {
                hunt: fields.hunt,
                ts: fields.timestamp,
              }),
            removed: callbacks.removed,
          }),
      },
      {
        type: "document",
        observe: (callbacks) =>
          DocumentActivities.find(
            { user: userId, hunt: huntFilter },
            { projection: { hunt: 1, ts: 1 } },
          ).observeChangesAsync(callbacks),
      },
    ];

    const handles = await Promise.all(
      cursors.map(({ type, observe }) => {
        // observeChanges only reports the fields that changed, so remember
        // what we've seen of each document
        const seen = new Map<string, { hunt?: string; ts?: Date }>();
        const place = (id: string) => {
          const docKey = `${type}:${id}`;
          remove(docKey);
          const doc = seen.get(id);
          if (doc?.hunt && doc.ts) {
            add(docKey, bucketFor(doc.hunt, doc.ts, type));
          }
        };
        return observe({
          added: (id, fields) => {
            seen.set(id, fields);
            place(id);
          },
          changed: (id, fields) => {
            seen.set(id, { ...seen.get(id), ...fields });
            place(id);
          },
          removed: (id) => {
            seen.delete(id);
            remove(`${type}:${id}`);
          },
        });
      }),
    );

    this.onStop(() => {
      handles.forEach((handle) => handle.stop());
      buckets.clear();
      counts.clear();
      bucketOf.clear();
    });

    initialized = true;
    for (const [bucketId, bucket] of buckets) {
      this.added(ACTIVITY_HISTORY_SUMMARIES, bucketId, {
        ...bucket,
        count: counts.get(bucketId) ?? 0,
      });
    }
    buckets.clear();
    this.ready();
    return undefined;
  },
});
