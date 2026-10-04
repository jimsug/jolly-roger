// Error and tracing reports (Sentry) quote the URLs people open and request,
// and some of those URLs carry secrets. The client and server SDKs pass every
// event through scrubTelemetry before sending it.

const SECRET_URL_PATTERNS: readonly (readonly [RegExp, string])[] = [
  // Account emails and hunt invitations put their token in the path
  [/\/(enroll|join|reset-password|verify-email)\/[^/?#\s]+/g, "/$1/[Filtered]"],
  // A puzzle document's id lets whoever holds it edit the document (Drive
  // shares them with anyone who has the link) and, through the note API, the
  // puzzle's notes
  [/(\/api\/updatePuzzleNote\/[^/?#\s]+)\/[^/?#\s]+/g, "$1/[Filtered]"],
  [/\/(d|files|spreadsheets)\/[\w-]{25,}/g, "/$1/[Filtered]"],
  // The page someone has open, as sent by the browser extension and the
  // bookmarklet
  [/(^|[?&])url=[^&#\s]*/g, "$1url=[Filtered]"],
  // A SockJS session id is enough to send DDP messages down that session
  [/(\/sockjs\/[^/?#\s]+)\/[^/?#\s]+/g, "$1/[Filtered]"],
];

// Dropped wherever they appear, ignoring case. The Node SDK records the
// visitor's address on every request span (http.client_ip from
// X-Forwarded-For, net.peer.ip from the socket) whatever sendDefaultPii says,
// and request headers carry API keys and cookies.
const DROPPED_KEYS: ReadonlySet<string> = new Set([
  "http.client_ip",
  "net.peer.ip",
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookies",
  "set-cookie",
]);

// A DDP message as JSON, quoted again inside a SockJS frame or not. Logins
// carry resume tokens and password digests, and any method call or
// publication can carry secrets.
const DDP_MESSAGE_JSON = /\\*"msg\\*"\s*:/;

export function scrubSecretUrls(text: string): string {
  let scrubbed = text;
  for (const [pattern, replacement] of SECRET_URL_PATTERNS) {
    scrubbed = scrubbed.replaceAll(pattern, replacement);
  }
  return scrubbed;
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isPlainObject(value)
  );
}

// Whether a value holds a DDP message, as an object (the console breadcrumb
// of a logged message keeps its arguments) or as JSON.
function carriesDdpMessage(value: unknown, seen: WeakSet<object>): boolean {
  if (typeof value === "string") {
    return DDP_MESSAGE_JSON.test(value);
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (typeof (value as { msg?: unknown }).msg === "string") {
    return true;
  }
  return Object.values(value).some((item) => carriesDdpMessage(item, seen));
}

function scrub(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return scrubSecretUrls(value);
  }
  // Class instances (the SDK's scopes, dates, errors) pass through as they are
  if (
    typeof value !== "object" ||
    value === null ||
    !(Array.isArray(value) || isPlainObject(value))
  ) {
    return value;
  }
  if (ancestors.has(value)) {
    return "[Circular]";
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item: unknown) => scrub(item, ancestors));
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !DROPPED_KEYS.has(key.toLowerCase()))
        .map(([key, item]) => [key, scrub(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

// Returns a copy of the payload with secrets in URLs filtered out, client
// addresses, credentials and request bodies dropped, and breadcrumbs that
// quote DDP messages left out. The payload itself is left unchanged.
export function scrubTelemetry<T>(payload: T): T {
  const scrubbed = scrub(payload, new WeakSet());
  // scrub copies plain objects, so these only change the copy
  if (isRecord(scrubbed)) {
    // A request body can be anything a page sent, DDP messages over SockJS's
    // polling fallback included
    if (isRecord(scrubbed.request)) {
      delete scrubbed.request.data;
    }
    if (Array.isArray(scrubbed.breadcrumbs)) {
      scrubbed.breadcrumbs = scrubbed.breadcrumbs.filter(
        (breadcrumb: unknown) => !carriesDdpMessage(breadcrumb, new WeakSet()),
      );
    }
  }
  return scrubbed as T;
}
