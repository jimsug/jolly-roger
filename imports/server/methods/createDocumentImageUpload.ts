import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Documents from "../../lib/models/Documents";
import MeteorUsers from "../../lib/models/MeteorUsers";
import createDocumentImageUpload from "../../methods/createDocumentImageUpload";
import assertUploadableImageType from "../assertUploadableImageType";
import getS3UploadParams from "../getS3UploadParams";
import defineMethod from "./defineMethod";

defineMethod(createDocumentImageUpload, {
  validate(arg) {
    check(arg, {
      documentId: String,
      filename: String,
      mimeType: String,
    });

    return arg;
  },

  async run({ documentId, filename, mimeType }) {
    check(this.userId, String);
    assertUploadableImageType(mimeType);
    const user = (await MeteorUsers.findOneAsync(this.userId))!;

    const document = await Documents.findOneAsync(documentId);
    if (!document) {
      throw new Meteor.Error(404, "Document not found");
    }

    if (!user.hunts?.includes(document.hunt)) {
      throw new Meteor.Error(403, "User is not a member of this hunt");
    }

    // Only plain characters from the filename go in the key: anything else
    // could read as part of the upload policy or break the image's address.
    const safeName = filename.replaceAll(/[^A-Za-z0-9._-]/g, "_");
    const key = `${document.hunt}/${documentId}/${Random.id()}-${safeName}`;

    return getS3UploadParams(key, mimeType);
  },
});
