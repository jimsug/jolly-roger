---
files:
  - package.json
  - biome.jsonc
  - eslint.config.mts
  - eslint/rules/no-disallowed-sync-methods.ts
  - knip.jsonc
  - .stylelintrc
  - .swcrc
  - tests/main.ts
  - tests/check_docs.mts
  - Dockerfile
updated: 2026-09-19
---

# 11. Tooling and tests

Six separate tools check this codebase. That is a lot, and the division of labour is not
obvious, so this document exists mainly to tell you which one is complaining and why.

## 1. The one command

```bash
npm run lint
```

which is:

```
meteor lint && concurrently npm:lint:*
```

The `&&` is load-bearing. `meteor lint` must run first because it is what generates the
TypeScript definitions for Atmosphere packages into `.meteor/local/types/`. Without that,
`tsgo` cannot resolve `meteor/meteor` and reports hundreds of phantom errors.

`concurrently npm:lint:*` then runs all six in parallel.

## 2. What each tool is for

| Script | Tool | Responsible for |
| --- | --- | --- |
| `lint:types` | **tsgo** | Type checking. The single most useful check. |
| `lint:biome` | **Biome** | Formatting **and** most linting: React rules, exhaustive hook dependencies, floating promises, import restrictions |
| `lint:eslint` | **ESLint** | Exactly **one** rule: `jolly-roger/no-disallowed-sync-methods`. It exists because the rule is type-aware and Biome cannot express it. |
| `lint:css` | **Stylelint** | CSS, both `.scss` files and the CSS inside styled-components template literals |
| `lint:knip` | **Knip** | Dead code and unused dependencies |
| `lint:docs` | **check_docs.mts** | Documentation freshness. Repo-specific; see section 5. |

### tsgo

`tsgo` is `@typescript/native-preview`, the native (Go) port of the TypeScript compiler. It is
a drop-in replacement for `tsc --noEmit` and much faster. If you see `tsgo` in an error and
wonder what it is, that is it.

> **Remember: the Meteor build never typechecks.** SWC only strips types. Your app will happily
> run code that does not compile, so `npm run lint:types` is not optional.

### Biome

Biome is formatter and linter in one, a Rust replacement for Prettier plus much of ESLint. The
configuration in `biome.jsonc` is heavily commented with the reasoning behind each override,
and is worth reading once. Highlights:

