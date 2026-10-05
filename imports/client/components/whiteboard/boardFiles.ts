import type { Rect } from "@xyflow/react";
import { getViewportForBounds } from "@xyflow/react";
import { toBlob } from "html-to-image";
import {
  EXPORT_PIXEL_RATIO,
  exportImageSize,
} from "../../../lib/whiteboard/exportFiles";
import exportWhiteboard from "../../../methods/exportWhiteboard";

// What fetchBoardJson throws when the board changed between two of the
// chunks it fetched, so they don't belong together.
export class BoardChangedError extends Error {
  constructor() {
    super("The board changed while it downloaded");
    this.name = "BoardChangedError";
  }
}

// The text of gzipped chunks joined in order.
export function gunzipChunks(chunks: Uint8Array[]) {
  const stream = new Blob(chunks.map((c) => new Uint8Array(c)))
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

// The board as it is now, as the server serialises a version: every node and
// line, ink and hidden ones included. The server compresses the board once,
// for the first chunk, and each later call names that export by its hash.
export async function fetchBoardJson(boardId: string) {
  const first = await exportWhiteboard.callPromise({ boardId, index: 0 });
  const chunks = [first.data];
  for (let index = 1; index < first.chunkCount; index++) {
    const next = await exportWhiteboard.callPromise({
      boardId,
      index,
      hash: first.hash,
    });
    if (next.hash !== first.hash) throw new BoardChangedError();
    chunks.push(next.data);
  }
  return gunzipChunks(chunks);
}

// A PNG of what's drawn inside bounds. The viewport is React Flow's, moved
// and scaled for the picture as React Flow's own export example does, so the
// board on screen doesn't move.
export async function boardPng(
  viewport: HTMLElement,
  bounds: Rect,
  background: string,
) {
  const { zoom, width, height } = exportImageSize(bounds);
  const { x, y } = getViewportForBounds(bounds, width, height, zoom, zoom, 0);
  const png = await toBlob(viewport, {
    backgroundColor: background,
    width,
    height,
    pixelRatio: EXPORT_PIXEL_RATIO,
    // The app's only web font points at the system's emoji font, which the
    // picture can use as it is.
    skipFonts: true,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
  });
  if (!png) throw new Error("The picture of the board came out empty");
  return png;
}

// Hands blob to the browser as a download called name.
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start reading the download after the click returns, so
  // the address is kept a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
