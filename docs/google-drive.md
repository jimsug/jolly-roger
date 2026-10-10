---
files:
  - imports/client/components/AccountFormHelpers.tsx
  - imports/client/components/GoogleLinkBlock.tsx
  - imports/client/components/HuntListPage.tsx
  - imports/client/components/InsertImage.tsx
  - imports/client/components/LinkAccountsNudge.tsx
  - imports/client/components/NotificationCenter.tsx
  - imports/client/GoogleScriptInfo.ts
  - imports/lib/imageUploads.ts
  - imports/lib/models/DocumentActivities.ts
  - imports/lib/models/FolderPermissions.ts
  - imports/lib/unlinkedServices.ts
  - imports/server/models/HuntFolders.ts
  - imports/methods/configureGoogleOAuthClient.ts
  - imports/methods/linkUserGoogleAccount.ts
  - imports/methods/unlinkUserGoogleAccount.ts
  - imports/server/accountForGoogleInvitation.ts
  - imports/server/accounts.ts
  - imports/server/addPuzzle.ts
  - imports/server/addUserToHunt.ts
  - imports/server/assertUploadableImageType.ts
  - imports/server/daemons/documentCache.ts
  - imports/server/documentCache.ts
  - imports/server/gdrive.ts
  - imports/server/gdriveActivityFetcher.ts
  - imports/server/getS3UploadParams.ts
  - imports/server/googleClientRefresher.ts
  - imports/server/googleScriptContent.ts
  - imports/server/hooks/DocumentCacheHooks.ts
  - imports/server/jobs/purgeHunt.ts
  - imports/server/jobs/purgeHuntDocumentCache.ts
  - imports/server/methods/configureCollectGoogleAccountIds.ts
  - imports/server/methods/configureEnsureGoogleScript.ts
  - imports/server/methods/configureGoogleOAuthClient.ts
  - imports/server/methods/configureGoogleScriptUrl.ts
  - imports/server/methods/configureGdriveCreds.ts
  - imports/server/methods/configureGdriveTemplates.ts
  - imports/server/methods/configureOrganizeGoogleDrive.ts
  - imports/server/methods/configureS3ImageBucket.ts
  - imports/server/methods/createDocumentImageUpload.ts
  - imports/server/methods/createHunt.ts
  - imports/server/methods/ensurePuzzleDocument.ts
  - imports/server/methods/insertDocumentImage.ts
  - imports/server/methods/linkUserGoogleAccount.ts
  - imports/server/methods/listDocumentSheets.ts
  - imports/server/methods/purgeHuntDocumentCache.ts
  - imports/server/methods/unlinkUserGoogleAccount.ts
  - imports/server/methods/updatePuzzle.ts
  - imports/server/models/CachedDocuments.ts
  - imports/server/models/DriveActivityLatests.ts
  - imports/server/setup.ts
  - private/google-script/cookie-test.html
  - private/google-script/main.js
updated: 2026-10-11T01:00:00Z
---

# Google Drive Integration

Google Drive is a core part of the collaboration model for Jolly Roger, and as
such we've built a fairly deep integration with the service over time. This
integration includes:

- Allowing users to link their Google accounts to their Jolly Roger accounts and
  log in using them
- Creating files (documents and spreadsheets) in Google Drive whose lifecycles
  are tied to the lifecycles of their associated puzzles
- Using Google Drive's permissioning model to prevent users from appearing as
  "Anonymous Animals" without letting them take destructive actions
- Polling for recent edit activity on files and storing that data to surface as
  an indicator of how "hot" a given puzzle is
- An out-of-band mechanism for adding images to a Google Spreadsheet, since the
  native UI does not work when Google Sheets is presented in an iframe

While they are all interconnected, we'll attempt to look at each separately.

## Google OAuth

While Jolly Roger does not use Meteor's native OAuth-based login (provided by
the `accounts-google` package), it does leverage Meteor's built-in support for
OAuth, including via Google. Users can link a Google account to their Jolly
Roger account, either by manually linking it on their profile page (the
`GoogleLinkBlock` React component and the `linkUserGoogleAccount` and
`unlinkUserGoogleAccount` Meteor methods) or by creating an account from an
invite link using our Jolly Roger-specific Google-based user authentication flow
(`useGoogleSignInCredentialsField` and the call to
`Accounts.registerLoginHandler` in `imports/server/accounts.ts`). Either way,
once an account is linked, that account can be used for subsequent logins.

