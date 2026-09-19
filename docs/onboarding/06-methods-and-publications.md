---
files:
  - imports/methods/TypedMethod.ts
  - imports/server/methods/defineMethod.ts
  - imports/lib/publications/TypedPublication.ts
  - imports/server/publications/definePublication.ts
  - imports/server/publishJoinedQuery.ts
  - imports/server/PublicationMerger.ts
  - imports/lib/ValidateShape.ts
  - imports/lib/permission_stubs.ts
  - imports/client/hooks/useTypedSubscribe.ts
updated: 2026-09-19
---

# 06. Methods and publications

Every write in Jolly Roger is a **method**. Every read is a **publication**. Both are wrapped in
repo-local typed abstractions that you must understand before you can add either.

Both are also security boundaries. The client can call any method with any arguments and
subscribe to any publication with any arguments, regardless of what the UI offers.

## 1. Methods: the two-file pattern

A method is split across two files. The split is deliberate: the *name and argument types* must
reach the browser so it can call the method type-safely; the *body* must not, because it holds
permission checks and database access.

**Shared declaration**: `imports/methods/createPuzzle.ts`:

```ts
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  { huntId: string; title: string; tags: string[]; expectedAnswerCount: number },
  string   // the return type
>("Puzzles.methods.create");
```

**Server implementation**: `imports/server/methods/createPuzzle.ts`:

```ts
import { check, Match } from "meteor/check";
import createPuzzle from "../../methods/createPuzzle";
import defineMethod from "./defineMethod";

defineMethod(createPuzzle, {
  validate(arg) {
    check(arg, {
      huntId: String,
      title: String,
      tags: [String],
      expectedAnswerCount: Number,
    });
    return arg;
  },

  async run({ huntId, title, tags, expectedAnswerCount }) {
    check(this.userId, String);
    return addPuzzle({ userId: this.userId, huntId, title, tags, expectedAnswerCount });
  },
});
```

**Register it**: add `import "./createPuzzle";` to `imports/server/methods/index.ts`, or you
get `Method 'Puzzles.methods.create' not found` at runtime.

**Call it** from anywhere on the client:

```ts
const puzzleId = await createPuzzle.callPromise({
  huntId, title, tags, expectedAnswerCount,
});
```

### Why `validate` is mandatory

The `audit-argument-checks` Atmosphere package throws if a method argument is not passed through
`check()`. This is a good thing: it makes it impossible to forget input validation by accident.
`defineMethod`'s type signature requires a `validate` function for any method with arguments
(void-argument methods get a `voidValidator` substituted at runtime).

`check` comes from Meteor, not zod. It is a simple runtime shape matcher: `String`, `Number`,
`Boolean`, `[String]` for arrays, `Match.Optional(X)`, `Match.OneOf(a, b)`. Note that the
database layer uses zod and the method layer uses `check`; these are different systems and you
will use both.

### No latency compensation

Meteor's marquee feature is **latency compensation**: you define a method *stub* that also runs
on the client, so the UI updates optimistically before the server responds.

**Jolly Roger does not use this.** `imports/server/methods/defineMethod.ts` contains the only
`Meteor.methods` call in the tree, and it is server-only, so no stubs exist. Every method call
is a real round trip. Do not go looking for the optimistic-update code path; there isn't one.

### `ValidateShape`, and why it exists

`imports/lib/ValidateShape.ts` is four lines:

```ts
type ValidateShape<T, Shape> = Shape & {
  [K in keyof T]: K extends keyof Shape ? T[K] : never;
};
```

It solves a real TypeScript problem. TypeScript's excess property checking only applies to
object *literals*, so this compiles silently:

```ts
const args = { huntId, title, tpyo: 1 };
someMethod.callPromise(args);   // extra property, no error, silently ignored
```

`ValidateShape` forces any key of `T` that is not in `Shape` to type as `never`, which makes the
call fail to compile. `TypedMethod.call` and `callPromise` are both generic over `T` so this
kicks in.

### Errors

Two kinds, and the distinction is load-bearing:

