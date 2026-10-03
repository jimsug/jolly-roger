import Puzzles from "../lib/models/Puzzles";

// The Palindrome fork let operators mark a puzzle complete by hand
// (markedComplete), which the schema no longer declares, so a puzzle still
// carrying it would fail validation on its next update. Solvedness is
// preserved where the current rules can express it:
// - a puzzle marked complete before its answers satisfied the expected count
//   (including the fork's "unknown count" of -1) gets the count it ended up
//   with, or becomes a completed 0-answer item when nothing was recorded;
// - a 0-answer item flagged completedWithNoAnswer but never marked complete
//   counted as unsolved under the fork, so the flag is dropped and it goes
//   back to being administrivia rather than turning solved.
// Same pattern as migration 54: one pipeline update per row, validation
// bypassed, raw collection so soft-deleted puzzles are fixed too.
export default async function dropPuzzleMarkedComplete() {
  const answerCount = { $size: { $ifNull: ["$answers", []] } };
  // Marked complete, but not solved by the current rules
  const needsRecount = {
    $and: [
      { $eq: ["$markedComplete", true] },
      { $ne: ["$expectedAnswerCount", 0] },
      {
        $or: [
          { $lt: ["$expectedAnswerCount", 0] },
          { $lt: [answerCount, "$expectedAnswerCount"] },
        ],
      },
    ],
  };
  await Puzzles.collection.rawCollection().updateMany(
    {
      $or: [
        { markedComplete: { $exists: true } },
        { expectedAnswerCount: 0, completedWithNoAnswer: true },
      ],
    },
    [
      {
        $set: {
          expectedAnswerCount: {
            $cond: [needsRecount, answerCount, "$expectedAnswerCount"],
          },
          completedWithNoAnswer: {
            $cond: [
              // Marked complete with nothing recorded: a completed 0-answer item
              { $and: [needsRecount, { $eq: [answerCount, 0] }] },
              true,
              {
                $cond: [
                  // Flagged but never marked complete: unsolved under the fork
                  {
                    $and: [
                      { $eq: ["$expectedAnswerCount", 0] },
                      { $eq: ["$completedWithNoAnswer", true] },
                      { $ne: ["$markedComplete", true] },
                    ],
                  },
                  "$$REMOVE",
                  { $ifNull: ["$completedWithNoAnswer", "$$REMOVE"] },
                ],
              },
            ],
          },
        },
      },
      { $unset: "markedComplete" },
    ],
    { bypassDocumentValidation: true },
  );
}
