import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FancyEditorHandle } from "../components/FancyEditor";
import type { ChatImageUploadFailure } from "../uploadChatImage";
import { chatImageFailureReason } from "../uploadChatImage";
import useChatImagesEnabled from "./useChatImagesEnabled";
import useChatImageUpload from "./useChatImageUpload";

// Image uploads for a chat editor that shows its own note under it, as
// whiteboard comments and an in-place chat edit do. uploadImageFile goes to
// the editor's uploadImageFile; imageNote says why the last image didn't go
// in (or that the server has nowhere to put images) until it's cleared.
export default function useEditorImageUpload(
  puzzleId: string,
  editorRef: React.RefObject<FancyEditorHandle | null>,
) {
  const { t } = useTranslation();
  const imagesEnabled = useChatImagesEnabled();
  const [imageNote, setImageNote] = useState<string>();
  const imagesOff = t(
    "chat.images.off",
    "Images can't be added here: this server has nowhere to store them.",
  );
  const onUploadFailed = useCallback(
    (failure: ChatImageUploadFailure) => {
      const reason = chatImageFailureReason(failure, t);
      setImageNote(
        reason === undefined
          ? imagesOff
          : t("chat.images.failed", "Couldn't add the image: {{reason}}", {
              reason,
              // React escapes text, so i18next's escaping would only show
              // entities. Goes once both i18n inits stop escaping.
              interpolation: { escapeValue: false },
            }),
      );
    },
    [imagesOff, t],
  );
  const upload = useChatImageUpload(puzzleId, editorRef, onUploadFailed);
  const uploadImage = useCallback(
    (file: File) => {
      if (!imagesEnabled) {
        setImageNote(imagesOff);
        return;
      }
      setImageNote(undefined);
      upload(file);
    },
    [imagesEnabled, imagesOff, upload],
  );
  // The editor keeps the function it was made with, so it calls through this
  // for the current one.
  const uploadRef = useRef(uploadImage);
  useEffect(() => {
    uploadRef.current = uploadImage;
  }, [uploadImage]);
  const uploadImageFile = useCallback(
    (file: File) => uploadRef.current(file),
    [],
  );

  return { imageNote, setImageNote, uploadImageFile };
}
