import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { SettingType } from "../lib/models/Settings";
import Settings from "../lib/models/Settings";

type ImageBucket = Extract<SettingType, { name: "s3.image_bucket" }>["value"];

// The S3 bucket images are uploaded to, if one is configured.
export async function imageBucket(): Promise<ImageBucket | undefined> {
  const s3BucketSettings = await Settings.findOneAsync({
    name: "s3.image_bucket",
  });
  return s3BucketSettings?.value;
}

// Where an object in the image bucket can be read from.
export const imageObjectUrl = (bucket: ImageBucket, key: string) =>
  `https://s3.${bucket.bucketRegion}.amazonaws.com/${bucket.bucketName}/${key}`;

export default async function getS3UploadParams(key: string, mimeType: string) {
  const bucket = await imageBucket();
  if (!bucket) {
    // S3 image uploads are not configured
    return undefined;
  }

  const s3 = new S3Client({ region: bucket.bucketRegion });
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: bucket.bucketName,
    Key: key,
    Fields: {
      "Content-Type": mimeType,
    },
  });

  const publicUrl = imageObjectUrl(bucket, key);

  return { publicUrl, uploadUrl: url, fields };
}
