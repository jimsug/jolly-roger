const ALLOWED_SCHEMES = new Set(["http", "https", "mailto"]);

// Returns a cleaned-up href if it's safe to put behind a clickable link, or
// undefined if not. Allows http(s) and mailto URLs and same-site absolute
// paths; anything else (javascript:, data:, schemeless hosts) is refused.
export default function safeHref(href: string): string | undefined {
  // The URL parser drops tabs and newlines from anywhere and strips leading
  // and trailing control characters and spaces before it reads the scheme, so
  // "java\tscript:" is still javascript. Normalise the same way first.
  const stripped = href.replace(/[\t\n\r]/g, "");
  let start = 0;
  let end = stripped.length;
  while (start < end && stripped.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && stripped.charCodeAt(end - 1) <= 0x20) end -= 1;
  const url = stripped.slice(start, end);

  if (url.startsWith("/")) {
    // Browsers read both "//host" and "/\host" as another site.
    return /^\/[/\\]/.test(url) ? undefined : url;
  }

  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  return scheme && ALLOWED_SCHEMES.has(scheme) ? url : undefined;
}
