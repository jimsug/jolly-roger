/* eslint-disable jolly-roger/no-disallowed-sync-methods */
import Settings from "../../lib/models/Settings";
import isS3Configured from "../../methods/isS3Configured";
import defineMethod from "./defineMethod";

defineMethod(isS3Configured, {
  run() {
    const s3BucketSettings = Settings.findOne({
      name: "s3.image_bucket",
    });
    return !!(
      s3BucketSettings?.value?.bucketName &&
      s3BucketSettings?.value?.bucketRegion
    );
  },
});

export default isS3Configured;
