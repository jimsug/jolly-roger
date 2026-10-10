---
files:
  - imports/client/components/BoardPage.tsx
  - imports/client/components/DocumentDisplay.tsx
  - imports/client/components/HuntNav.tsx
  - imports/lib/models/Documents.ts
  - imports/lib/models/FeatureFlags.ts
  - imports/lib/models/Settings.ts
  - imports/lib/models/User.ts
  - imports/lib/publications/boardForHunt.ts
  - imports/methods/boardToken.ts
  - imports/methods/configureBoardService.ts
  - imports/methods/configureClearBoardService.ts
  - imports/methods/deleteBoard.ts
  - imports/methods/ensureBoard.ts
  - imports/methods/rotateBoardServiceCredentials.ts
  - imports/server/board.ts
  - imports/server/boardServiceAccount.ts
  - imports/server/jobs/purgeHunt.ts
  - imports/server/methods/boardToken.ts
  - imports/server/methods/configureBoardService.ts
  - imports/server/methods/configureClearBoardService.ts
  - imports/server/methods/createHunt.ts
  - imports/server/methods/deleteBoard.ts
  - imports/server/methods/ensureBoard.ts
  - imports/server/methods/rotateBoardServiceCredentials.ts
  - imports/server/publications/boardForHunt.ts
  - imports/server/publications/settingsAll.ts
  - imports/server/publications/settingsByName.ts
  - imports/server/users.ts
updated: 2026-10-11
---

# The board as a document provider

Jolly Roger embeds Google documents: it asks Drive to create a file, keeps
the file's id, and puts Google's editor in an iframe. The hunt board works
the same way with a second provider. A separate service (hunt-board) holds
the boards; Jolly Roger asks it for one, keeps the board's id and page URL,
embeds the page, and signs short-lived tokens so the service knows who is
looking. Nothing on the board (nodes, lines, versions, comments) is known to
Jolly Roger, and the service writes nothing back. This page covers the Jolly
Roger side. The in-app whiteboard (`docs/whiteboard.md`) is separate and
unchanged; the board provider is meant to replace it.

Everything here sits behind the `disable.board` feature flag, and nothing
happens until the service is configured.

## The pieces

**Documents.** `imports/lib/models/Documents.ts` has a second member of the
`provider` union, `{ provider: "board", value: { id, url } }`, and `puzzle`
is optional so a document can belong to the hunt as a whole. Every
Drive-side lookup selects `provider: "google"` and leaves boards alone. A
hunt has at most one hunt board and may have a board per puzzle (the method
takes a `puzzleId`; nothing in the UI creates puzzle boards yet).

**Settings.** `board.service` holds `{ url, secret, serviceUserId }`:
where the service is, the secret shared with it, and the id of the Jolly
Roger account the service logs in as. The settings publications project
`value.secret` out, so the secret never reaches a browser; the Setup page
form keeps it write-only (leave the field blank to keep the saved one).
`serviceUserId` isn't typed in: `Setup.methods.configureBoardService` fills
it the first time the setting is saved.

**The service account** (`imports/server/boardServiceAccount.ts`). Saving
the setting without a `serviceUserId` creates an ordinary user for the
service: `board-service+<random>@<this site's host>` (a reserved
`jolly-roger.invalid` domain when the host isn't a domain name), a random
32-character password, display name "Board service", no roles, and
`serviceAccount: true` on the user document. The method returns the address
and password once; Jolly Roger keeps only the password hash, as for anyone
else, and never publishes either. Re-saving keeps the account (it's only
made again if the user is gone). `Setup.methods.rotateBoardServiceCredentials`
sets a new password, logs the old sessions out, and returns the login once
more. The `huntProfiles` and `allProfiles` publications leave
`serviceAccount` users out, so the hunter lists, their counts and @-mention
completion never show it.

**Methods**, all in `imports/server/board.ts` behind thin method files:

- `Hunts.methods.ensureBoard({ huntId, puzzleId? })`: operators and admins
  (`userMayWritePuzzlesForHunt`), not on an archived hunt. Calls
  `POST <url>/boards` with `Authorization: Bearer <secret>` and
  `{ scope: { hunt, puzzle? } }`, and stores the answer's `{ id, url }` as
  the scope's board document. Idempotent: an existing document is returned
  without a call, under a per-scope lock, and the service hands back the
  same board for the same scope anyway. Returns the document id.
- `Hunts.methods.boardToken({ huntId, puzzleId? })`: members only, admins
  included. Signs the viewer's claims (below) with the shared secret.
- `Hunts.methods.deleteBoard({ huntId, puzzleId? })`: the same gate as
  create. Calls `DELETE <url>/boards/:id` (a 404 counts as gone) and removes
  the document.

**The page.** `/hunts/:huntId/board` (`BoardPage`, lazy) renders the hunt
board through `DocumentDisplay`, whose `board` case puts the board's page in
the same iframe the Google embed uses (with its iOS sizing workaround). The
nav shows "Board" to members once a board exists, and to operators as soon
as a service is configured, so they can create one. Operators also get a
"Remove board" button above the frame. `boardForHunt` publishes the hunt's
board documents to members along with the fact that a service is set up
(name and URL only).

## The token

`boardToken` mints, for the calling user:

```
{ v: 1, scope: { hunt, puzzle? }, user, name, mayEdit, operator, assignedOperator, exp }
```

`name` is the display name, falling back to the primary email and then the
id. `mayEdit` is true for a member of a hunt that isn't archived (the
service applies its own edit policy on top and can only narrow it).
`operator` is `userMayWritePuzzlesForHunt`: assigned operators, operators by
the hunt's default roles, and admins, the same notion the whiteboard's
"operators only" policy uses. `assignedOperator` is
`userMayMakeOperatorForHunt`: assigned operators and admins only, which is
who may change the edit policy and lock the layout, as the fork's whiteboard
gated them. `exp` is five minutes out, in milliseconds.
The token is `base64url(JSON claims) + "." + base64url(HMAC-SHA256(that,
secret))`, which is exactly what the service's `server/token.ts` verifies;
the service also refuses an `exp` more than five minutes ahead.

