import { Random } from "meteor/random";
import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import WhiteboardNodes from "../../lib/models/WhiteboardNodes";
import { MAX_IMAGES_PER_BOARD } from "../../lib/whiteboard/limits";
import { isTyping, onTheBoard } from "../components/whiteboard/canvasChrome";
import { centeredRect, DUPLICATE_OFFSET } from "../components/whiteboard/tools";
import type { WhiteboardActions } from "../components/whiteboard/WhiteboardContext";
import uploadChatImage, { chatImageFailureReason } from "../uploadChatImage";
import type { ReportRefusal, ShowNotice } from "./useBoardNotices";
import useChatImagesEnabled from "./useChatImagesEnabled";

// The widest a new image is placed, in board units. Smaller ones go in at
// their own size in pixels.
const MAX_IMAGE_PLACE_WIDTH = 480;

// An image's size in pixels, or undefined if the browser can't show it.
function naturalSize(
  file: File,
): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (size: { width: number; height: number } | undefined) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    img.addEventListener("load", () =>
      done(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : undefined,
      ),
    );
    img.addEventListener("error", () => done(undefined));
    img.src = url;
  });
}

export const imageFiles = (files: FileList | null | undefined) =>
  [...(files ?? [])].filter((file) => file.type.startsWith("image/"));

// Whether copied HTML is nothing but images, as a browser's Copy Image gives,
// rather than text that brings a picture of itself along, as office apps do.
export function htmlIsOnlyImages(html: string): boolean {
  if (!html) return false;
  const { body } = new DOMParser().parseFromString(html, "text/html");
  return !!body.querySelector("img") && !body.textContent.trim();
}

// An image on its way up, where it will land on the board.
export interface ImageUpload {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The Image tool, and images dropped on the board: each is uploaded, then
// put on the board as a node once the upload is done.
export default function useImageTool({
  boardId,
  puzzleId,
  readOnly,
  paneCenter,
  placementFor,
  updateNodes,
  showNotice,
  reportRefusal,
}: {
  boardId: string;
  // The board's backing puzzle, which the images are uploaded for.
  puzzleId: string;
  readOnly: boolean;
  // The board point at the middle of the screen, where a picked file lands.
  paneCenter: () => XYPosition;
  // The frame (if any) a box lands in, and its position in that frame.
  placementFor: (
    id: string,
    rect: Rect,
    moving: Set<string>,
  ) => { parent: string | undefined; position: XYPosition };
  updateNodes: WhiteboardActions["updateNodes"];
  showNotice: ShowNotice;
  reportRefusal: ReportRefusal;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow();
  // Images go to the bucket chat images go to, uploaded for the board's
  // backing puzzle, and can't be added when the server has none.
  const imagesEnabled = useChatImagesEnabled();
  const imagesOff = t(
    "chat.images.off",
    "Images can't be added here: this server has nowhere to store them.",
  );
  // Images being uploaded, drawn where they'll land. They aren't saved: the
  // node is made once the upload is done.
  const [uploads, setUploads] = useState<ImageUpload[]>([]);
  // How many images are on their way up, which count towards the board's cap
  // from the moment they're chosen.
  const imagesUnderway = useRef(0);

  // Uploads image files and puts each on the board centred on a point (the
  // next a little down and to the right), at its size in pixels but no wider
  // than MAX_IMAGE_PLACE_WIDTH, into the frame under its middle. Files that
  // would take the board past its cap on images aren't uploaded.
  const addImages = useCallback(
    (files: File[], centre: XYPosition) => {
      if (readOnly || files.length === 0) return;
      if (!imagesEnabled) {
        showNotice(imagesOff);
        return;
      }
      const room =
        MAX_IMAGES_PER_BOARD -
        WhiteboardNodes.find({ board: boardId, type: "image" }).count() -
        imagesUnderway.current;
      if (files.length > room) {
        reportRefusal(
          t("whiteboard.image.full", "This board can't take any more images"),
        );
      }
      const taken = files.slice(0, Math.max(0, room));
      imagesUnderway.current += taken.length;
      taken.forEach((file, i) => {
        const at = {
          x: centre.x + i * DUPLICATE_OFFSET.x,
          y: centre.y + i * DUPLICATE_OFFSET.y,
        };
        const id = Random.id();
        let settled = false;
        const finished = () => {
          if (settled) return;
          settled = true;
          imagesUnderway.current -= 1;
          setUploads((current) => current.filter((u) => u.id !== id));
        };
        naturalSize(file)
          .then((natural) => {
            if (!natural) {
              finished();
              reportRefusal(
                t(
                  "whiteboard.image.unreadable",
                  "That file isn't an image the board can show",
                ),
              );
              return;
            }
            const scale = Math.min(1, MAX_IMAGE_PLACE_WIDTH / natural.width);
            const width = Math.max(1, Math.round(natural.width * scale));
            const height = Math.max(1, Math.round(natural.height * scale));
            const rect = centeredRect(at, { width, height });
            setUploads((current) => [...current, { id, ...rect }]);
            uploadChatImage(
              puzzleId,
              file,
              (url) => {
                finished();
                const { parent, position } = placementFor(id, rect, new Set());
                updateNodes([
                  {
                    _id: id,
                    type: "image",
                    position: {
                      x: Math.round(position.x),
                      y: Math.round(position.y),
                    },
                    width,
                    height,
                    parent: parent ?? null,
                    image: { url, ...natural },
                  },
                ]);
              },
              (failure) => {
                finished();
                const reason = chatImageFailureReason(failure, t);
                if (reason === undefined) {
                  showNotice(imagesOff);
                } else {
                  reportRefusal(reason);
                }
              },
            );
          })
          .catch((error: unknown) => {
            finished();
            reportRefusal(
              error instanceof Error ? error.message : String(error),
            );
          });
      });
    },
    [
      readOnly,
      imagesEnabled,
      imagesOff,
      showNotice,
      reportRefusal,
      t,
      boardId,
      puzzleId,
      placementFor,
      updateNodes,
    ],
  );

  // The Image tool picks files to put in the middle of the view.
  const imageInput = useRef<HTMLInputElement>(null);
  const chooseImage = useCallback(() => imageInput.current?.click(), []);
  const onImageChosen = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = imageFiles(event.target.files);
      event.target.value = "";
      addImages(files, paneCenter());
    },
    [addImages, paneCenter],
  );

  // Image files dropped on the board land where they're dropped. A drop into
  // something being typed in is left to it (the comment composer takes
  // images of its own), and one on a panel over the board adds nothing. Any
  // other file dropped here is kept from the browser, which would otherwise
  // leave the page to show it.
  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (
        event.defaultPrevented ||
        !event.dataTransfer.types.includes("Files") ||
        isTyping(event.target)
      ) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect =
        !readOnly && onTheBoard(event.target) ? "copy" : "none";
    },
    [readOnly],
  );
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (
        event.defaultPrevented ||
        !event.dataTransfer.types.includes("Files")
      ) {
        return;
      }
      event.preventDefault();
      if (isTyping(event.target) || !onTheBoard(event.target)) return;
      addImages(
        imageFiles(event.dataTransfer.files),
        flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [addImages, flow],
  );

  return {
    imagesEnabled,
    // Why images can't be added, when they can't.
    imagesOff,
    uploads,
    addImages,
    imageInput,
    chooseImage,
    onImageChosen,
    onDragOver,
    onDrop,
  };
}
