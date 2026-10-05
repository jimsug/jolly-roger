import { Meteor } from "meteor/meteor";

// The image types the client uploads as they are. It turns anything else into
// a PNG first, so these are all the bucket needs to take. An SVG in
// particular stays out: opened straight from its bucket address, it would run
// any script in it.
const UPLOADABLE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
]);

export default function assertUploadableImageType(mimeType: string) {
  if (!UPLOADABLE_IMAGE_TYPES.has(mimeType.toLowerCase())) {
    throw new Meteor.Error(
      400,
      "Only PNG, JPEG and GIF images can be uploaded.",
    );
  }
}
