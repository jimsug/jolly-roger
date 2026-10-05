import { Random } from "meteor/random";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import type { FancyEditorHandle } from "../components/FancyEditor";
import type { ChatImageUploadFailure } from "../uploadChatImage";
import uploadChatImage from "../uploadChatImage";

// Uploads an image into a chat editor, as chat and whiteboard comments do: a
// placeholder goes in at once, the image is uploaded, and the placeholder
// becomes the image (or is marked as failed, with onFailed told why). Each
// caller shows the failure its own way.
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
      uploadChatImage(
        puzzleId,
        file,
        (url) => {
          editorRef.current?.replaceImage(url, tempId, "success");
        },
        (failure) => {
          editorRef.current?.replaceImage("", tempId, "error");
          onFailedRef.current(failure);
        },
      );
    },
    [puzzleId, editorRef],
  );
}
