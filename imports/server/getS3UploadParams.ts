import { Meteor } from "meteor/meteor";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { MAX_UPLOAD_BYTES } from "../lib/imageUploads";
import type { SettingType } from "../lib/models/Settings";
import Settings from "../lib/models/Settings";
import { Id } from "../lib/typedModel/regexes";

type ImageBucket = Extract<SettingType, { name: "s3.image_bucket" }>["value"];

// The S3 bucket images are uploaded to, if one is configured.
export async function imageBucket(): Promise<ImageBucket | undefined> {
  const s3BucketSettings = await Settings.findOneAsync({
    name: "s3.image_bucket",
  });
  return s3BucketSettings?.value;
}

// Where an object in the image bucket can be read from. Each segment of the
// key is encoded, so a filename's own "#", "?" or "%" stays in the path.
export const imageObjectUrl = (bucket: ImageBucket, key: string) =>
  `https://s3.${bucket.bucketRegion}.amazonaws.com/${bucket.bucketName}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

// Whether url is an object in the image bucket, with no way out of it.
export function isImageObjectUrl(bucket: ImageBucket, url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const base = new URL(imageObjectUrl(bucket, ""));
  return (
    parsed.origin === base.origin &&
    !parsed.username &&
    !parsed.password &&
    parsed.pathname.startsWith(base.pathname) &&
    url.startsWith(base.href)
  );
}

// Images on the board and in chat and comments are objects uploaded as chat
// images are (see createChatImageUpload): in the image bucket, keyed by this
// hunt's id, a puzzle's id and the upload's own. That keeps readers'
// browsers from fetching anything from anywhere else, and keeps another
// hunt's images (which go when that hunt is purged) out. Anything else,
// including when there's no bucket, is refused.
export async function assertStoredImages(huntId: string, urls: string[]) {
  if (urls.length === 0) return;
  const bucket = await imageBucket();
  const prefix = bucket ? imageObjectUrl(bucket, "") : undefined;
  urls.forEach((url) => {
    const key =
      prefix && url.startsWith(prefix) ? url.slice(prefix.length) : "";
    const parts = key.split("/");
    if (
      parts.length !== 3 ||
      parts[0] !== huntId ||
      !parts.every((part) => Id.test(part))
    ) {
      throw new Meteor.Error(400, "That image isn't one we stored");
    }
  });
}

// How long the browser has to start an upload. How big it can be is
// MAX_UPLOAD_BYTES, which the browser checks first.
const UPLOAD_EXPIRES_SECONDS = 5 * 60;

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
    Conditions: [["content-length-range", 1, MAX_UPLOAD_BYTES]],
    Expires: UPLOAD_EXPIRES_SECONDS,
  });

  const publicUrl = imageObjectUrl(bucket, key);

  return { publicUrl, uploadUrl: url, fields };
}