- `throw new Meteor.Error(400, "message")`: an **expected** failure. Numeric codes in the 400
  range are logged at `info` severity and reported to Bugsnag as `info`.
- `throw new Error("...")`: a **bug**. Logged and reported at `error` severity.

Both `TypedMethod` (client side) and `defineMethod` (server side) inspect the error and pick the
severity from the numeric code. Using the wrong one either buries a real bug or floods your error
tracker with routine permission denials.

### Permissions

The standard preamble:

```ts
async run({ huntId, ... }) {
  check(this.userId, String);                       // authenticated
  const hunt = await Hunts.findOneAsync(huntId);
  if (!userMayWritePuzzlesForHunt(await MeteorUsers.findOneAsync(this.userId), hunt)) {
    throw new Meteor.Error(401, "Must be permitted to write puzzles");
  }
  // ...
}
```

`this` inside `run` is Meteor's method invocation context: `this.userId`, `this.connection`,
`this.unblock()`. `this.userId` is the authenticated user, set by Meteor from the login token.
It cannot be spoofed by the client.

The predicates all live in `imports/lib/permission_stubs.ts`. They take a user and (usually) a
hunt, and return a boolean. `checkAdmin(user)` is the one that throws rather than returning.

> **Foot-gun: `Meteor.userId()` throws outside a method or publication.**
> It reads a dynamically-scoped invocation context that only exists inside a method or
> publication call. In a daemon, an HTTP handler, or a `setTimeout`, there is none. Pass the
> user ID explicitly.

## 2. Publications: the same pattern, for reads

**Shared declaration**: `imports/lib/publications/puzzlesForHunt.ts`:

```ts
export default new TypedPublication<{ huntId: string }>("Puzzles.publications.forHunt");
```

**Server implementation**: `imports/server/publications/puzzlesForHunt.ts`:

```ts
definePublication(puzzlesForHunt, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },
  async run({ huntId }) {
    if (!this.userId) return [];
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(huntId)) return [];
    return Puzzles.find({ hunt: huntId });
  },
});
```

**Register it** in `imports/server/publications/index.ts`.

**Subscribe** on the client:

```tsx
const loading = useTypedSubscribe(puzzlesForHunt, { huntId });
const puzzles = useTracker(() => Puzzles.find({ hunt: huntId }).fetch(), [huntId]);
if (loading()) return <Loading />;
```

> Note `loading()` is a **function call**, not a boolean. That is `react-meteor-data`'s
> `useSubscribe` API, and forgetting the parentheses gives you a permanently truthy value, so
> your component renders the loading state forever.

> Passing `undefined` as the argument to `useTypedSubscribe` is the idiom for a **conditional
> subscription** (do not subscribe yet). You cannot call hooks conditionally, so this is how.

### What a publish handler may return

- **A cursor**, or an array of cursors. The common case. Meteor observes the query and streams
  changes automatically.
- **Nothing (`[]`)**. The house idiom for "not authorized". Note it is *not* an error: the
  subscription becomes ready with no documents.
- **Manual `added` / `changed` / `removed` calls** plus `this.ready()`. Used when the data is
  computed rather than queried. You must also register `this.onStop()` cleanup.

That third form is worth knowing about because it enables something unusual: **a subscription
used as a resource with cleanup**. `imports/server/subscribers.ts` publishes *nothing at all*;
its entire purpose is that subscribing inserts a presence row and `this.onStop` deletes it when
the client disconnects. That is how "who is viewing this puzzle" works, and how the WebRTC
signalling gets reliable teardown. If you see a subscription that publishes no data, this is why.

### Publications are the security boundary

Take this seriously:

- There is no REST layer for app data, so a publication is the only way data reaches the browser.
- `autopublish` is not installed, so nothing is published implicitly.
- Client-side writes are blocked (`Meteor.users.deny({ update: () => true })`).
- **Minimongo is fully readable by the user.** Anything you publish is in browser memory and
  visible in the console. **A projection is access control, not a display preference.**
- **The client controls the subscription arguments.** A `huntId` comes from the URL. Always
  re-derive authorization from `this.userId` against the database; never trust an argument.

The house pattern, in order:

