---
files:
  - imports/server/gdrive.ts
  - imports/server/daemons/documentReplenisher.ts
  - imports/server/daemons/discord.ts
  - imports/server/mediasoup.ts
  - imports/server/mediasoup-api.ts
  - imports/server/api.ts
  - imports/server/api/authenticator.ts
  - imports/lib/models/ChatMessages.ts
  - docs/google-drive.md
  - docs/assets.md
updated: 2026-09-19
---

# 09. Integrations and subsystems

Everything here is optional at runtime. An instance with none of it configured still does
puzzles, tags, chat, guesses and presence. See
[02-getting-started.md](02-getting-started.md#4-what-works-without-third-party-credentials).

## 1. Chat

Not an integration, but the subsystem most likely to surprise you, so it goes first.

**A chat message's `content` is a node tree, not a string.** Jolly Roger uses
[Slate](https://docs.slatejs.org/) for the composer, and stores Slate's document model directly
in MongoDB. A message is roughly:

```ts
{
  type: "message",
  children: [
    { text: "hey " },
    { type: "mention", userId: "abc123" },
    { text: " look at this" },
  ],
}
```

Slate, in one paragraph: it is a rich-text editing framework where the document is a tree of
nodes, you render each node type yourself, and all edits go through a transform API rather than
`contentEditable` mutations. The node-type predicates live in `imports/lib/`:
`nodeIsText.ts`, `nodeIsMention.ts`, `nodeIsRoleMention.ts`, `nodeIsImage.ts`.

Consequences:

- **You cannot treat message content as text.** Rendering, searching and notification all walk
  the tree.
- Mentions are stored as **node references holding a user ID**, so a display-name change updates
  every historical message.
- Migration `50-upconvert-chatmessage-content.ts` converted the old plain-text messages into
  this format. Old data is why some defensive branches exist.
- A message with no `sender` is a **system message** (guess state changes, puzzle solved, and so
  on).

### Dingwords

A "dingword" is a user-configured alert keyword. If someone types it in any chat in the hunt,
you get a notification. Stored on the user document as `dingwords[]`; matching happens in
`imports/lib/dingwordLogic.ts`; the notification pipeline is
`imports/server/chat-notifications.ts`, which writes one `ChatNotifications` row per recipient.
Users can suppress individual words, which is why the notification records *which* words matched.

This is a hunt-scale feature: someone who sets a dingword of "the" will generate a lot of rows.
There is a `disable.dingwords` feature flag for exactly that emergency.

### Firehose

`/hunts/:huntId/firehose` shows every chat message in the hunt in one stream. It is used by
operators keeping an eye on the whole team. It can also be mirrored into a Discord channel.

## 2. Google Drive and Sheets

The flagship feature: every puzzle gets a Google Sheet, created automatically, shared
automatically, and organized into per-hunt folders. `docs/google-drive.md` is the detailed
reference; this is the orientation.

### The pieces

| Piece | What it does |
| --- | --- |
| `imports/server/gdrive.ts` | The Drive API wrapper: create, move, rename, set permissions |
| `imports/server/googleClientRefresher.ts` | Keeps OAuth credentials fresh |
| `imports/server/daemons/documentReplenisher.ts` | Pre-creates blank documents into a pool |
| `imports/server/gdriveActivityFetcher.ts` | Polls the Drive Activity API for "who edited what" |
| `private/google-script/` | A Google Apps Script deployed into the customer's Google account |
| `HuntFolders`, `FolderPermissions`, `CachedDocuments`, `Documents`, `DocumentActivities`, `DriveActivityLatests` | The collections |

### The document pool, and why it exists

Creating a Google Doc through the API takes a noticeable amount of time, sometimes seconds. When
an operator adds a puzzle mid-hunt, people are waiting.

So `documentReplenisher` runs in the background and keeps a pool of blank, pre-created documents
in `CachedDocuments` with `status: "available"`. Creating a puzzle **claims** one from the pool,
which is fast. The daemon tops the pool back up.

If the daemon is not running, puzzle creation still works, but falls back to creating a document
synchronously and feels slow.

### Permissions, and why `FolderPermissions` is a cache

Jolly Roger shares each hunt's folder with each user's Google account, so that their cursor in
the sheet shows their name rather than "Anonymous Animal". Granting a permission is an API call
with rate limits, and it is idempotent from the user's perspective but not free.

`FolderPermissions` is an **idempotency record**: "we have already granted this Google account
access to this folder". It is a cache of work done, not of Google's state, which means if
someone revokes access out of band, Jolly Roger will not notice.

### The Apps Script

`private/google-script/` holds a Google Apps Script that is deployed into the instance owner's
Google account from the setup page. It exists because some operations (notably certain
spreadsheet manipulations) are not available through the Drive REST API. This is unusual enough
to catch people out: part of this application runs inside Google's infrastructure, not yours.

### Credentials

An admin supplies these on the setup page, and they land in the `Settings` collection:
`gdrive.credential`, `gdrive.root`, `gdrive.template.document`, `gdrive.template.spreadsheet`,
`google.script`. There are several distinct Google clients doing different jobs (OAuth for
end-user account linking versus the service credential Jolly Roger uses to own documents), and
conflating them is the usual source of confusion. Read `docs/google-drive.md` before touching
this.

## 3. Discord

A bot plus an OAuth integration. Both optional; there is a `disable.discord` feature flag.

What it does:

- **Caches guild, channel and role data** into the `DiscordCache` collection so the setup UI can
  offer pickers without hitting Discord's API on every render. Note the collection name is
  `discord_cache`, with no `jr_` prefix, inconsistently with everything else.
- **Relays** puzzle creation, puzzle solves, announcements and optionally the whole chat
  firehose into configured channels. Which channel does what is configured per hunt:
  `puzzleCreationDiscordChannel`, `puzzleHooksDiscordChannel`, `announcementDiscordChannel`,
  `firehoseDiscordChannel`.
- **Grants a role** to hunt members who have linked their Discord account
  (`memberDiscordRole`), with `DiscordRoleGrants` as the idempotency record.
- **Links accounts** through Discord OAuth, storing `discordAccount` on the user document.

The daemon lives in `imports/server/daemons/discord.ts`. The outbound announcements are
implemented as hooks in `imports/server/hooks/DiscordHooks.ts`, which is a good file to read if
you want to understand the hook system generally.

## 4. WebRTC audio, via mediasoup

Per-puzzle audio chat. This is the most technically unusual subsystem in the repo, and the part
that most rewards reading before editing.

### WebRTC, briefly

To send audio between browsers you need to solve three problems: describing what codecs each
side supports (**SDP**), finding a network path between them through NATs and firewalls
(**ICE**, with **STUN** to discover your public address and **TURN** to relay when no direct
path exists), and encrypting the media (**DTLS-SRTP**). A **TURN server** is needed because on
many corporate and mobile networks there is simply no direct path; `$TURN_SERVER`,
`$TURN_SECRET` and friends configure it.

### Why an SFU

Three architectures for a group call:

- **Mesh**: everyone connects to everyone. Simple, but upload bandwidth grows with participant
  count. Dies at about five people.
- **MCU**: the server decodes everything, mixes it into one stream, re-encodes. Cheap for
  clients, very expensive in CPU for the server.
- **SFU (Selective Forwarding Unit)**: each client uploads once to the server; the server
  *forwards* streams without decoding. Cheap for the server, scales well.

Jolly Roger uses **mediasoup**, an SFU. A puzzle chat may have twenty people in it, so mesh is
not an option.

### mediasoup's object model

```
Worker            a separate C++ subprocess pinned to one core
 └── Router       one "room"; only endpoints in the same Router can exchange media
      ├── WebRtcTransport   one ICE+DTLS connection to one browser, in ONE direction
      │     ├── Producer    an inbound track  (browser -> server)
      │     └── Consumer    an outbound track (server -> browser)
      └── AudioLevelObserver   reports who is speaking
```

Two naming traps:

- **A transport is unidirectional.** Every browser needs two: `send` (its microphone to the
  server) and `recv` (the server to its speakers).
- **"Producer" and "Consumer" are named from the server's point of view.** A Producer produces
  media *into* the router.

### The unusual part: the object graph is mirrored into MongoDB

**Sixteen collections** under `imports/lib/models/mediasoup/` mirror every mediasoup object and
every *request* to create one: `Rooms`, `Routers`, `Peers`, `TransportRequests`, `Transports`,
`ConnectRequests`, `ConnectAcks`, `ProducerClients`, `ProducerServers`, `Consumers`,
`ConsumerAcks`, and a few more.

**Why mirror at all?** Three reasons, all load-bearing:

1. **Cross-process signalling with no extra infrastructure.** A deployment runs several Node
   processes. A user's WebSocket lands on an arbitrary one; the mediasoup worker for their call
   lives on exactly one. MongoDB plus the oplog is already a shared message bus, so the
   handshake rides on it. No Redis, no internal RPC mesh.
2. **Recovery.** If a process dies mid-handshake the records survive or get garbage-collected,
   and the surviving side converges.
3. **Free observability.** `/rtcdebug` is essentially "publish all sixteen collections to an
   admin and render them".

**The `createdServer` / `routedServer` convention, which you should read twice:**

- **`createdServer`** = the process that wrote this document.
- **`routedServer`** = the process that must *act on* this document.

For a client-originated request, `createdServer` is the front-end process holding the user's
WebSocket and `routedServer` is the SFU process that owns the router. For an SFU-written result
there is no `routedServer`, because the client just needs the data. The SFU sets up one live
query per "inbox", each filtered on its own server ID.

Throughout these collections, **a field named `call` holds a Puzzle `_id`**. There is no
separate call entity; the puzzle is the room.

### Subscriptions as RPC with cleanup

`mediasoup:join`, `mediasoup:transports` and `mediasoup:producer` are **publications with side
effects**. Subscribing creates server state; the publication's `this.onStop()` destroys it when
the client unsubscribes, navigates away, closes the tab or drops its connection.

This is the single most important local idiom in this subsystem, and it generalizes: it is also
how presence works (see below). If you see a publication that publishes nothing, its purpose is
the lifecycle hook, not the data.

### Debugging a broken call

`/rtcdebug` renders the raw state of all sixteen collections. Work outward: is there a `Room`?
Does it have a `routedServer` pointing at a live process in `Servers`? Is there a `Router`? Does
the peer have both `Transports`? Did `ConnectAcks` arrive? `TransportStates` mirrors ICE and
DTLS state and exists purely for this.

## 5. The HTTP API, uploads and assets

Meteor apps can also serve plain HTTP. Jolly Roger mounts an Express 5 application.

- **`/api`**: a small REST API for external integrations and the browser extension, with
  resources under `imports/server/api/resources/`. Authenticated by **API keys**
  (`imports/lib/models/APIKeys.ts`), which are bearer tokens a user issues for themselves, not
  by the DDP login session. This is a genuinely separate authentication path from everything
  else in the app.
- **Uploads take two entirely different routes.** Large user content (chat images and
  attachments) goes to **S3 via a presigned POST**, so the bytes never pass through the server.
  Branding assets go into the **`Blobs` collection in MongoDB**, content-addressed by SHA-256,
  with `BlobMappings` mapping a logical asset name to a hash. `docs/assets.md` covers the
  branding system.
- Small endpoints for the site manifest, `browserconfig.xml` and favicons round it out.

## 6. The browser extension

`extension/` is **a separate project**. It has its own `package.json`, its own `tsconfig.json`,
and a webpack build. It is not part of the Meteor build and is not installed by
`meteor npm install` at the repo root.

To work on it you install and build inside `extension/`, then load the unpacked build in your
browser. It is released by its own CI workflow, `.github/workflows/build-extension.yml`.

It talks to a Jolly Roger instance through the `/api` REST surface, authenticating with an API
key the user pastes into its options page. Read `extension/README.md` before starting.

## 7. Presence

Not a third-party integration, but it uses the same "subscription as a resource" idiom and is
easy to misread.

`imports/server/subscribers.ts` publishes **no data at all**. A client subscribes to
`subscribers.inc` with a context like `{ hunt, puzzle }`; the act of subscribing inserts a row
into `Subscribers`; `this.onStop()` deletes it. Other publications aggregate those rows into
the "N people are viewing this puzzle" counts and the avatar stacks.

Two complications the design has to handle:

- **Multiple server processes.** Each `Subscribers` row records which server wrote it, and the
  `Servers` collection holds a heartbeat per process. A process that stops heartbeating for 120
  seconds is presumed dead and its rows are garbage-collected, because its `onStop` handlers
  will never run.
- **Several overlapping presence notions.** `Subscribers` answers "who is looking at this
  page"; `UserStatuses` answers the coarser "is this person online, idle, or away, and what are
  they doing"; `CallActivities` answers "who was audible in the audio call". They are different
  collections with different lifetimes, and conflating them is a common mistake.
