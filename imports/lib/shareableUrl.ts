// Query parameters that pick out the Google account a link was opened with:
// authuser chooses one of the browser's signed-in accounts, ouid names the
// owner's. Someone else's browser would pick the wrong account, or none.
const ACCOUNT_PARAMS = ["authuser", "ouid"];

// A link with the account-specific parameters taken out, for copying to
// someone else. Anything that doesn't parse as a URL comes back unchanged.
export default function shareableUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!ACCOUNT_PARAMS.some((param) => parsed.searchParams.has(param))) {
    return url;
  }
  for (const param of ACCOUNT_PARAMS) {
    parsed.searchParams.delete(param);
  }
  return parsed.toString();
}
