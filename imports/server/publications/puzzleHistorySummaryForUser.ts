import { check } from "meteor/check";
import type { Meteor, Subscription } from "meteor/meteor";
import Bookmarks from "../../lib/models/Bookmarks";
import ChatMessages from "../../lib/models/ChatMessages";
import DocumentActivities from "../../lib/models/DocumentActivities";
import Guesses from "../../lib/models/Guesses";
import Hunts from "../../lib/models/Hunts";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import puzzleHistorySummaryForUser from "../../lib/publications/puzzleHistorySummaryForUser";
import {
  PUZZLE_HISTORY_SUMMARIES,
  type PuzzleHistoryItem,
} from "../../lib/puzzleHistory";
import { computeSolvedness } from "../../lib/solvedness";
import isWhiteboardPuzzle from "../../lib/whiteboard/isWhiteboardPuzzle";
import CallActivities from "../models/CallActivities";
import huntsForPuzzleHistory from "../puzzleHistoryHunts";
import definePublication from "./definePublication";

type ActivityKind = "bookmark" | "call" | "chat" | "document" | "guess";

type Activity = {
  kind: ActivityKind;
  puzzle: string;
  ts: Date;
  correct: boolean;
};

type ObservedPuzzle = {
  title: string;
  hunt: string;
  answers: string[];
  tags: string[];
  expectedAnswerCount: number;
  completedWithNoAnswer?: boolean | undefined;
  kind?: PuzzleType["kind"];
};

type ObservedActivity = Partial<{
  puzzle: string;
  call: string;
  ts: Date;
  updatedAt: Date;
  createdAt: Date;
  timestamp: Date;
  state: string;
}>;

type ActivitySource = {
  kind: ActivityKind;
  observe: (callbacks: {
    added: (id: string, fields: ObservedActivity) => void;
    changed: (id: string, fields: ObservedActivity) => void;
    removed: (id: string) => void;
  }) => Promise<Meteor.LiveQueryHandle>;
};

// One summary per puzzle a user has touched (bookmarked, called, chatted,
// edited the sheet or guessed on), kept live for the puzzle history page.
// Everything is held in memory from the observers' initial results, so a
// change only ever recomputes one puzzle's summary without going back to the
// database. One aggregator per user is shared by that user's subscriptions
// and dropped when the last of them stops.
class UserPuzzleHistoryAggregator {
  static aggregators = new Map<string, UserPuzzleHistoryAggregator>();

  private readonly subscriptions = new Set<Subscription>();

  private readonly activityFields = new Map<string, ObservedActivity>();

  private readonly activities = new Map<string, Activity>();

  private readonly activitiesByPuzzle = new Map<string, Set<string>>();

  private readonly puzzles = new Map<string, ObservedPuzzle>();

  private readonly huntNames = new Map<string, string>();

  private readonly tagNames = new Map<string, string>();

  private readonly summaries = new Map<string, PuzzleHistoryItem>();

  private handles: Meteor.LiveQueryHandle[] = [];

  private initializing = true;

  private closed = false;

  readonly ready: Promise<void>;

  private constructor(
    private readonly userId: string,
    // Fixed when the aggregator is created: joining a hunt mid-session shows
    // up once every tab of the history page has been closed and reopened
    private readonly hunts: string[],
  ) {
    this.ready = this.initialize();
  }

  static async get(
    userId: string,
    hunts: string[],
  ): Promise<UserPuzzleHistoryAggregator> {
    for (;;) {
      let aggregator = UserPuzzleHistoryAggregator.aggregators.get(userId);
      if (!aggregator) {
        aggregator = new UserPuzzleHistoryAggregator(userId, hunts);
        UserPuzzleHistoryAggregator.aggregators.set(userId, aggregator);
      }
      try {
        await aggregator.ready;
      } catch (error) {
        aggregator.close();
        throw error;
      }
      if (!aggregator.closed) {
        return aggregator;
      }
      // Its last subscriber left while we were waiting, so it's been torn
      // down; start another
    }
  }