- **`useExhaustiveDependencies` is configured to understand `useTracker`**, so a missing
  dependency is a CI **error**. See [07-client.md](07-client.md#the-dependency-array-is-enforced).
- **`noFloatingPromises` and `noMisusedPromises` are errors.** In a codebase this async, an
  unawaited promise is a real bug. `void somePromise` is the sanctioned way to say "I mean to
  discard this", which is why `noVoid` is switched off.
- **`noRestrictedImports`** pushes you to deep imports (`react-bootstrap/Button`, not
  `{ Button } from "react-bootstrap"`) to keep the bundle small.
- **`noExplicitAny` is off** and `noNonNullAssertion` is off. Both are used deliberately here.

### ESLint, for one rule

`eslint.config.mts` registers a single custom rule,
`eslint/rules/no-disallowed-sync-methods.ts`, which bans the synchronous Meteor and Model
methods that Meteor 3 replaced with async ones. It is **type-aware**: it asks the TypeScript
checker for the receiver's type and walks its base types, which is why it cannot be a Biome
rule.

It has an **autofixer** (`eslint --fix` rewrites `x.findOne(y)` into `(await x.findOneAsync(y))`)
and is **switched off for `**/client/**`**, where synchronous Minimongo is correct. Note the
glob does not cover `imports/lib/`, so shared code is held to the server standard.

This is the only custom rule, so `eslint/` is a very small directory. It is excluded from the
main TypeScript project and has its own build.

### Stylelint

Runs over `**/*.scss` **and** `**/*.tsx`. The second one is the interesting part: the
`postcss-styled-syntax` custom syntax lets Stylelint parse the CSS inside styled-components
template literals. So your CSS-in-JS is linted like real CSS.

`reportNeedlessDisables` and `reportInvalidScopeDisables` are on, meaning a stale
`stylelint-disable` comment is itself an error.

### Knip

Finds unused files, exports and dependencies. Configured with the four entry points
(`{client,server,tests}/main.ts` plus the Google Apps Script) and a list of dependencies that
only Meteor consumes and so look unused (`@babel/runtime`, `meteor-node-stubs`, `sass`, `aws4`,
`playwright`). If you add a dependency that only Meteor references, add it to
`ignoreDependencies` or CI fails.

The `exports` and `types` rules are currently off, with a TODO noting they may be enabled later
as a dead-code signal.

## 3. The test suite

```bash
npm test
# TEST_BROWSER_DRIVER=playwright meteor test --full-app --once --driver-package meteortesting:mocha
```

`--full-app` means the tests run **against the real application**, fully booted, rather than
against isolated modules. Mocha is the runner; assertions are chai plus chai-as-promised;
the browser is driven by Playwright.

The entry point is `tests/main.ts`, declared as `meteor.testModule` in `package.json`.

### Unit versus acceptance

**Unit tests** live in `tests/unit/`, mirroring the source tree. They cover the genuinely
tricky pure logic: `puzzle-sort-and-group`, `ValidateShape`, the two time formatters, and on
the server side `Model`, `generateJsonSchema`, `validateSchema`, `MigrationRegistry`,
`publishJoinedQuery` and `Flags`. That list is a good map of where the subtle code is.

**Acceptance tests** live in `tests/acceptance/` and render real routes with
`@testing-library/react` against the real server, logging in through real methods.

### The `if (Meteor.isServer) { require(...) }` idiom

`tests/main.ts` looks like this:

```ts
import "./unit/imports/lib/puzzle-sort-and-group";   // shared: a normal import

if (Meteor.isServer) {
  if (!Meteor.isAppTest) throw new Meteor.Error(500, "This code must not run in production");
  Accounts.removeDefaultRateLimit();
  require("./unit/imports/server/Model");            // server-only: require, not import
}
```

**`import` is static and hoisted**, so it would pull server modules into the client bundle
regardless of the `if`. `require()` inside a dead branch is eliminated by the bundler. When
types are needed alongside the require, the house trick is a `typeof import(...)` type
annotation:

```ts
const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
  require("../../imports/server/methods/defineMethod").default;
```

`Meteor.isAppTest` is used as a safety interlock in several places so that destructive test
helpers can never run in production.

### `stabilize()`

The repo's answer to "wait until the reactive system has settled". You will need it in any new
UI test, because a DDP round trip plus a Tracker flush is not something React Testing Library
knows to wait for:

```ts
export const stabilize = async () => {
  await waitForSubscriptions();
  await afterFlush();
};
```

### Adding a route adds a smoke test, for free

`tests/acceptance/smoke.tsx` imports `AuthenticatedRouteList` and `UnauthenticatedRouteList`
from `Routes.tsx`, flattens the nested paths, substitutes fixture values for `:huntId`,
`:puzzleId` and friends, and navigates to each one. Routes with a `:token` parameter are
skipped.

So a new route is automatically smoke-tested. It also means a new route that crashes on load
breaks CI, which is the intent.

### Writing a test

- **Unit test:** add `tests/unit/imports/lib/yourThing.ts`, then register it in `tests/main.ts`:
  a plain `import` for shared code, a `require()` inside the `Meteor.isServer` block for
  server-only code.
- **Acceptance test:** add `tests/acceptance/yourThing.tsx`, register it in `tests/main.ts`,
  use `stabilize()` after anything that triggers a subscription or a method call, and use
  `tests/lib/resetDatabase.ts` for isolation.

## 4. CI

Two workflows, and they do different things.

**`.github/workflows/build.yml`** runs on pushes to `main`, on version tags, and on every pull
request. It builds the Docker image's `test` stage and runs `meteor npm run lint && meteor npm run test`
inside it, then builds production images for `linux/amd64` and `linux/arm64` in parallel and
pushes them to ghcr.io.

It also enables **problem matchers** (`.github/problem-matchers/{tsc,eslint,stylelint}.json`),
which is what turns tool output into inline annotations on the pull request diff.

**`.github/workflows/deploy.yml`** runs on pushes to `main` and on tags. It does a plain
`meteor build` on Node 20.19.5, scps the tarball to a VPS, and restarts it. This is a
single-host deploy, not a rolling one.

> **Two defects worth knowing about `deploy.yml`:**
> 1. It hardcodes `release=3.3.2` when installing Meteor, while the `Dockerfile` parses the
>    version out of `.meteor/release`. The next Meteor bump will silently skew the two.
> 2. Its `paths-ignore` is `"extensions/**"`, but the directory is `extension/`, singular. The
>    filter therefore never matches, so extension-only changes still trigger a full deploy.
>
> Note also that `deploy.yml` has no `needs:` key, so it does **not** wait for `build.yml`'s
> lint and test job. A push to `main` deploys whether or not the tests passed.

**`.github/workflows/build-extension.yml`** builds the browser extension, which is a separate
project.

## 5. The documentation freshness check

This is unusual and worth understanding, because it will fail your pull request in a way no
other repository does.

Every markdown file under `docs/` must carry YAML front matter with two fields:

```yaml
---
files:
  - imports/lib/models/Puzzles.ts
  - imports/lib/puzzle-sort-and-group.ts
updated: 2026-09-19
---
```

`tests/check_docs.mts` then, for each doc, finds the last commit that touched the doc and asks
git whether any listed file has been changed **since** that commit. If so, the doc is out of
date and CI fails.

To fix a failure, either update the doc, or, if no change is genuinely needed, bump the
`updated:` date, which brings the doc's last commit forward past the file changes.

Two consequences:

- **Listing a file in `files:` is a commitment.** Only list files whose change genuinely
  invalidates the document. A doc that lists fifty files will fail constantly.
- **`README.md` and `DEVELOPMENT.md` are not covered**, because the checker only walks `docs/`.
  This is precisely why they have drifted; see
  [02-getting-started.md](02-getting-started.md#7-known-stale-documentation).

## 6. Pre-push checklist

```bash
npm run lint:types     # fastest useful signal
npm run lint           # everything, in parallel
npm test               # slower; run it before anything non-trivial
```

If `lint:eslint` complains about a synchronous method, `npx eslint --fix` will very likely fix
it for you.
