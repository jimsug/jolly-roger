---
files:
  - imports/server/methods/index.ts
  - imports/server/publications/index.ts
  - imports/server/migrations/all.ts
  - imports/lib/models/facade.ts
  - imports/client/components/Routes.tsx
  - imports/server/GlobalHooks.ts
updated: 2026-09-19
---

# 12. Recipes

Step-by-step procedures for the changes you are most likely to be asked to make. Each one is
written to be followed literally.

The single most common way to lose an hour in this repo is forgetting a registration step, so
those are called out in bold everywhere.

---

## Add a field to a collection and show it in the UI

1. **Edit the model.** Add the field to the zod schema in `imports/lib/models/Foo.ts`, using the
   vocabulary from `customTypes.ts` (`nonEmptyString`, `foreignKey`, ...) rather than raw zod.

   ```ts
   const Puzzle = withCommon(z.object({
     // ...
     difficulty: z.number().int().min(1).max(5).optional(),
   }));
   ```

   Make it `.optional()` or give it a `.default()`, because existing documents do not have it
   and MongoDB will start enforcing the generated `$jsonSchema` on the next server start.

2. **Decide whether you need a migration.** You do if existing rows need a backfilled value and
   the field is not optional. You do not if the field is optional or defaulted.

3. **Let it through the write path.** A field only reaches the database if some method sets it.
   Add it to the relevant method's `TypedMethod` argument type, its `check()` validator, and its
   `run` body. The types will point you at every place.

4. **Check it is published.** If the publication uses a projection, add the field, or the
   client will never see it. This is the most common cause of "I added the field and the UI
   shows undefined".

5. **Render it.** The `ModelType<typeof Foo>` type already includes it, so TypeScript will
   guide you.

6. `npm run lint:types`.

---

## Add a server method

1. **Declare it** in `imports/methods/myThing.ts`:

   ```ts
   import TypedMethod from "./TypedMethod";
   export default new TypedMethod<{ puzzleId: string; note: string }, void>(
     "Puzzles.methods.myThing",
   );
   ```

   The dotted string is a **wire contract**. Pick it carefully; renaming it later breaks any
   browser tab that has not reloaded.

2. **Implement it** in `imports/server/methods/myThing.ts`:

   ```ts
   import { check } from "meteor/check";
   import { Meteor } from "meteor/meteor";
   import myThing from "../../methods/myThing";
   import defineMethod from "./defineMethod";

   defineMethod(myThing, {
     validate(arg) {
       check(arg, { puzzleId: String, note: String });
       return arg;
     },
     async run({ puzzleId, note }) {
       check(this.userId, String);

       const puzzle = await Puzzles.findOneAsync(puzzleId);
       if (!puzzle) throw new Meteor.Error(404, "Unknown puzzle");

       const hunt = await Hunts.findOneAsync(puzzle.hunt);
       const user = await MeteorUsers.findOneAsync(this.userId);
       if (!userMayWritePuzzlesForHunt(user, hunt)) {
         throw new Meteor.Error(401, "Must be an operator");
       }

       await Puzzles.updateAsync(puzzleId, { $set: { note } });
     },
   });
   ```

3. **Register it: add `import "./myThing";` to `imports/server/methods/index.ts`.** Without
   this you get `Method 'Puzzles.methods.myThing' not found`.

4. **Call it:** `await myThing.callPromise({ puzzleId, note })`.

Checklist:

- [ ] Every argument passed through `check()` (the `audit-argument-checks` package throws otherwise)
- [ ] `check(this.userId, String)`
- [ ] Permissions rechecked **server-side**, against the database, not against arguments
- [ ] `Meteor.Error(4xx, ...)` for expected failures, plain `Error` for bugs
- [ ] Every database call `await`ed and using the `Async` variant

---

## Add a publication

1. **Declare it** in `imports/lib/publications/thingsForFoo.ts`:

   ```ts
   import TypedPublication from "./TypedPublication";
   export default new TypedPublication<{ huntId: string }>("Things.publications.forFoo");
   ```

2. **Implement it** in `imports/server/publications/thingsForFoo.ts`:

   ```ts
   definePublication(thingsForFoo, {
     validate(arg) {
       check(arg, { huntId: String });
       return arg;
     },
     async run({ huntId }) {
       if (!this.userId) return [];
       const user = await MeteorUsers.findOneAsync(this.userId);
       if (!user?.hunts?.includes(huntId)) return [];
       return Things.find({ hunt: huntId }, { projection: { secret: 0 } });
     },
   });
   ```

3. **Register it: add `import "./thingsForFoo";` to `imports/server/publications/index.ts`.**

4. **Subscribe:**

   ```tsx
   const loading = useTypedSubscribe(thingsForFoo, { huntId });
   const things = useTracker(() => Things.find({ hunt: huntId }).fetch(), [huntId]);
   if (loading()) return <Loading />;
   ```

Checklist:

- [ ] Authenticate, then load the user **from the database**
- [ ] Authorize against that user, never against the arguments
- [ ] Scope the selector by hunt, so even a wrong check cannot leak another hunt
- [ ] Project away anything the client should not have; **a projection is access control**
- [ ] Return `[]` for unauthorized, not an error

---

## Add a collection