The iframe opens at `<value.url>?token=<token>`. Links into the board page
can carry `?comment=`, `?puzzle=`, `?node=` and `?v=`, and `DocumentDisplay`
passes those four through to the iframe URL untouched. A minute before the
token runs out the board asks the page framing it for a fresh one with
`postMessage({ t: "token" })`. `DocumentDisplay` answers only messages whose
origin is the board URL's origin, mints a new token, and replies
`{ t: "token", token }` to the asking window at that origin. The iframe's
`src` isn't changed on renewal, so the board never reloads.

## The service's membership

A hunt board shows the hunt's puzzles and tags, which the service reads
over DDP as its own account, subscribing to the ordinary member
publications. Those publications check membership when the subscription
starts and never re-run, so a subscription made while the account isn't a
member of the hunt stays empty for good. Rather than join per board, the
account is a member of every hunt: saving the setting (and rotating the
credentials) adds it to every hunt that isn't deleted, and
`Hunts.methods.createHunt` adds it to each new hunt while the setting
exists. Membership is the bare `$addToSet: { hunts }`: no role, no
invitation email, no mailing list, no Discord role (not `addUserToHunt`).
Creating and deleting boards leave membership alone; purging a hunt deletes
its boards on the service (or just drops the rows when there's no service
to ask) and, like any other member, the account keeps the purged hunt's id
in `hunts`, since purging doesn't edit users. The account is never an
operator or an admin.

## Configuration

In Jolly Roger:

1. On the Setup page, under "Board service", enter the service's URL and
   the shared secret (32 characters or more), and save. The section's
   toggle is the `disable.board` flag.
2. The save creates the service account and shows its address and password
   once, with copy buttons. Put them in the service's `JR_SERVICE_EMAIL` and
   `JR_SERVICE_PASSWORD`. If the password is lost, "Rotate credentials"
   makes a new one and shows the login again; the old one stops working.

In the service's environment (see hunt-board's README for the full list):

- `PUBLIC_URL`: the origin the service is reachable at. Board URLs that
  `POST /boards` answers, and so the iframe's origin, come from this.
- `JR_URL`: Jolly Roger's origin, the only one allowed to frame the board
  page (`frame-ancestors`), and the origin the token-renewal message is sent
  to.
- `JR_SHARED_SECRET`: the same secret as the setting.
- `JR_SERVICE_EMAIL` and `JR_SERVICE_PASSWORD` (or a resume token): the
  service account's login, so the service can subscribe to the hunts it has
  boards for.
- `MONGO_URL` and `PORT` for the service's own storage and listener.

The setting's URL is what Jolly Roger's server calls; it can be an internal
address. The board URL the service answers with is what browsers load, so
it must be the public one.

## Security notes

- The shared secret is the bearer secret on the service's API and the key
  the tokens are signed with. It's stored in `Settings`, written by admins
  only (`userMayConfigureBoard`), projected out of every settings
  publication, and never shown in the UI.
- A token names one scope, one user and a five-minute expiry; a leaked one
  is one viewer's access to one board for five minutes. Token minting is
  gated on hunt membership; board creation and deletion on
  `userMayWritePuzzlesForHunt`.
- The renewal listener checks `event.origin` against the board URL's origin
  and posts the reply with that origin as the target, so a token can't be
  coaxed out by, or delivered to, any other frame.
- The service account is a member of every hunt, never an operator or
  admin, and its login is shown to an admin once and never stored readably.
  The blast radius of a compromised service, or a leaked login, is
  everything a member of every hunt can read: every hunt's puzzles, tags,
  guesses and chat, archived hunts included. It can write what a member
  can: guesses, chat, bookmarks. Rotate the credentials from the Setup page
  if the login leaks, or disconnect the service to stop the tokens.
- Answers from the service are checked before use: `id` must be a
  non-empty string and `url` an http(s) URL, and the `Documents` schema
  enforces the same.

## Tests

`tests/unit/imports/server/board.ts` drives `ensureBoard`, `deleteBoard`,
`boardToken` and the purge against a local stub of the service that
records every request (and the service account's hunts at the time of
each, which nothing there changes), and verifies tokens with a copy of the
service's verify logic. `tests/unit/imports/server/boardDocuments.ts`
covers the schema; `configureBoardService.ts` covers the setting, the
account (made once, flagged, no roles, password handed back once and
rotated, kept off the profile publications) and membership (every live
hunt on save and rotation, each new hunt on creation). `tests/unit/imports/client/DocumentDisplay.tsx`
covers the iframe URL, the passthrough parameters and the renewal message
(answered at the board's origin, ignored from any other).
`tests/acceptance/board.tsx` stands up the stub inside the test server and
drives the page and nav from the browser, with the flag on and off.
