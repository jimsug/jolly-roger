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
];

// The Node SDK records the visitor's address (from X-Forwarded-For) on every
// request span, whatever sendDefaultPii says
const DROPPED_KEYS: ReadonlySet<string> = new Set(["http.client_ip"]);

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
        .filter(([key]) => !DROPPED_KEYS.has(key))
        .map(([key, item]) => [key, scrub(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

// Returns a copy of the payload with secrets in URLs filtered out and client
// addresses dropped. The payload itself is left unchanged.
export function scrubTelemetry<T>(payload: T): T {
  return scrub(payload, new WeakSet()) as T;
}
