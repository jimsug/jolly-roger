---
files:
  - client/main.ts
  - server/main.ts
  - imports/server/methods/index.ts
  - imports/server/publications/index.ts
  - imports/server/migrations/all.ts
  - imports/server/daemons/index.ts
  - imports/lib/models/facade.ts
  - imports/server/GlobalHooks.ts
updated: 2026-09-19
---

# 04. Codebase map

Roughly 63,000 lines of TypeScript across 630 files. This document tells you what lives where,
what decides that, and where to put new code.

## 1. Top level

| Path | What it is |
| --- | --- |
| `client/` | The client **entry point** (`main.ts`) and the small SCSS layer. Almost no logic. |
| `server/` | The server **entry point** (`main.ts`). One file, an ordered list of imports. |
| `imports/` | **Effectively all of the application.** See section 2. |
| `private/` | Server-only assets, read via `Assets.absoluteFilePath()`. Default branding images and the Google Apps Script source. Never served to browsers. |
| `public/` | Static files served verbatim at the web root. |
| `tests/` | The whole test suite plus `check_docs.mts`, the docs freshness checker. |
| `types/` | Hand-written TypeScript declarations, mostly for private Meteor APIs. A useful inventory of upgrade risk. |
| `eslint/` | The repo's own custom ESLint rule. Outside the app's TS project. |
| `extension/` | A **separate project**: a browser extension with its own `package.json`, `tsconfig.json` and webpack build. Not part of the Meteor build. |
| `cloudformation/` | An AWS CloudFormation template for a canned production deployment. |
| `scripts/` | `run_jolly_roger.sh`, the production entry point (pulls secrets from AWS SSM, then `exec node main.js`). |
| `docs/` | Design docs, policed for freshness by `npm run lint:docs`. This guide lives in `docs/onboarding/`. |
| `.meteor/` | Meteor's project state. `release` and `packages`/`versions` are the version lockfiles; `local/` is generated and git-ignored. |

## 2. Inside `imports/`

```
imports/
  lib/          shared between client and server
    models/       collection + schema declarations
    publications/ publication NAME + ARG TYPE declarations (no bodies)
    config/       shared configuration (accounts)
  methods/      method NAME + ARG TYPE declarations (no bodies), shared
  client/       browser only
    components/   ~90 React components, flat
    hooks/        custom React hooks
  server/       Node only
    models/       collections the client must never see
    methods/      method IMPLEMENTATIONS
    publications/ publication IMPLEMENTATIONS
    migrations/   numbered database migrations
    daemons/      background loops
    hooks/        domain event reactions
    api/          the Express HTTP API
```

## 3. The three-way split

This is the most important structural fact in the repo.

| Directory | Ships to | Typical contents |
| --- | --- | --- |
| `imports/lib/**` | **both** bundles | Collection and schema declarations, publication name declarations, pure helpers, shared constants, permission predicates |
| `imports/methods/**` | **both** bundles | Method name and argument-type declarations only |
| `imports/client/**` | **browser only** | React components, hooks, pseudo-collections, browser SDKs |
| `imports/server/**` | **Node only** | Anything touching credentials, the filesystem, native modules, or privileged database operations |

### What enforces it

**Meteor's bundler, and essentially nothing else.** This is worth stating plainly because it is
easy to assume there is a safety net:

- ESLint registers exactly one custom rule (the async rule) and no import-path restrictions.
- Biome's `noRestrictedImports` only covers two bundle-size rules, nothing about `imports/server`.
- `tsconfig.json` has **one program covering the whole tree**, so TypeScript will happily
  typecheck a client file that imports a server module. `tsgo` is not a safety net here.
- Application code contains **zero** `Meteor.isServer` / `Meteor.isClient` guards. Every
  occurrence is in `tests/`.

> **Foot-gun: the directory name is the access-control mechanism.**
> If you put a file containing a credential in `imports/lib/`, it ships to every browser and
> nothing warns you at edit time. When in doubt, `imports/server/`.

### Why the declaration/implementation split exists

It looks like boilerplate. It is not. A method's *name and argument types* must be known to the
client so it can call it type-safely; its *body* must never reach the browser, because the body
contains permission checks, credentials and database access.

Putting the declaration in `imports/methods/` and the body in `imports/server/methods/` gets you
end-to-end type safety with no shared code that could leak. Publications do the same thing with
`imports/lib/publications/` and `imports/server/publications/`.

## 4. Load order and the barrel files