  private async initialize() {
    const huntFilter = { $in: this.hunts };
    const sources: ActivitySource[] = [
      {
        kind: "bookmark",
        observe: (callbacks) =>
          Bookmarks.find(
            { user: this.userId, hunt: huntFilter },
            { fields: { puzzle: 1, updatedAt: 1 } },
          ).observeChangesAsync(callbacks),
      },
      {
        kind: "call",
        observe: (callbacks) =>
          CallActivities.find(
            { user: this.userId, hunt: huntFilter },
            { fields: { call: 1, ts: 1 } },
          ).observeChangesAsync(callbacks),
      },
      {
        kind: "chat",
        observe: (callbacks) =>
          ChatMessages.find(
            {
              hunt: huntFilter,
              $or: [
                { sender: this.userId },
                {
                  "content.children": {
                    $elemMatch: { type: "mention", userId: this.userId },
                  },
                },
              ],
            },
            { fields: { puzzle: 1, timestamp: 1 } },
          ).observeChangesAsync(callbacks),
      },
      {
        kind: "document",
        observe: (callbacks) =>
          DocumentActivities.find(
            { user: this.userId, hunt: huntFilter },
            { fields: { puzzle: 1, ts: 1 } },
          ).observeChangesAsync(callbacks),
      },
      {
        kind: "guess",
        observe: (callbacks) =>
          Guesses.find(
            { createdBy: this.userId, hunt: huntFilter },
            { fields: { puzzle: 1, createdAt: 1, state: 1 } },
          ).observeChangesAsync(callbacks),
      },
    ];

    const handles = await Promise.all([
      ...sources.map(({ kind, observe }) =>
        observe({
          added: (id, fields) => {
            const key = `${kind}:${id}`;
            this.activityFields.set(key, fields);
            this.placeActivity(key, kind);
          },
          changed: (id, fields) => {
            const key = `${kind}:${id}`;
            this.activityFields.set(key, {
              ...this.activityFields.get(key),
              ...fields,
            });
            this.placeActivity(key, kind);
          },
          removed: (id) => {
            const key = `${kind}:${id}`;
            this.activityFields.delete(key);
            this.dropActivity(key);
          },
        }),
      ),
      Puzzles.find(
        { hunt: huntFilter },
        {
          fields: {
            title: 1,
            hunt: 1,
            answers: 1,
            tags: 1,
            expectedAnswerCount: 1,
            completedWithNoAnswer: 1,
            kind: 1,
          },
        },
      ).observeChangesAsync({
        added: (id, fields) => {
          this.puzzles.set(id, fields as ObservedPuzzle);
          this.recompute(id);
        },
        changed: (id, fields) => {
          const existing = this.puzzles.get(id);
          if (existing) {
            this.puzzles.set(id, { ...existing, ...fields });
            this.recompute(id);
          }
        },
        removed: (id) => {
          this.puzzles.delete(id);
          this.recompute(id);
        },
      }),
      Hunts.find(
        { _id: huntFilter },
        { fields: { name: 1 } },
      ).observeChangesAsync({
        added: (id, fields) => {
          this.huntNames.set(id, fields.name ?? "");
        },
        changed: (id, fields) => {
          if (fields.name !== undefined) {
            this.huntNames.set(id, fields.name);
            this.recomputeWhere((puzzle) => puzzle.hunt === id);
          }
        },
        removed: (id) => {
          this.huntNames.delete(id);
          this.recomputeWhere((puzzle) => puzzle.hunt === id);
        },
      }),
      Tags.find(
        { hunt: huntFilter },
        { fields: { name: 1 } },
      ).observeChangesAsync({
        added: (id, fields) => {
          this.tagNames.set(id, fields.name ?? "");
        },
        changed: (id, fields) => {
          if (fields.name !== undefined) {
            this.tagNames.set(id, fields.name);
            this.recomputeWhere((puzzle) => puzzle.tags.includes(id));
          }
        },
        removed: (id) => {
          this.tagNames.delete(id);
          this.recomputeWhere((puzzle) => puzzle.tags.includes(id));
        },
      }),
    ]);
    this.handles = handles;
    if (this.closed) {
      this.close();
      return;
    }

    this.initializing = false;
    for (const puzzleId of this.activitiesByPuzzle.keys()) {
      this.recompute(puzzleId);
    }
  }

  private activityFrom(key: string, kind: ActivityKind): Activity | undefined {
    const fields = this.activityFields.get(key);
    if (!fields) {
      return undefined;
    }
    const puzzle = kind === "call" ? fields.call : fields.puzzle;
    let ts: Date | undefined;
    switch (kind) {
      case "bookmark":
        ts = fields.updatedAt;
        break;
      case "call":
      case "document":
        ts = fields.ts;
        break;
      case "chat":
        ts = fields.timestamp;
        break;
      case "guess":
        ts = fields.createdAt;
        break;
      default:
        kind satisfies never;
    }
    if (!puzzle || !ts) {
      return undefined;
    }
    return { kind, puzzle, ts, correct: fields.state === "correct" };
  }

  private placeActivity(key: string, kind: ActivityKind) {
    this.dropActivity(key);
    const activity = this.activityFrom(key, kind);
    if (!activity) {
      return;
    }
    this.activities.set(key, activity);
    let keys = this.activitiesByPuzzle.get(activity.puzzle);
    if (!keys) {
      keys = new Set();
      this.activitiesByPuzzle.set(activity.puzzle, keys);
    }
    keys.add(key);
    this.recompute(activity.puzzle);
  }

