---
files:
  - imports/lib/models/Puzzles.ts
  - imports/lib/models/Guesses.ts
  - imports/lib/puzzle-sort-and-group.ts
  - imports/lib/models/Model.ts
  - imports/methods/TypedMethod.ts
updated: 2026-09-19
---

# Glossary

Everything in one place. Domain terms first, then technical.

## Puzzlehunt vocabulary

| Term | Meaning |
| --- | --- |
| **Administrivia** | Non-puzzle items a team tracks alongside puzzles ("order food", "HQ phone number"). A reserved tag; pinned to the top of the list. |
| **Answer** | A puzzle's solution: a short string, conventionally uppercase. Jolly Roger uppercases every answer and guess on write. |
| **Backsolving** | Deducing a feeder's answer from the meta's mechanism, without solving the feeder. Recorded per guess as a negative `direction`. |
| **Calling it in** | Submitting an answer to the hunt organizers. Historically by telephone, hence "callback". |
| **Feeder** | An ordinary puzzle whose answer feeds into a meta. |
| **Forward-solving** | Solving a feeder normally and using its answer in the meta. Positive `direction`. |
| **The grid** | Hunters' term for the table of round × puzzle × answer. In Jolly Roger, the grouped puzzle list. |
| **HQ** | The **external** team running the hunt. Not a Jolly Roger role. |
| **Hunt** | One running of a puzzlehunt. The tenancy root of the data model. |
| **Meta / metapuzzle** | A puzzle whose inputs are the answers to other puzzles. |
| **Metameta** | A meta whose feeders are themselves metas. |
| **MIT Mystery Hunt** | The canonical puzzlehunt, run over a weekend each January. Jolly Roger was built for it. |
| **Operator** | A **per-hunt role inside your team** with permission to create puzzles, action guesses and unlock puzzles. Labelled "Deputy" in parts of the UI. Not HQ. |
| **Round** | The organizers' grouping of puzzles. **Deliberately not modeled**; expressed with `group:` tags. |
| **Runaround** | The final physical activity that typically ends a hunt. Convention-only tag. |
| **Unlock** | The organizers releasing a new puzzle to your team. Jolly Roger treats `puzzle.createdAt` as the unlock time. **Not** the same as the "unlockable puzzles" feature. |

## Jolly Roger concepts

| Term | Meaning |
| --- | --- |
| **Barrel file** | A hand-maintained index (`methods/index.ts`, `publications/index.ts`, `migrations/all.ts`, `daemons/index.ts`) that imports every file in its directory. Forget to add yours and it silently does not exist. |
| **Dingword** | A user-configured alert keyword. Saying it in any chat notifies that user. |
| **Facade** | `imports/lib/models/facade.ts`, which imports every model. Forces construction (and therefore schema and index registration), and doubles as the browser-console debugging handle `window.Models`. |
| **Firehose** | A page showing every chat message in a hunt in one stream. Can be mirrored to Discord. |
| **Functional tag / content tag** | The add-puzzle form's split, based purely on whether the tag name contains a colon. |
| **Group** | A set of puzzles sharing a `group:<x>` tag. Nesting between groups is **inferred from set containment**, not declared. |
| **Interestingness** | The numeric score that sorts groups and puzzles. Lower sorts higher. |
| **Pseudo-collection** | A client-side `Mongo.Collection` with no server-side counterpart, filled by `this.added()` from inside a publication. |
| **Reserved tag** | A tag name the code branches on: `group:`, `meta-for:`, `is:meta`, `is:metameta`, `administrivia`, `needs:`, `priority:low`, `where:campus`. |
| **Solvedness** | Computed state of a puzzle: `noAnswers`, `solved`, or `unsolved`. Derived from `expectedAnswerCount`, `answers[]` and `markedComplete`. |
| **Subscriber** | A row in the `Subscribers` collection representing one live subscription, used for "who is viewing this puzzle". |
| **Wire name** | The dotted string identifying a method or publication (`"Puzzles.methods.create"`). Effectively immutable, because old browser tabs send it. |

## Meteor and framework terms