Because `package.json` sets `meteor.mainModule`, nothing autoloads. Only the entry point and
what it transitively imports exists at runtime. See
[03-meteor-primer.md](03-meteor-primer.md#5-nothing-autoloads).

`server/main.ts` is an ordered list, and the order matters:

```ts
// 1. Error reporting and logging first, so later failures are captured
import "../imports/server/sentry";
import "../imports/server/bugsnag";
import "../imports/server/configureLogger";

import "disposablestack/auto";          // polyfill

// 2. Database management, in this order
import "../imports/server/schemas";      // attach $jsonSchema validators
import "../imports/server/indexes";      // reconcile indexes
import "../imports/server/migrations-run";

import "../imports/lib/config/accounts";
import "../imports/server/migrations/all";   // register migrations
import "../imports/server/loadBalance";      // multi-process setup

// 3. The registries
import "../imports/server/methods/index";
import "../imports/server/publications/index";
import "../imports/server/daemons/index";

// 4. Everything else
// ...
```

**The four barrel files are hand-maintained registries.** Forget one and your code silently
does not exist:

| Barrel | Registers | Symptom if you forget |
| --- | --- | --- |
| `imports/server/methods/index.ts` | Methods | `Method 'X' not found` |
| `imports/server/publications/index.ts` | Publications | Subscription never becomes ready |
| `imports/server/migrations/all.ts` | Migrations | Migration silently never runs |
| `imports/server/daemons/index.ts` | Background loops | Job never starts |

And a fifth, less obvious one: `imports/lib/models/facade.ts`. Models register themselves in a
global `AllModels` set *in their constructor*. A model nobody imports is never constructed, so it
gets **no schema validator and no indexes**, and will silently accept malformed documents. The
facade imports every model, and `server/main.ts` imports the facade specifically to force that.

## 5. Where do I put a new X?

| I want to add | Put it here | Also do this |
| --- | --- | --- |
| A React component or page | `imports/client/components/Foo.tsx` | Add a route in `Routes.tsx` if it is a page |
| A custom React hook | `imports/client/hooks/useFoo.ts(x)` | - |
| A shared style primitive | `imports/client/components/styling/*.tsx` | - |
| A Bootstrap variable change | `client/stylesheets/_theme.scss` | Only Bootstrap theming lives in SCSS |
| A collection the client needs | `imports/lib/models/Foo.ts` | Add it to `imports/lib/models/facade.ts`; declare indexes with `Foo.addIndex(...)` |
| A collection the client must not see | `imports/server/models/Foo.ts` | Make sure something on the server imports it |
| A field on an existing model | Edit the model file | Write a migration if existing rows need backfilling |
| An index on an app collection | `Foo.addIndex({...})` in the model file | **Do not** write a migration; `imports/server/indexes.ts` reconciles and will drop indexes it does not know about |
| An index on `Meteor.users` | A migration | `Meteor.users` is not a `Model`, so it is not reconciled |
| A migration | `imports/server/migrations/<N+1>-kebab-name.ts` | **Add the import to `migrations/all.ts`** |
| A client-to-server RPC | `imports/methods/fooBar.ts` **and** `imports/server/methods/fooBar.ts` | **Add the import to `methods/index.ts`** |
| A live data feed | `imports/lib/publications/foosForBar.ts` **and** `imports/server/publications/foosForBar.ts` | **Add the import to `publications/index.ts`** |
| An always-on data feed | `new DefaultTypedPublication()` | Same registration |
| A helper used by both sides | `imports/lib/foo.ts` | - |
| A helper used only by the server | `imports/server/foo.ts` | Not `imports/server/methods/` unless it *defines a method* |
| A background loop | `imports/server/daemons/foo.ts` | **Add the import to `daemons/index.ts`** |
| A reaction to a domain event | A new `Hookset` in `imports/server/hooks/FooHooks.ts` | Register it in `imports/server/GlobalHooks.ts` |
| An HTTP endpoint | `imports/server/api/resources/foo.ts` (an Express `Router`) | Mount it in `imports/server/api.ts` |
| A static file at the web root | `public/` | - |
| A server-only asset | `private/` | Read with `Assets.absoluteFilePath()` |
| A type declaration for a Meteor package | `types/meteor/<package>.d.ts` | - |
| A unit test | `tests/unit/imports/{lib,server}/foo.ts` | Add to `tests/main.ts`: `import` for lib, `require()` inside `if (Meteor.isServer)` for server |
| An acceptance test | `tests/acceptance/foo.tsx` | Add the import to `tests/main.ts` |
| A design doc | `docs/foo.md` with `files:` and `updated:` front matter | `npm run lint:docs` polices it |
| An npm dependency | `package.json` | `meteor npm install`, not `npm install` |
| A Meteor package | `meteor add <pkg>` | Commit both `.meteor/packages` and `.meteor/versions` |
| A browser-extension feature | `extension/src/` | Separate install and build; see [09-integrations.md](09-integrations.md) |

> **Foot-gun: `imports/server/hooks/Hookset.ts` tells you the wrong path.**
> Its comment says to register in `imports/server/hooks/GlobalHooks.ts`. The file is one level
> up, at `imports/server/GlobalHooks.ts`.

## 6. Naming conventions that carry meaning

- **Method and publication names are wire contracts.** The dotted string
  `"Puzzles.methods.addTag"` is what clients send over DDP. Renaming one breaks any browser tab
  that has not reloaded, which during a hunt is most of them. Treat the string as immutable even
  when you rename the file.
- **Migration files are `<number>-<kebab-case-description>.ts`** and the number is the migration
  version. Never edit a migration that has shipped; add a new one.
- **Models are `PascalCase.ts` named for the collection**, and the underlying MongoDB collection
  name is prefixed `jr_` (`new SoftDeletedModel("jr_puzzles", Puzzle)`).
- **Components are `PascalCase.tsx`**, flat in one directory, with a default export.
- **Hooks are `useThing.ts`**, `.tsx` if they contain JSX.

## 7. Fork lineage

Be careful here. Three different repository URLs appear:

- `package.json` declares `deathandmayhem/jolly-roger`.
- `DEVELOPMENT.md` tells you to clone `Palindrome-Puzzles/jolly-roger`.
- Recent merge commits reference `Palindrome-Puzzles`, and this checkout's `origin` is
  `jimsug/jolly-roger`.

Death and Mayhem wrote the original. Palindrome Puzzles maintains a fork. **Confirm with a
maintainer which repository your work should target before opening a pull request**, because the
documentation does not agree with itself.
