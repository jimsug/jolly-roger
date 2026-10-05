import type { Meteor } from "meteor/meteor";
import createChatImageUpload from "../methods/createChatImageUpload";

// Why an image didn't make it: the server wouldn't hand out an upload (with
// no error at all when it has nowhere to put images), or the upload itself
// failed.
export type ChatImageUploadFailure =
  | { stage: "request"; error: Meteor.Error | undefined }
  | { stage: "upload"; error: unknown };

// The reason to show for a failed upload, or undefined when the server has
// nowhere to store images (which callers word their own way).
export function chatImageFailureReason(
  failure: ChatImageUploadFailure,
): string | undefined {
  if (failure.stage === "request") {
    return failure.error
      ? (failure.error.reason ?? failure.error.message)
      : undefined;
  }
  return failure.error instanceof Error
    ? failure.error.message
    : String(failure.error);
}

// Uploads an image as chat does: the server is asked where to upload it,
// then the file goes there. onUploaded hears the address it can be shown
// from, or onFailed why it didn't make it.
export default function uploadChatImage(
  puzzleId: string,
  file: File,
  onUploaded: (url: string) => void,
  onFailed: (failure: ChatImageUploadFailure) => void,
) {
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