When someone signs in with Google from an invite link and no account is linked
to that Google account yet, `accountForGoogleInvitation`
(`imports/server/accountForGoogleInvitation.ts`) looks for an account with the
Google profile's address. If Google has verified that address
(`verified_email` in the OAuth service data), it takes that account over,
linking the Google account and logging in to it, when the address is verified
there too, or when the account is an unclaimed placeholder: the one
`addUserToHunt` creates when an operator adds someone by email, which nobody
has ever signed in to and which has no password and no Google account. If that
account already has a different Google account linked, the sign-in is refused
with a message saying to sign in with that Google account, or to sign in
another way and link this one from the profile page, rather than replacing the
link. Claiming a placeholder this way also clears its enrolment and password
reset tokens, so the original invite link can't then set a password on it. An
account that has the address unverified and has been signed in to is
left alone, since anyone can add any address to their own account from the
profile page, and so is any account when Google hasn't verified the address.
In those cases the Google sign-in gets a new account instead, without the
address, which Meteor won't let two accounts share.

Until a hunter links Google, and Discord when the server has it set up, the
navbar shows a red count by their name and a dot by "My profile", and the
profile page asks them to link each one (`LinkAccountsNudge.tsx`). Drive
activity feeds presence and the document cache, so an unlinked Google account
leaves both incomplete.

Because we use Meteor's built-in OAuth support, OAuth application credentials
are stored in `ServiceConfiguration` (see the `configureGoogleOAuthClient`
Meteor method) instead of the `Settings` model, which we use for all other
configuration related to Google integrations. This is handled by the
`GoogleLinkBlock` React component and the `linkUserGoogleAccount` and
`unlinkUserGoogleAccount` Meteor methods.

