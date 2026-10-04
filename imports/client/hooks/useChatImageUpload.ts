import type { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import createChatImageUpload from "../../methods/createChatImageUpload";
import type { FancyEditorHandle } from "../components/FancyEditor";

// Why an image didn't make it: the server wouldn't hand out an upload (with
// no error at all when it has nowhere to put images), or the upload itself
// failed.
export type ChatImageUploadFailure =
  | { stage: "request"; error: Meteor.Error | undefined }
  | { stage: "upload"; error: unknown };

// Uploads an image into a chat editor, as chat and whiteboard comments do: a
// placeholder goes in at once, the server is asked where to upload it, the
// file goes there, and the placeholder becomes the image (or is marked as
// failed, with onFailed told why). Each caller shows the failure its own way.
export default function useChatImageUpload(
  puzzleId: string,
  editorRef: React.RefObject<FancyEditorHandle | null>,
  onFailed: (failure: ChatImageUploadFailure) => void,
) {
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  return useCallback(
    (file: File) => {
      const tempId = Random.id();
      editorRef.current?.insertImage("", tempId, "loading");
      const failed = (failure: ChatImageUploadFailure) => {
        editorRef.current?.replaceImage("", tempId, "error");
        onFailedRef.current(failure);
      };

      createChatImageUpload.call(
        { puzzleId, mimeType: file.type },
        (error, upload) => {
          if (error || !upload) {
            failed({ stage: "request", error });
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
            .then(() => {
              editorRef.current?.replaceImage(publicUrl, tempId, "success");
            })
            .catch((uploadError: unknown) => {
              failed({ stage: "upload", error: uploadError });
            });
        },
      );
    },
    [puzzleId, editorRef],
  );
}