| Term | Meaning |
| --- | --- |
| **Atmosphere** | Meteor's own package registry, separate from npm. Packages listed in `.meteor/packages`, imported as `meteor/name`. |
| **DDP** | Distributed Data Protocol. Meteor's JSON-over-WebSocket protocol, carrying method calls, subscriptions and document deltas. |
| **Fibers** | The coroutine library that made Meteor 2's server code look synchronous. **Removed in Meteor 3**, which is why everything server-side is now async. |
| **Hot code push** | Meteor pushing a new client bundle to connected browsers, which reload. Jolly Roger can defer it with `useBlockUpdate`. |
| **Isomorphic** | One source tree compiled into both a browser bundle and a Node bundle. Which bundle a file joins is decided by its directory. |
| **Latency compensation** | Meteor's optimistic-UI feature, where a method stub also runs on the client. **Jolly Roger does not use it.** |
| **`mainModule`** | The `package.json` setting that disables Meteor's eager autoloading, making `client/main.ts` and `server/main.ts` the only entry points. |
| **Method** | A named server function callable by name over DDP. The only way the client writes data. |
| **Minimongo** | An in-browser MongoDB implementation holding the documents published to this user. Queried synchronously. |
| **Oplog tailing** | Reading MongoDB's replication log so publications learn about writes immediately. Needs `$MONGO_OPLOG_URL`. Without it Meteor polls every ten seconds, which is why dev feels laggy. |
| **Publication** | A named server function returning a live query. The only way data reaches the browser, and therefore a security boundary. |
| **Subscription** | A client's request for a publication's data. Reference counted; can carry server-side side effects with cleanup via `this.onStop()`. |
| **Tracker** | Meteor's reactivity system. Re-runs a computation when a reactive source it read changes. Used through `useTracker`. |

## Libraries and tools

| Term | Meaning |
| --- | --- |
| **Biome** | Rust formatter plus linter; replaces Prettier and most of ESLint here. Configured to understand `useTracker`. |
| **Knip** | Dead code and unused dependency detector. |
| **mediasoup** | The WebRTC SFU used for audio chat. Its object graph is mirrored into sixteen MongoDB collections. |
| **Monti APM** | Meteor-specific performance monitoring (`montiapm:agent`). |
| **Slate** | The rich-text editor framework whose document model is stored directly as chat message content. |
| **styled-components** | CSS-in-JS via tagged template literals. The main styling mechanism. |
| **SWC** | The Rust compiler Meteor uses to strip TypeScript types. **It does not typecheck.** |
| **tsgo** | `@typescript/native-preview`, the native port of `tsc`. Run by `npm run lint:types`. |
| **zod** | The runtime schema library. One zod schema per collection yields the TypeScript type *and* the MongoDB `$jsonSchema` validator. |

## WebRTC terms

| Term | Meaning |
| --- | --- |
| **Consumer** | An outbound track, server to browser. Named from the **server's** point of view. |
| **DTLS / SRTP** | The encryption layer for WebRTC media. |
| **ICE** | The protocol for discovering a network path between two peers through NATs. |
| **Producer** | An inbound track, browser to server. Also named from the server's point of view. |
| **Router** | mediasoup's "room". Only endpoints in the same router can exchange media. |
| **SFU** | Selective Forwarding Unit. A server that forwards media streams without decoding them. What mediasoup is. |
| **STUN / TURN** | STUN discovers your public address; TURN relays media when no direct path exists. TURN is why `$TURN_SERVER` exists. |
| **Transport** | One ICE+DTLS connection, **unidirectional**. Each browser needs a `send` and a `recv`. |
| **Worker** | A mediasoup C++ subprocess pinned to one core. |

## Repo-specific jargon you will see in code

| Term | Meaning |
| --- | --- |
| **`AllModels`** | The global set every `Model` registers itself into at construction. Iterated at startup to attach schemas and reconcile indexes. |
| **`bypassSchema`** | An escape hatch on `insertAsync` / `updateAsync` for migrations that must write shapes the current schema rejects. |
| **`createdServer` / `routedServer`** | In the mediasoup collections: which process *wrote* a document, and which process must *act on* it. |
| **`GLOBAL_SCOPE`** | The pseudo-hunt-ID under which global roles such as `admin` are stored in `user.roles`. |
| **`Hookset`** | A bundle of domain-event handlers registered in `imports/server/GlobalHooks.ts`. |
| **`relaxSchema`** | Transforms a document schema into one that can validate a Mongo *modifier*: everything optional, defaults become insert-only transforms. |
| **`SoftDeletedModel`** | A `Model` subclass that adds a `deleted` flag and rewrites queries to exclude deleted rows. `destroyAsync`, not `removeAsync`. |
| **`stabilize()`** | The test helper that waits for subscriptions to be ready and Tracker to flush. |
| **`TypedMethod` / `TypedPublication`** | The shared declaration half of the two-file method and publication pattern. |
| **`ValidateShape`** | A four-line conditional type that makes excess properties in a method call a compile error. |
| **`withCommon`** | The mixin adding `createdAt`, `updatedAt`, `createdBy`, `updatedBy`. |