In addition to the OAuth application (used for user authentication), Jolly Roger
requires a regular Google account, linked via the `configureGdriveCreds` Meteor
method. (We describe this as a "service user", but we do not utilize Google
Cloud's support for service accounts). Although the credentials are referred to
as being for "Drive", in practice they are used to authenticate all actions
taken directly by Jolly Roger (including interfacing with the Drive, Drive
Activity and Script APIs).

On the server side, `imports/server/googleClientRefresher.ts` is responsible for
monitoring changes to various Google-related settings and ensuring that we
always have a Google API client initiated with valid credentials for the service
account (assuming such credentials are available). It exports that client for
consumption by other code.

## File lifecycle

Jolly Roger interacts with the Google Drive API via `imports/server/gdrive.ts`,
which exports a number of wrapper functions providing higher level abstractions
for the rest of the app.

The `ensureHuntFolder` function in `imports/server/gdrive.ts` creates a
dedicated folder for each hunt, primarily to support our permission model (see
below), but also to keep the service user's Google Drive slightly organized. The
resulting folder IDs are tracked in the `HuntFolders` model, making
`ensureHuntFolder` idempotent without spamming the Google APIs and caching the
ID for subsequent use. The function is called before any operation that requires
the folder to be present, but the expectation is that it will only actually do
anything when it's called as part of hunt creation.

Similarly, the `ensureDocument` function creates either a spreadsheet or
document to go with a puzzle, tracked in the `Documents` collection (which,
unlike `HuntFolders`, is published to clients). `Documents` is shared with the
board provider (`provider: "board"`, see `docs/board-provider.md`), so every
Drive-side lookup selects `provider: "google"`: the activity fetcher, the
purge job, `destroyPuzzle`/`undestroyPuzzle`, `copySheets` and the Drive
reorganiser all leave board documents alone. If Jolly Roger is configured
with a template document or spreadsheet (`configureGdriveTemplates`), new
documents are created as copies of those templates rather than from whole cloth.
As with `ensureHuntFolder`, this is called before operations that requires the
doc but is primarily expected to take action when a new puzzle is created.
Files are named after their puzzle with a `↔️` prefix (`puzzleDocumentName`),
which keeps them recognisable in Drive's recents list; the same name is applied
when a puzzle is renamed.

Since the document is a core part of the Jolly Roger experience, clients can
also call `ensureDocument` via the `ensurePuzzleDocument` Meteor method, which
they call on loading a puzzle page. In order to prevent thundering herds of
creation attempts, when creating a new puzzle, the document is created *before*
saving the puzzle to MongoDB, so that once clients discover the new puzzle, the
document should already be present.

The hidden puzzle behind a hunt's whiteboard (`kind: "whiteboard"`) never gets a
document: it's created without one, the methods that would make one refuse it,
and the cache sweep doesn't count it as puzzle activity.

When creating spreadsheets, we also use the Google Sheets API to enable external
URL access from formulas by default. Without this, consent needs to be granted
for every sheet, and granting consent is impossible from an iframed document.
We don't expect puzzle sheets to contain sensitive information, and we only tend
to use such formulas for safe use cases like loading images from external URLs.

Both folders and documents are renamed when the hunt or puzzle (respectively) is
renamed.

### Document cache

Creating a file costs a few Drive round trips (the create or copy, the Sheets
property update and the permission grant), and that is what someone adding a
puzzle waits on. To take it off the critical path, each hunt keeps a stock of
cached documents, tracked in the server-only `CachedDocuments` model
(`jr_cached_documents`) and managed by `imports/server/documentCache.ts`.
Cached documents are created through the same `createDocument` as any other
document (so they get the template, the external URL setting and the sharing
permission) in the hunt's folder, named `[CACHED] SPREADSHEET - DO NOT DELETE`
and so on.

`ensureDocument` claims the oldest available cached document of the requested
type by deleting its cache row in one atomic operation, then renames the file to
the puzzle's title and attaches it to the puzzle. The rename doubles as a check
that the file still exists: if Drive reports it gone (someone deleted it
despite the name), the puzzle gets a freshly created file instead, since nothing
would repair a puzzle attached to a dead file later. Only when the document
cache has nothing of that type does it create a file on the spot. If the puzzle
then fails to save, `deleteUnusedDocument` takes the file back out of Drive. In
the same spirit, `createDocument` deletes a file whose follow-up calls (the
Sheets property update or the sharing permission) fail, so a misconfigured
install doesn't strand a shared file on every attempt.

The cache aims to hold 15 spreadsheets and 1 document per hunt, and a type is
topped up only once it has fallen more than 3 below its target (or is nearly
empty), so a trickle of puzzle creations doesn't cost a Drive round trip each.
Refills run when a puzzle is created or solved (`DocumentCacheHooks`), when a
hunt is created, and from a background sweep
(`imports/server/daemons/documentCache.ts`) at startup and every 13 minutes
thereafter (a prime, so the sweep doesn't keep lining up with other periodic
work). The sweep only tops up hunts with a puzzle created or changed in
the last 30 days: a hunt without any puzzles is either brand new (hunt creation
pre-fills it) or has been purged, and the sweep shouldn't undo a purge, while a
hunt that has gone quiet is over whether or not it has been archived. The
puzzle hooks still refill any hunt as soon as a puzzle is created or solved
there. A refill holds a per-hunt lock, renewed on a timer for as long as it
runs, so that multiple servers don't double up even when Drive is slow; it
pauses between creations to stay under Drive's rate limits, skips archived and
deleted hunts, and does nothing at all when the Drive client isn't configured
or the `disable.google` feature flag is set.

A failed creation ends that type's refill and starts a backoff for that hunt
and type (`documentCacheBackoffMs`): no refill, from the sweep or the hooks,
tries it again for one sweep interval, then twice that after the next failure,
doubling up to four hours. Failing to make the hunt's Drive folder counts as a
failed creation for every type that was due. The first failure is logged as an
error and the repeats as warnings, and the next successful creation clears the
backoff. The backoff lives in each server's memory, so a restart forgets it, and new puzzles
still get a file created on the spot while their hunt's cache is empty.

The `disable.gdrive_document_cache` circuit breaker switches off the document
cache alone: refills stop, and new puzzles get a file created on the spot
instead of claiming a cached document. Cached documents stay in place, ready
for when the cache is enabled again, and purging them still works.

Purging a hunt deletes its cached documents from Drive along with its
documents (and its boards from the board service, in between). The purge job does this as its last step, under the same per-hunt
lock, so a refill can't land between the files being deleted and the rows
being removed; with `disable.google` set the rows are removed and the files
left behind, as for the hunt's documents. Admins can also clear just the
document cache from the hunt list. The `purgeHuntDocumentCache` method checks
that Drive is available and queues the `hunt.purgeDocumentCache` job
(`imports/server/jobs/purgeHuntDocumentCache.ts`), which deletes the unclaimed
cached documents from Drive and removes the rows. While the hunt has had puzzle
activity in the last 30 days and isn't archived, the cache refills on the next
pass, so this is mostly for archived hunts. Archiving a hunt stops refills but
leaves whatever is already cached in place.

Changing or clearing the spreadsheet or document template on the Setup page
(`configureGdriveTemplates`) drops every hunt's unclaimed cached documents of
that type, since they were copied from the old template and new puzzles should
get the new one (`dropCachedDocumentsOfType`). The rows go under each hunt's
cache lock, so a refill already running on that server finishes first and its
copies go too; the server logs how many were dropped. The change also clears
that server's backoffs for the type, since a broken template is the likeliest
reason for them (other servers wait theirs out). The templates are saved
before anything is dropped, so a failed drop is logged and the save still
stands. The files are then deleted from Drive in
the background (left behind with `disable.google` set), and the caches refill
from the new template on the next sweep or puzzle. Saving the same templates
again drops nothing.

## File permissions

There are a few design goals that influenced how we manage permissions on Google
Drive resources:

- Allow users to edit files for hunts they are a part of, even if they have not
  linked a Google account.
- If possible, avoid users showing up as ["Anonymous
  Animals"][anonymous animals] and attribute their write activity to them.
- Prevent users from being able to delete or move files (accidentally or
  otherwise).
- Avoid various quotas and rate limits imposed by Google. This includes an
  overall rate limit on API calls (of around 3 per second) and an apparent
  "flood limit" on creating a high number of shares in a short time frame.

Our current system seems to largely accomplish these goals. We still
occasionally trigger rate limits when onboarding a large group of people
simultaneously, but we can generally still recover from this because of our
just-in-time verification and initialization logic.

To satisfy the first requirement, we grant the writer permission to "anyone" on
each file. (This is the equivalent of the "Anyone on the internet with the link
can edit" setting). This is the only permission we set on individual files and
the only place we grant any full writer permissions. When a puzzle is deleted,
we remove this permission to make the corresponding file read-only.

Since all files for a hunt live in a shared folder, we grant permissions on that
folder to any Google accounts linked to hunt members. Doing this once per folder
instead of once per puzzle avoids needing to call the create permissions API
once per puzzle per user, which would reliably result in rate limiting. Granting
_any_ permission on a folder is sufficient to prevent Anonymous Animals on files
in that folder. The "commenter" permission also results in edits being
attributed to that user in the Drive Activity API (instead of the file's owner),
while also preventing the user from being able to move or delete the files
themselves.

These permissions are granted by the `ensureHuntFolderPermission` function in
`imports/server/gdrive.ts`, which in turn is called when a user is added to a
new hunt (`addUserToHunt`), when they link a new Google account
(`linkUserGoogleAccount`), or when they open a puzzle page (`ensureDocument`).

Any time we successfully grant a user access to a hunt folder, we keep a flag
record in the `FolderPermissions` model. This allows us to make permissions
grants idempotent without needing additional API requests. This allows us to be
resilient both to transient issues and rate limiting from Google's APIs and
changes in state of the various circuit breaker feature flags covering the
Google Drive integration, while also being proactive about ensuring the correct
permissions are in place.

## Activity tracking

Edits on Google Drive files are a key indicator of solving activity on a puzzle,
so we collect activity data using the [Drive Activity API][]. The server runs a
loop in the background to periodically fetch activity data
(`imports/server/gdriveActivityFetcher.ts`).

The Drive Activity API lacks any way to request "records we haven't already
seen", so instead we filter based on timestamp. We store the most recent
timestamp we've observed in the `DriveActivityLatests` model (which only
contains a single record). Activity is tracked in the `DocumentActivities`
model, with a separate record per user so that we can deduplicate a single user
acting across Google Drive, voice calls, and Jolly Roger chat in the same time
bucket.

When an edit can be attributed to a Jolly Roger user, the fetcher also records
it as that user's most recent puzzle interaction in the `UserStatuses` model
(`imports/server/recordPuzzleStatus.ts`), which feeds the hunter list's "last
active on" button, the puzzle list's viewers column and the whiteboard's puzzle
cards. That happens once per activity bucket, when the `DocumentActivities`
record is first inserted: every poll re-reads the same trailing window, and
each status write is published to everyone with those lists or a board open. Edits more than a few minutes old (a backfill
after an outage) and edits that can't be matched to a user don't get a status
row.

As a note, we experimented with using Google Drive watches (both
[drive][changes.watch] and [individual file][files.watch]), but found them to be
significantly lacking in functionality by comparison. Google Drive only sends
watch push notifications every 3 minutes and on a delay, giving us significantly
less granularity than we'd like. They also don't include any information about
who edited a file. Additionally, accepting incoming webhook requests from Google
Drive made development significantly more challenging, as it required some sort
of internet-accessible proxy.

## Image uploads

Inserting an image into a Google Sheet doesn't work when the sheet is loaded via
an iframe (due to Google's security policies). Since uploading images is a very
common part of the solving workflow, Jolly Roger includes its own out-of-band
flow for uploading images into a spreadsheet.

Inserting images into a document is not exposed via any of Google's standard
REST APIs, but it is supported via the Google Apps Script Spreadsheet service,
specifically via the [insertImage method][]. Google Apps Script projects can be
granted access to all of a user's (in our case, the service user's) spreadsheets
and can service anonymous HTTP requests. This gives us enough rope to create our
own HTTP API which can insert images into a Google Sheet.

The code for that API is kept in `private/google-script/main.js` (Google Apps
Script projects run on a [sandboxed Javascript runtime][V8]), and is published
as a [web app][Apps Script web app], meaning that the `doPost` global function
is the entrypoint for incoming requests (and `doGet` serves the cookie detection
page described below). We use a JSON-RPC-style API, where all
requests are sent as a JSON-encoded `POST` request with top-level keys `secret`,
`method`, and `parameters`. The `secret` key is generated by the Jolly Roger
server and embedded into the Apps Script source code when the project is
created, and is used to authenticate Jolly Roger (since the Apps Script project
runs privileged and is otherwise internet-accessible). The code is written
extremely defensively, because uncaught exceptions in Apps Script result in very
unhelpful 500 errors.

Jolly Roger attempts to mostly manage the deployment of the Apps Script project,
both for simplicity for the user and because its usage of the API is pretty
tightly coupled to the current revision of the code. The
`configureEnsureGoogleScript` Meteor method creates the project if it doesn't
exist and updates it if it's out of date, storing the current status in
`Settings`. This method knows if the code is up to date based on a SHA256 of the
source code, calculated in `imports/server/googleScriptContent.ts`. However,
because the project needs to run authenticated as the Jolly Roger service user,
Jolly Roger itself can't fully deploy it as a web app. The setup page walks the
admin through doing this and getting the resulting endpoint URL, which is stored
using `configureGoogleScriptUrl`.

Because client code should only show the image upload flow if all of this
configuration is in place, the `googleScriptInfo` publication in
`imports/server/setup.ts` announces whether or not the script is fully
configured. (For admins, it also includes info about whether or not the script
is currently up to date, driving a reminder to update). Assuming it is
configured, the `InsertImage` React component drives inserting images on the
client side using the `listDocumentSheets` and `insertDocumentImage` Meteor
methods to front the API methods of our Google Apps Script project. Both
methods refuse anyone who isn't a member of the document's hunt. For an image
inserted by URL, `insertDocumentImage` checks its type with a `HEAD` request
only when the URL is an object in our own image bucket (as an upload's is);
any other address someone types in is passed to the script as it is, and the
server never requests it, so the method can't be used to reach addresses only
the server can.

Finally, even though the [insertImage method][] supports uploading image data
directly, it has extremely stringent size limits (2 MB and one million pixels)
which proved prohibitive. So we ultimately introduced the option of hosting
uploaded image files in S3. AWS credentials must be provided via the
environment (or some other ambient configuration, such as the EC2 instance
metadata service), and the bucket to use is configured by
`configureS3ImageBucket`. Assuming that's configured, the
`createDocumentImageUpload` Meteor method generates a pre-signed AWS URL that
can be used to upload images, which are then inserted by URL. Every upload
policy (`getS3UploadParams`, chat's included) takes a file of at most 10 MB
(`MAX_UPLOAD_BYTES`) and expires five minutes after it's handed out. The
upload is a `no-cors` POST, which can't see the bucket refuse a file, so
`InsertImage` (like chat's uploads) refuses one over 10 MB, as it would be
uploaded after any conversion, before posting it: the file field says "Images
can be at most 10 MB." The object's key keeps only letters, digits, `.`, `_`
and `-` from the uploaded file's name (anything else becomes `_`), so a name
can't change the policy or break the image's address. The `InsertImage`
client-side flow still has fallback logic to upload directly in the event that
S3 is not configured. Additionally, Google Apps Script only supports PNG,
JPEG, and GIF images; the `InsertImage` flow automatically converts other
browser-renderable image formats (such as WebP, AVIF, or SVG) to PNG via
`<canvas>` prior to upload. The bucket only takes those three types:
`createDocumentImageUpload` (and `createChatImageUpload`, for chat images)
refuses any other `mimeType` through `assertUploadableImageType`, so an SVG,
which would run any script in it if its bucket address were opened, never gets
an upload.

## Third-party cookie detection

Even when file permissions are correctly configured (see above), users can still
appear as "Anonymous Animals" in embedded Google Sheets if their browser blocks
or partitions third-party cookies. This affects both the in-spreadsheet editing
experience and the Drive Activity API data we use for activity tracking (see
above) — anonymous edits can't be attributed to a user, so they don't contribute
to per-user activity indicators. This can happen because of built-in browser
tracking protection (Firefox's Total Cookie Protection, Safari's Intelligent
Tracking Prevention) or because of privacy extensions like Privacy Badger that
strip `Cookie` and `Set-Cookie` headers from HTTP requests at the network level.

To detect this, Jolly Roger uses the existing Apps Script web app's `doGet`
handler to serve a small detection page
(`private/google-script/cookie-test.html`) in a hidden iframe. The `doGet`
handler uses `Session.getTemporaryActiveUserKey()` to determine if Google can
identify the accessing user from the HTTP request. While it's intended to be
effectively a hash of the account that rolls over after some period of time, for
our purposes we only care if it's empty or not. If it *is* empty, either the
user isn't logged into Google in this browser, or something is preventing
cookies from reaching Google's server (browser-level tracking protection, an
extension stripping HTTP headers, etc.). Either way, the user would appear
anonymous in the Sheets embed. This server-side approach catches all these
cases, unlike client-side checks (such as `hasStorageAccess()` or
`document.cookie`) which only see the JavaScript layer and miss extension-level
blocking.

The result of the test is embedded into a small HTML page. Importantly, this is
loaded in a hidden iframe rather than fetched via `fetch()` or loaded as a
script. This is intentional: the iframe creates a **navigation request** to the
Google domain, which is the same request type that the Google Sheets embed uses.
Navigation requests carry cookies differently from subresource requests —
they're subject to the same browser and extension cookie policies that affect
the Sheets embed, making the test an accurate proxy. A `fetch()` with
credentials would require CORS headers that we don't control, and a `fetch()`
without credentials wouldn't send cookies at all.

The result is posted back to the parent via `postMessage` with a message of type
`jr-cookie-check`.

We publish a set of URLs for the client to try in `googleScriptInfo`, and
`NotificationCenter` races those URLs against each other in hidden iframes. We
publish multiple due to some complexity in how Google Apps Script redirects
based on whether the user is in a multi-login session, a Google Workspace domain
session, etc. We don't care about which session they're in, just about whether
or not we can see the cookies. The result is cached in a module-level variable
so the check is not re-run during SPA navigations, but does re-run on full page
reload (so it picks up changes to tracking protection settings). If cookies are
blocked, a toast notification warns the user with browser-specific fix
instructions. On mobile-width screens (below `MinimumDesktopWidth` from
`PuzzlePage`), the check is skipped entirely because we show a link to the
Google Doc rather than embedding it in an iframe.

## Utility Meteor methods

Finally, there are two utility Meteor methods introduced to aid in various
migrations from older versions of our Google integration.

First, `configureOrganizeGoogleDrive` ensures that the `HuntFolders` and
`Documents` match the directory structure in Google Drive that we expect. This
was originally intended to help migrate from older versions of Jolly Roger,
which put all documents in the root of the service user's Drive, but can also
perform general cleanup (or migration, if the configured root folder changes).

And second, `configureCollectGoogleAccountIds` attempts to backfill the
`googleAccountId` property on `Users`. Originally, Jolly Roger only captured the
email address of the Google account. However, the "other contacts" returned by
the Google People API also often (though not quite always) includes users that
have used Jolly Roger (either because of the OAuth link or because they've been
granted access on docs and folders owned by the Jolly Roger service user). This
method takes advantage of this fact to try and fully populate the property.

[anonymous animals]: https://support.google.com/docs/answer/2494888?visit_id=1-636184745566842981-35709989&hl=en&rd=1
[Drive Activity API]: https://developers.google.com/drive/activity/v2
[changes.watch]: https://developers.google.com/drive/api/v2/reference/changes/watch
[files.watch]: https://developers.google.com/drive/api/reference/rest/v2/files/watch
[insertImage method]: https://developers.google.com/apps-script/reference/spreadsheet/sheet#insertimageblobsource,-column,-row
[V8]: https://developers.google.com/apps-script/guides/v8-runtime
[Apps script web app]: https://developers.google.com/apps-script/guides/web