1. Create `imports/lib/models/Foo.ts` (or `imports/server/models/Foo.ts` if the client must
   never see it):

   ```ts
   import { z } from "zod";
   import { foreignKey, nonEmptyString } from "./customTypes";
   import type { ModelType } from "./Model";
   import SoftDeletedModel from "./SoftDeletedModel";
   import withCommon from "./withCommon";

   const Foo = withCommon(z.object({
     hunt: foreignKey,
     name: nonEmptyString,
   }));

   const Foos = new SoftDeletedModel("jr_foos", Foo);
   Foos.addIndex({ deleted: 1, hunt: 1 });
   export type FooType = ModelType<typeof Foos>;
   export default Foos;
   ```

2. **Add it to `imports/lib/models/facade.ts`.** This is what guarantees the model is
   constructed, which is what registers it in `AllModels`, which is what gives it a
   `$jsonSchema` validator and its indexes. Skip this and it silently gets neither.

3. Declare indexes with `addIndex` in the model file. **Do not** create them in a migration;
   `imports/server/indexes.ts` reconciles and will drop anything it does not know about.

4. Restart the server so schemas and indexes are reapplied.

---

## Add a migration

1. Find the highest existing number in `imports/server/migrations/` (currently 53) and create
   `imports/server/migrations/54-your-change.ts`:

   ```ts
   import Migrations from "./Migrations";

   Migrations.add({
     version: 54,
     name: "Backfill difficulty on puzzles",
     async up() {
       await Puzzles.updateAsync(
         { difficulty: { $exists: false } },
         { $set: { difficulty: 3 } },
         { multi: true },
       );
     },
   });
   ```

2. **Add `import "./54-your-change";` to `imports/server/migrations/all.ts`.**

3. Restart. It runs once, under a lock, on the newest deployed build only.

Rules:

- **Never edit a migration that has shipped.** Add a new one.
- Use `{ bypassSchema: true }` if you need to write a shape the current schema rejects, which
  is common in a two-step schema change.
- Only use a migration for an index if the target is `Meteor.users`, which is not a `Model`.

---

## Add a page

1. Write `imports/client/components/MyPage.tsx` with a default export.

2. Register the route in `imports/client/components/Routes.tsx`, inside
   `AuthenticatedRouteList` (usually nested under `/hunts/:huntId`):

   ```tsx
   { path: "mything", element: <MyPage /> },
   ```

   Adding it here gives you the auth guard and the app chrome automatically, because the list
   is `.map`ped through `<AuthenticatedPage>`.

3. Push a breadcrumb from inside the component with the breadcrumb hook, and set a document
   title with `useDocumentTitle`.

4. **You have just added a smoke test.** `tests/acceptance/smoke.tsx` enumerates the route lists
   and navigates to every path, so if your page throws on load, CI goes red. Run `npm test`.

5. For a large page, consider `React.lazy` as `SetupPage` and `HuntEditPage` do; there is
   already a `Suspense` boundary above the router.

---

## Add a reaction to a domain event

Use this when something should happen whenever a puzzle is created or solved, or a chat message
is sent, rather than bolting it onto one method.

1. Create `imports/server/hooks/MyHooks.ts` exporting a `Hookset` with the handlers you care
   about (`runPuzzleCreatedHooks`, `runPuzzleSolvedHooks`,
   `runPuzzleNoLongerSolvedHooks`, ...).

2. **Register it in `imports/server/GlobalHooks.ts`** with `GlobalHooks.addHookSet(MyHooks)`.
   Note: `imports/server/hooks/Hookset.ts` documents the wrong path for this.

`DiscordHooks.ts` and `TagCleanupHooks.ts` are the models to copy.

---

## Add a setting or a feature flag

**A feature flag** is the right tool for "we might need to turn this off during a hunt". Add the
name to the enum in `imports/lib/models/FeatureFlags.ts`, check it in code with the `Flags`
helper (note `activeAsync` on the server), and an admin can toggle it from the setup page. An
absent record means off. The existing flags are all `disable.*` circuit breakers, which tells
you what they are for.

**A setting** is configuration with a value. `imports/lib/models/Settings.ts` is a zod
**discriminated union keyed on `name`**, so add a new variant with its own value shape, then add
a `configureMyThing` method pair and a section to `SetupPage.tsx`.

> If the setting holds a secret, make sure the publication that exposes settings to the client
> redacts it. `settingsAll` is admin-only, but check what you are publishing.

---

## Add an HTTP endpoint

1. Write an Express `Router` in `imports/server/api/resources/myThing.ts`.
2. Mount it in `imports/server/api.ts`, deciding whether it sits behind `authenticator`
   (API-key auth) or is public.
3. Remember `Meteor.userId()` does not work here; there is no method invocation context. The
   authenticator resolves the user from the API key, and you thread it explicitly.

---

## Debug "my data is not showing up"

In order, because this resolves it almost every time:

1. Browser console: `await window.loadFacades()`, then `Models.Foo.find({}).count()`.
   - **Documents present** → UI bug. Check your `useTracker` selector and dependency array.
   - **Documents absent** → publication bug. Continue.
2. Is the subscription actually open? Is `loading()` being called with parentheses?
3. Is the publication registered in `imports/server/publications/index.ts`?
4. Does the publication return `[]` because an authorization check failed? Add a log line.
5. Does its projection exclude the field you want?
6. Are you in development without an oplog? Changes from another session can take up to ten
   seconds to arrive.
