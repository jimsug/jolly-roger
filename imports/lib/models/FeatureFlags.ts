import { z } from "zod";
import type { ModelType } from "../typedModel/Model";
import SoftDeletedModel from "../typedModel/SoftDeletedModel";
import withCommon from "../typedModel/withCommon";

export const FlagNames = [
  "disable.board",
  "disable.dingwords",
  "disable.discord",
  "disable.gdrive_document_activity",
  "disable.gdrive_document_cache",
  "disable.gdrive_permissions",
  "disable.google",
  "disable.new_puzzle_notifications",
  "disable.puzzle_notes",
  "disable.spectra",
  "disable.webrtc",
  "disable.whiteboard",
  "disable.whiteboard_live",
  "disable.whiteboard_versions",
  "test",
] as const;

const FeatureFlag = withCommon(
  z.object({
    name: z.enum(FlagNames),
    // type represents the mode of a feature flag. If a feature flag
    // with a given name doesn't exist, it's assumed to be of type
    // "off"
    type: z.enum(["off", "on"]),
  }),
);

const FeatureFlags = new SoftDeletedModel("jr_featureflags", FeatureFlag);
FeatureFlags.addIndex({ name: 1 }, { unique: true });
export type FeatureFlagType = ModelType<typeof FeatureFlags>;

export default FeatureFlags;
