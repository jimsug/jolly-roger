import { z } from "zod";
import { allowedEmptyString, foreignKey } from "../typedModel/customTypes";
import type { ModelType } from "../typedModel/Model";
import SoftDeletedModel from "../typedModel/SoftDeletedModel";
import withCommon from "../typedModel/withCommon";

// A hunt member's interest in having a locked puzzle unlocked: at most one per
// member per puzzle (createdBy is the member). Withdrawing interest removes
// the row outright, so the unique index never collides with a soft-deleted
// one.
const PuzzleFeedback = withCommon(
  z.object({
    hunt: foreignKey,
    puzzle: foreignKey,
    // A weight for the interest. The UI always records 1, so the total over a
    // puzzle is a count of interested members.
    score: z.int32().positive(),
    comment: allowedEmptyString.optional(),
  }),
);

const PuzzleFeedbacks = new SoftDeletedModel(
  "jr_puzzle_feedbacks",
  PuzzleFeedback,
);
PuzzleFeedbacks.addIndex({ hunt: 1, puzzle: 1 });
PuzzleFeedbacks.addIndex({ createdBy: 1, puzzle: 1 }, { unique: true });
export type PuzzleFeedbackType = ModelType<typeof PuzzleFeedbacks>;

export default PuzzleFeedbacks;
