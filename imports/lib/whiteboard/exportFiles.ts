// A downloaded picture is drawn at twice its size on the board, so it stays
// sharp on a high-density screen, unless that would make its longer side
// more than MAX_EXPORT_PIXELS; then it's scaled down to fit.
export const EXPORT_PIXEL_RATIO = 2;
export const MAX_EXPORT_PIXELS = 8192;
// Board units of background round what's drawn.
export const EXPORT_PADDING = 40;

// The picture of a board whose drawn nodes cover bounds: the zoom it's drawn
// at, and its size in CSS pixels (EXPORT_PIXEL_RATIO device pixels each).
export function exportImageSize(bounds: { width: number; height: number }) {
  const width = bounds.width + 2 * EXPORT_PADDING;
  const height = bounds.height + 2 * EXPORT_PADDING;
  const zoom = Math.min(
    1,
    MAX_EXPORT_PIXELS / (EXPORT_PIXEL_RATIO * Math.max(width, height)),
  );
  // Rounded rather than floored, so the long side of a scaled-down picture
  // isn't a pixel short, and kept within the cap.
  const fit = (length: number) =>
    Math.max(
      1,
      Math.min(
        MAX_EXPORT_PIXELS / EXPORT_PIXEL_RATIO,
        Math.round(length * zoom),
      ),
    );
  return { zoom, width: fit(width), height: fit(height) };
}

// "<hunt>-whiteboard-<yyyy-mm-dd>.<extension>", by the local date, with
// anything a file name can't hold in the hunt's name replaced by a hyphen. A
// name with nothing else left is "hunt".
export function exportFileName(
  huntName: string | undefined,
  date: Date,
  extension: string,
) {
  const cleaned = (huntName ?? "")
    // oxlint-disable-next-line no-control-regex
    .replaceAll(/[\u0000-\u001F\u007F/\\?%*:|"<>]+/g, "-")
    .trim();
  const hunt = /[^\s-]/.test(cleaned) ? cleaned : "hunt";
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${hunt}-whiteboard-${day}.${extension}`;
}
