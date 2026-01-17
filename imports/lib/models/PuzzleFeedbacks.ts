import { z } from "zod";
import { foreignKey, nonEmptyString } from "./customTypes";
import type { ModelType } from "./Model";
import SoftDeletedModel from "./SoftDeletedModel";
import withCommon from "./withCommon";

const PuzzleFeedback = withCommon(
  z.object({
    hunt: foreignKey,
    puzzle: foreignKey,
    score: z.number().int(),
    comment: nonEmptyString.optional(),
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
