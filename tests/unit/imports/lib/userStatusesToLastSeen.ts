import { assert } from "chai";
import userStatusesToLastSeen, {
  type UserStatusRow,
} from "../../../../imports/lib/userStatusesToLastSeen";

const at = (minutesAgo: number) =>
  new Date(Date.UTC(2026, 0, 1, 12, 0) - minutesAgo * 60 * 1000);

const row = (
  user: string,
  type: string,
  status: string,
  updatedAt: Date,
  puzzle?: string,
): UserStatusRow => ({ user, type, status, updatedAt, puzzle });

describe("userStatusesToLastSeen", function () {
  it("returns nothing for no rows", function () {
    assert.deepEqual(userStatusesToLastSeen([]), {});
  });

  it("takes the best presence across a user's connections", function () {
    const summaries = userStatusesToLastSeen([
      row("alice", "status", "offline", at(30)),
      row("alice", "status", "away", at(10)),
      row("alice", "status", "online", at(20)),
      row("bob", "status", "away", at(5)),
      row("bob", "status", "offline", at(1)),
    ]);
    assert.deepEqual(summaries.alice?.status, {
      status: "online",
      at: at(20),
    });
    assert.deepEqual(summaries.bob?.status, { status: "away", at: at(5) });
  });

  it("keeps the newest timestamp for the winning status", function () {
    const summaries = userStatusesToLastSeen([
      row("alice", "status", "online", at(20)),
      row("alice", "status", "online", at(2)),
      row("alice", "status", "online", at(8)),
    ]);
    assert.deepEqual(summaries.alice?.status, { status: "online", at: at(2) });
  });

  it("takes the newest puzzle interaction", function () {
    const summaries = userStatusesToLastSeen([
      row("alice", "puzzleStatus", "chat", at(15), "puzzle1"),
      row("alice", "puzzleStatus", "document", at(3), "puzzle2"),
      row("alice", "puzzleStatus", "call", at(9), "puzzle3"),
    ]);
    assert.deepEqual(summaries.alice?.puzzleStatus, {
      source: "document",
      at: at(3),
      puzzle: "puzzle2",
    });
    assert.deepEqual(
      summaries.alice?.status,
      { status: "offline", at: null },
      "A puzzle interaction on its own doesn't make the user present",
    );
  });

  it("ignores rows with unknown types or statuses", function () {
    const summaries = userStatusesToLastSeen([
      row("alice", "status", "mystery", at(1)),
      row("alice", "somethingElse", "online", at(1)),
    ]);
    assert.deepEqual(summaries.alice, {
      status: { status: "offline", at: null },
      puzzleStatus: { source: null, at: null, puzzle: null },
    });
  });
});