```ts
async run({ huntId }) {
  if (!this.userId) return [];                              // 1. authenticated?
  const user = await MeteorUsers.findOneAsync(this.userId); // 2. load the real user
  if (!user?.hunts?.includes(huntId)) return [];            // 3. authorized for THIS hunt?
  return SomeModel.find({ hunt: huntId });                  // 4. scope the query by hunt
}
```

Step 4 matters as much as step 3: scoping the selector by hunt means even a mistaken membership
check cannot leak another hunt's rows.

Authorization is not always all-or-nothing. `puzzleFeedbacks` publishes every row to operators
and only your own rows to everyone else. Field-level control is done with projections.

## 3. Two pieces of machinery worth understanding

You can write ordinary publications without these, but you will meet them immediately in the
interesting ones.

### `publishJoinedQuery`: reactive joins

MongoDB has no joins. But the guess queue needs, for each pending guess, the puzzle it is for,
the hunt it belongs to, and the display name of the submitter. Publishing *all* puzzles, hunts
and users would be wasteful and a privacy leak.

`imports/server/publishJoinedQuery.ts` takes a recursive spec and publishes exactly the
referenced documents, keeping the set correct as the base query changes:

```ts
await publishJoinedQuery(this, {
  model: Guesses,
  foreignKeys: [
    { field: "puzzle",    join: { model: Puzzles } },
    { field: "hunt",      join: { model: Hunts } },
    { field: "createdBy", join: { model: MeteorUsers, projection: { displayName: 1 } } },
  ],
}, { hunt: huntId, state: "pending" });
```

The hard parts it handles for you: two guesses referencing the same puzzle (publish once, retract
only when the last referrer goes), a foreign key *changing* (add the new referent before
retracting the old, or the UI flickers), nested keys, array-valued keys, and ordering all of it
correctly now that everything is async.

### `PublicationMerger`: several producers, one stream

Within one DDP subscription, `added(collection, id, fields)` may be sent only once per document.
Sending it twice is a protocol error; sending `removed` once retracts the document even if a
second valid reason to publish it still exists.

`imports/server/PublicationMerger.ts` sits between N logical producers and the one real
subscription and reference-counts per collection, per document, **per field**. You need it
whenever two producers in one publication can overlap: the puzzle page publishes both "all
puzzles in the hunt" and "this puzzle even if deleted", and those sets intersect.

## 4. How the server notices a write

For a cursor-returning publication, Meteor calls `observeChanges` on the cursor. There are two
implementations:

- **Oplog tailing.** The server reads MongoDB's replication log and learns about writes directly.
  Efficient. Requires `$MONGO_OPLOG_URL` and a replica set (size 1 is fine).
- **Polling.** The fallback when no oplog is configured. Meteor re-runs the query every ten
  seconds and diffs the results.

Development has no oplog, so **realtime updates in dev can lag by up to ten seconds** for changes
made outside your own session. This surprises people into thinking reactivity is broken. In
production, configure `$MONGO_OPLOG_URL`.

## 5. Recipes

### Add a method

1. `imports/methods/myThing.ts`: `export default new TypedMethod<Args, Return>("Things.methods.myThing")`
2. `imports/server/methods/myThing.ts`: `defineMethod(myThing, { validate, run })`
3. Add `import "./myThing";` to `imports/server/methods/index.ts`
4. Call it with `await myThing.callPromise({ ... })`

Checklist: `check()` every argument; `check(this.userId, String)`; check permissions against the
database; throw `Meteor.Error(4xx)` for expected failures; never rename the wire name.

### Add a publication

1. `imports/lib/publications/thingsForFoo.ts`: `export default new TypedPublication<Args>("Things.publications.forFoo")`
2. `imports/server/publications/thingsForFoo.ts`: `definePublication(thingsForFoo, { validate, run })`
3. Add `import "./thingsForFoo";` to `imports/server/publications/index.ts`
4. Subscribe with `useTypedSubscribe(thingsForFoo, args)` and read with `useTracker`

Checklist: authenticate, load the user from the database, authorize, scope the selector,
project away anything the client should not see. Return `[]` when unauthorized.
