import type { Meteor } from "meteor/meteor";
import type { TFunction } from "i18next";
import { MAX_UPLOAD_BYTES } from "../lib/imageUploads";
import createChatImageUpload from "../methods/createChatImageUpload";
import {
  convertImageToPng,
  isDirectlySupported,
} from "./components/InsertImage";

// Why an image didn't make it: the browser couldn't turn it into a PNG, the
// file (as it would be uploaded) is over MAX_UPLOAD_BYTES, the server
// wouldn't hand out an upload (with no error at all when it has nowhere to
// put images), or the upload itself failed.
export type ChatImageUploadFailure =
  | { stage: "convert"; error: unknown }
  | { stage: "tooBig" }
  | { stage: "request"; error: Meteor.Error | undefined }
  | { stage: "upload"; error: unknown };

// The reason to show for a failed upload, or undefined when the server has
// nowhere to store images (which callers word their own way).
export function chatImageFailureReason(
  failure: ChatImageUploadFailure,
  t: TFunction,
): string | undefined {
  if (failure.stage === "convert") {
    return t(
      "chat.imageUpload.unconvertible",
      "This browser can't convert that image to PNG. Use a PNG, JPEG or GIF instead.",
    );
  }
  if (failure.stage === "tooBig") {
    return t("chat.imageUpload.tooBig", "Images can be at most {{size}} MB.", {
      size: MAX_UPLOAD_BYTES / (1024 * 1024),
    });
  }
  if (failure.stage === "request") {
    return failure.error
      ? (failure.error.reason ?? failure.error.message)
      : undefined;
  }
  return failure.error instanceof Error
    ? failure.error.message
    : String(failure.error);
}

// Uploads an image as chat does: anything but a PNG, JPEG or GIF is drawn
// to a canvas and uploaded as a PNG (so an SVG, which would run its scripts
// if its address were opened, never reaches the bucket, and a GIF keeps its
// animation), the server is asked where to upload it, then the file goes
// there. onUploaded hears the address it can be shown from, or onFailed why
// it didn't make it.
export default function uploadChatImage(
  puzzleId: string,
  original: File,
  onUploaded: (url: string) => void,
  onFailed: (failure: ChatImageUploadFailure) => void,
) {
  if (isDirectlySupported(original)) {
    requestAndUpload(puzzleId, original, onUploaded, onFailed);
    return;
  }
  convertImageToPng(original)
    .then((file) => requestAndUpload(puzzleId, file, onUploaded, onFailed))
    .catch((error: unknown) => {
      onFailed({ stage: "convert", error });
    });
}

function requestAndUpload(
  puzzleId: string,
  file: File,
  onUploaded: (url: string) => void,
  onFailed: (failure: ChatImageUploadFailure) => void,
) {
  // The bucket would refuse it, and the no-cors POST below can't see a
  // refusal, so the image would be saved pointing at nothing.
  if (file.size > MAX_UPLOAD_BYTES) {
    onFailed({ stage: "tooBig" });
    return;
  }
  createChatImageUpload.call(
    { puzzleId, mimeType: file.type },
    (error, upload) => {
      if (error || !upload) {
        onFailed({ stage: "request", error });
        return;
      }
      const { publicUrl, uploadUrl, fields } = upload;
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value);
      }
      formData.append("file", file);
      fetch(uploadUrl, {
        method: "POST",
        mode: "no-cors",
        body: formData,
      })
        .then(() => onUploaded(publicUrl))
        .catch((uploadError: unknown) => {
          onFailed({ stage: "upload", error: uploadError });
        });
    },
  );
}