  private dropActivity(key: string) {
    const activity = this.activities.get(key);
    if (!activity) {
      return;
    }
    this.activities.delete(key);
    const keys = this.activitiesByPuzzle.get(activity.puzzle);
    keys?.delete(key);
    if (keys?.size === 0) {
      this.activitiesByPuzzle.delete(activity.puzzle);
    }
    this.recompute(activity.puzzle);
  }

  private recomputeWhere(predicate: (puzzle: ObservedPuzzle) => boolean) {
    for (const puzzleId of this.activitiesByPuzzle.keys()) {
      const puzzle = this.puzzles.get(puzzleId);
      if (puzzle && predicate(puzzle)) {
        this.recompute(puzzleId);
      }
    }
  }

  private summarize(puzzleId: string): PuzzleHistoryItem | undefined {
    const puzzle = this.puzzles.get(puzzleId);
    const keys = this.activitiesByPuzzle.get(puzzleId);
    if (!puzzle || !keys || keys.size === 0) {
      return undefined;
    }

    const item: PuzzleHistoryItem = {
      _id: puzzleId,
      userId: this.userId,
      puzzleId,
      name: puzzle.title,
      huntId: puzzle.hunt,
      huntName: this.huntNames.get(puzzle.hunt) ?? "",
      firstInteraction: null,
      lastInteraction: null,
      interactionCount: 0,
      bookmarkCounter: 0,
      callCounter: 0,
      chatCounter: 0,
      documentCounter: 0,
      guessCounter: 0,
      correctGuessCounter: 0,
      solvedness: computeSolvedness({
        answers: puzzle.answers,
        expectedAnswerCount: puzzle.expectedAnswerCount,
        completedWithNoAnswer: puzzle.completedWithNoAnswer,
      } as Parameters<typeof computeSolvedness>[0]),
      answers: puzzle.answers,
      tags: puzzle.tags.map((tag) => this.tagNames.get(tag) ?? ""),
      ...(isWhiteboardPuzzle(puzzle) ? { whiteboard: true } : {}),
    };

    for (const key of keys) {
      const activity = this.activities.get(key);
      if (!activity) {
        continue;
      }
      item.interactionCount += 1;
      if (!item.firstInteraction || activity.ts < item.firstInteraction) {
        item.firstInteraction = activity.ts;
      }
      if (!item.lastInteraction || activity.ts > item.lastInteraction) {
        item.lastInteraction = activity.ts;
      }
      switch (activity.kind) {
        case "bookmark":
          item.bookmarkCounter += 1;
          break;
        case "call":
          item.callCounter += 1;
          break;
        case "chat":
          item.chatCounter += 1;
          break;
        case "document":
          item.documentCounter += 1;
          break;
        case "guess":
          item.guessCounter += 1;
          if (activity.correct) {
            item.correctGuessCounter += 1;
          }
          break;
        default:
          activity.kind satisfies never;
      }
    }
    return item;
  }

  private recompute(puzzleId: string) {
    if (this.initializing) {
      return;
    }
    const previous = this.summaries.get(puzzleId);
    const next = this.summarize(puzzleId);
    if (!next) {
      if (previous) {
        this.summaries.delete(puzzleId);
        this.subscriptions.forEach((sub) =>
          sub.removed(PUZZLE_HISTORY_SUMMARIES, puzzleId),
        );
      }
      return;
    }
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) {
      return;
    }
    this.summaries.set(puzzleId, next);
    this.subscriptions.forEach((sub) => {
      if (previous) {
        sub.changed(PUZZLE_HISTORY_SUMMARIES, puzzleId, next);
      } else {
        sub.added(PUZZLE_HISTORY_SUMMARIES, puzzleId, next);
      }
    });
  }

  addSubscription(sub: Subscription) {
    this.subscriptions.add(sub);
    this.summaries.forEach((item, puzzleId) => {
      sub.added(PUZZLE_HISTORY_SUMMARIES, puzzleId, item);
    });
    sub.ready();

    sub.onStop(() => {
      this.subscriptions.delete(sub);
      if (this.subscriptions.size === 0) {
        this.close();
      }
    });
  }

  close() {
    this.closed = true;
    this.handles.forEach((handle) => handle.stop());
    this.handles = [];
    this.activityFields.clear();
    this.activities.clear();
    this.activitiesByPuzzle.clear();
    this.puzzles.clear();
    this.summaries.clear();
    if (UserPuzzleHistoryAggregator.aggregators.get(this.userId) === this) {
      UserPuzzleHistoryAggregator.aggregators.delete(this.userId);
    }
  }
}

definePublication(puzzleHistorySummaryForUser, {
  validate(arg) {
    check(arg, { userId: String });
    return arg;
  },

  async run({ userId }) {
    if (!this.userId) {
      return [];
    }

    const hunts = await huntsForPuzzleHistory(this.userId, userId);
    if (!hunts) {
      return [];
    }

    const aggregator = await UserPuzzleHistoryAggregator.get(userId, hunts);
    aggregator.addSubscription(this);
    return undefined;
  },
});
