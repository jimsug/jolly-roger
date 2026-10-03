// Guesses a puzzle's title from its URL, for prefilling the add/edit form:
// the last path segment, minus any file extension, with underscores (or,
// failing those, hyphens) as spaces and each word capitalised. Returns
// undefined when the URL doesn't parse or has no path to go on.
export default function guessTitleFromUrl(url: string): string | undefined {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }

  const lastSegment = pathname
    .split("/")
    .findLast((segment) => segment.length > 0);
  if (!lastSegment) {
    return undefined;
  }

  const withoutExtension = lastSegment.replace(/\.[a-z0-9]{1,5}$/i, "");
  const separator = withoutExtension.includes("_") ? "_" : "-";
  const title = withoutExtension
    .split(separator)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return title.length > 0 ? title : undefined;
}
