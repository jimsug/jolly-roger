---
files:
  - .meteor/release
  - .meteor/packages
  - client/main.ts
  - server/main.ts
  - eslint/rules/no-disallowed-sync-methods.ts
  - eslint.config.mts
  - package.json
updated: 2026-09-19
---

# 03 — Meteor, from zero

This is the document to read if you have never used Meteor. It explains the framework only as
far as you need it to read this codebase, then explains what Jolly Roger does differently.

Jolly Roger runs **Meteor 3.3.2** (`.meteor/release`). Anything you read online about Meteor that
predates 2024 describes Meteor 2, which differs in one very large respect. See
[section 6](#6-meteor-3-and-the-async-rule).

## 1. The one-paragraph version

Meteor is a build system plus a runtime protocol. It compiles a single TypeScript source tree
into two bundles, one for the browser and one for Node. It keeps a WebSocket open between them.
Over that socket the server *pushes* database documents to the browser, where they are stored in
an in-memory MongoDB clone called **Minimongo**. The browser queries Minimongo synchronously, as
if it were a local database, and React re-renders whenever the query result changes. Writes go
the other way as remote procedure calls, not HTTP requests.

The consequence for reading the code: **there is no REST API between the UI and the data, and
there are no `fetch()` calls to follow.** If you are looking for where the puzzle list is loaded,
you are looking for a *subscription*, not an endpoint.

## 2. The five concepts

### 2.1 Isomorphic build

One source tree, two bundles. Which bundle a file lands in is decided by its **path**:

- Anything under a directory named `client/` goes only to the browser.
- Anything under a directory named `server/` goes only to Node.
- Everything else goes to **both**.

This is why the repo's directory layout is load-bearing rather than cosmetic, and why putting a
file in the wrong place can ship a secret to the browser. See
[04-codebase-map.md](04-codebase-map.md#3-the-three-way-split).

### 2.2 DDP

**DDP** (Distributed Data Protocol) is Meteor's wire protocol, a JSON message format over a
WebSocket. It carries exactly three kinds of traffic:

- **Method calls** — RPC. Client sends a name and arguments; server replies with a result or an
  error.
- **Subscriptions** — the client says "I want the data from publication `X` with arguments `Y`".
- **Document deltas** — the server sends `added` / `changed` / `removed` messages for individual
  documents, for as long as the subscription lasts.

You can watch all of it. Open your browser devtools, Network tab, filter to WS, and look at the
`sockjs` or `websocket` connection. This is the single best way to understand what the app is
actually doing.

### 2.3 Minimongo

Minimongo is a MongoDB implementation in JavaScript that runs in the browser. It supports most
of the MongoDB query language. The documents in it are the ones the server has published to
*this user, right now*.

Two things follow, and both bite newcomers:

- **A client query can only see published documents.** `Puzzles.find({})` in the browser does not
  return all puzzles. It returns the puzzles that some active subscription has pushed. If data is
  "missing", the bug is usually in a publication, not in the component.
- **Client-side queries are synchronous.** There is nothing to wait for; it is an in-memory
  data structure. This is why the async rules in [section 6](#6-meteor-3-and-the-async-rule)
  apply to server code but explicitly *not* to client code.

### 2.4 Tracker

**Tracker** is Meteor's reactivity system. It predates React by a couple of years and works
differently from React state.

A *reactive data source* (a Minimongo query, `Meteor.user()`, a subscription's ready state)
registers itself as a dependency of whatever **computation** is currently running. When the
source changes, Tracker re-runs the computation. It is the same idea as a signal or an
observable, implemented with a dynamically-scoped "current computation" global.

In React components you never touch Tracker directly. You use `useTracker` from the
`react-meteor-data` package:

```tsx
const puzzles = useTracker(
  () => Puzzles.find({ hunt: huntId }).fetch(),
  [huntId],
);
```

`useTracker` runs the callback inside a Tracker computation, subscribes to whatever reactive
sources it touched, and re-renders the component when any of them change.

> **Foot-gun: the dependency array is a real dependency array.**
> If you close over `huntId` and do not list it, the computation keeps using the old value
> forever. Biome enforces exhaustive dependencies on `useTracker` specifically
> (`biome.jsonc`, `useExhaustiveDependencies` with a `useTracker` hook entry), so CI will catch
> it — but only if you run the linter.

> **Foot-gun: everything inside `useTracker` re-runs on every change.**
> If you `.fetch()` five hundred puzzles and then sort them inside the callback, you re-sort all
> five hundred every time any one of them changes. This is the classic Meteor + React performance
> trap and it is why the puzzle list does its grouping in a carefully separated memo. See
> [07-client.md](07-client.md#4-reactivity-and-performance).

### 2.5 Methods and publications

These are the two halves of the data API, and the split is strict:

- **Methods are writes.** A method is a named server function the client can call by name.
  `"Puzzles.methods.create"` is a method name; it is a string on the wire.
- **Publications are reads.** A publication is a named server function that returns a *cursor*
  (a live query). The server watches that query and streams changes to every subscribed client
  until they unsubscribe.

Both are **security boundaries**, and both must check permissions themselves. A client can call
any method with any arguments and subscribe to any publication with any arguments. Nothing about
the UI constrains that.

Jolly Roger does not call `Meteor.methods` or `Meteor.publish` directly in feature code. It uses
its own typed wrappers. See [06-methods-and-publications.md](06-methods-and-publications.md).

## 3. Hot code push

When you save a file in development, Meteor rebuilds and pushes the new client bundle to every
connected browser, which reloads. In production, a deploy does the same thing.

Jolly Roger takes this further than most apps: it can **veto** a reload. `useBlockUpdate`
(`imports/client/hooks/useBlockUpdate.tsx`) hooks Meteor's private `Reload._onMigrate` API to
defer the reload while a user is mid-sentence in a chat box, and surfaces the deferral in the
notification centre. This exists because the app is used continuously for 72 hours by people who
would be very annoyed to lose a half-typed message.

## 4. Atmosphere packages

Meteor has its own package registry, **Atmosphere**, separate from npm. Atmosphere packages are
listed in `.meteor/packages` and imported with a `meteor/` prefix:

```ts
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
```

These are invisible to npm tooling, which is why `knip.jsonc` and `biome.jsonc` both have to
disable "undeclared dependency" checks.

The ones worth knowing:

| Package | What it does |
| --- | --- |
| `accounts-password` | Password login, enrollment and reset emails, the `users` collection |
| `audit-argument-checks` | **Throws if a method argument is not passed to `check()`.** This is why every method in the repo has a mandatory `validate` function. |
| `react-meteor-data` | `useTracker`, `useSubscribe`, `useFind` |
| `zodern:types` | Generates TypeScript definitions for all Atmosphere packages into `.meteor/local/types/` |
| `zodern:standard-minifier-js` | Faster production minifier |
| `montiapm:agent` | Monti APM, a Meteor-specific performance monitor |
| `fourseven:scss` | SCSS compilation |
| `dynamic-import` | Code splitting via `await import()` |
| `server-render` | Server-side rendering hook |
| `shell-server` | Enables `meteor shell`, a REPL attached to the live server process |
| `oauth`, `google-oauth`, `service-configuration` | OAuth plumbing for Google and Discord login |

## 5. Nothing autoloads

By default Meteor eagerly loads every file outside `imports/`. Jolly Roger turns that off by
setting `meteor.mainModule` in `package.json`:

```json
"meteor": {
  "mainModule": { "client": "client/main.ts", "server": "server/main.ts" },
  "modern": true,
  "testModule": "tests/main.ts"
}
```

With `mainModule` set, **only the entry point and what it transitively imports exist**. That is
why `server/main.ts` is a long ordered list of side-effect imports with the comment *"explicitly
import all the stuff from lib/ since mainModule skips autoloading things"*.

It also means there are four **barrel files** that act as registries. If you add a file and do
not add it to the right barrel, your code silently does not exist:

| You added | Add the import to | Symptom if you forget |
| --- | --- | --- |
| A method | `imports/server/methods/index.ts` | `Method 'X' not found` at runtime |
| A publication | `imports/server/publications/index.ts` | Subscription never becomes ready |
| A migration | `imports/server/migrations/all.ts` | Migration silently never runs |
| A daemon | `imports/server/daemons/index.ts` | Background job never starts |
| A model | anything reachable from an entry point | **No schema validation and no indexes** |

That last one is the subtlest. `imports/server/schemas.ts` and `imports/server/indexes.ts` both
iterate a registry called `AllModels`, which each `Model` adds itself to *in its constructor*
(`imports/lib/models/Model.ts`). A model nobody imports never constructs, so it never registers,
so it gets no MongoDB schema validator and none of its declared indexes. It will still work, and
will quietly accept malformed documents.

This is also why `server/main.ts` ends with an apparently pointless import:

```ts
// Imports are necessary to make sure the modules are in the bundle
import ModelsFacade from "../imports/lib/models/facade";
(global as any).Models = ModelsFacade;
```

The facade imports every model, which forces every model to be constructed.

## 6. Meteor 3 and the async rule

This is the thing most likely to trip you up, and the reason most Meteor answers online are
wrong for this codebase.

Meteor 2 ran server code inside **Fibers**, a native coroutine library that let synchronous-looking
code block on I/O. `Collection.findOne()` looked synchronous but actually yielded. Fibers stopped
working on modern Node, so **Meteor 3 removed them** and replaced them with ordinary
`async`/`await`.

**On the server, every database operation is now asynchronous and has an `Async` suffix:**

| Meteor 2 (server) | Meteor 3 (server) |
| --- | --- |
| `Collection.findOne(sel)` | `await Collection.findOneAsync(sel)` |
| `Collection.insert(doc)` | `await Collection.insertAsync(doc)` |
| `Collection.update(...)` | `await Collection.updateAsync(...)` |
| `Collection.upsert(...)` | `await Collection.upsertAsync(...)` |
| `Collection.remove(sel)` | `await Collection.removeAsync(sel)` |
| `cursor.fetch()` | `await cursor.fetchAsync()` |
| `cursor.count()` | `await cursor.countAsync()` |
| `cursor.forEach()` / `.map()` | `await cursor.forEachAsync()` / `.mapAsync()` |
| `cursor.observeChanges(...)` | `await cursor.observeChangesAsync(...)` |
| `Meteor.call(...)` | `await Meteor.callAsync(...)` |
| `Meteor.user()` | `await Meteor.userAsync()` |
| `Accounts.createUser(...)` | `await Accounts.createUserAsync(...)` |
| `Email.send(...)` | `await Email.sendAsync(...)` |

**On the client the synchronous API is still correct**, because Minimongo is an in-memory cache
with nothing to await, and because Tracker computations must run synchronously.

### The rule is machine-enforced

The repo ships a custom, type-aware ESLint rule for this:
`eslint/rules/no-disallowed-sync-methods.ts`. It asks the TypeScript checker for the type of the
receiver, walks its base types, and errors on a call to any banned synchronous method. It knows
about `Mongo.Collection`, `Mongo.Cursor`, `Accounts`, `Meteor`, `Email`, and the repo's own
`Model`, `SoftDeletedModel`, `Flags` and `TypedMethod` classes.

Two useful properties:

- **It has an autofixer.** `eslint --fix` rewrites `x.findOne(y)` into `(await x.findOneAsync(y))`.
- **It is disabled for `**/client/**`** (`eslint.config.mts`), because synchronous Minimongo is
  correct there. Note the glob does *not* cover `imports/lib/`, so shared code is held to the
  server standard — which is right, because shared code may run on the server.

> **Foot-gun: `Meteor.userId()` throws outside a method or publication.**
> It reads a dynamically-scoped invocation context. In a daemon, an HTTP route handler, or a
> `setTimeout` callback there is no such context. Thread the user ID explicitly instead.

> **Foot-gun: there may be several server processes.**
> Production runs a load balancer and N workers (`$CLUSTER_WORKERS_COUNT`). Never keep
> authoritative state in a module-level variable; it will exist N times and diverge. Use
> MongoDB, and the `withLock` helper for mutual exclusion. See
> [10-operations.md](10-operations.md).

## 7. A worked example, end to end

Here is the whole loop in miniature: a component shows the puzzles for a hunt, and a button
creates one.

**Shared — declare the method's name and type** (`imports/methods/createPuzzle.ts`):

```ts
export default new TypedMethod<
  { huntId: string; title: string; tags: string[]; /* ... */ },
  string
>("Puzzles.methods.create");
```

**Server — implement it** (`imports/server/methods/createPuzzle.ts`):

```ts
defineMethod(createPuzzle, {
  validate(arg) {
    check(arg, { huntId: String, title: String, tags: [String], /* ... */ });
    return arg;
  },
  async run({ huntId, title, tags, /* ... */ }) {
    check(this.userId, String);
    return addPuzzle({ userId: this.userId, huntId, title, tags, /* ... */ });
  },
});
```

**Server — publish the data** (`imports/server/publications/puzzlesForHunt.ts`, simplified):
a publication that returns a cursor of the hunt's puzzles, after checking the caller is a member
of that hunt.

**Client — subscribe and render:**

```tsx
const loading = useTypedSubscribe(puzzlesForHunt, { huntId });
const puzzles = useTracker(
  () => Puzzles.find({ hunt: huntId }).fetch(),
  [huntId],
);
if (loading()) return <Loading />;
```

**Client — write:**

```ts
await createPuzzle.callPromise({ huntId, title, tags, /* ... */ });
```

Nobody re-fetches after the write. The server's publication observes the insert, pushes an
`added` message to every subscribed client, Minimongo updates, Tracker invalidates, React
re-renders. That loop, and the fact that it is automatic, is the entire reason this app is built
on Meteor.

## 8. Private Meteor APIs are load-bearing here

Jolly Roger reaches into several underscore-prefixed Meteor internals: `OAuth._*`,
`Reload._onMigrate`, `DDP._CurrentInvocation`, `Mongo.Collection._makeNewID`,
`Meteor.connection._anyMethodsAreOutstanding`, `DDP._allSubscriptionsReady`.

These have no deprecation policy and can break on a Meteor upgrade. They are all declared in
`types/meteor/`, which makes that directory a useful inventory of upgrade risk.
