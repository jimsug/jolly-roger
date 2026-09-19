---
files:
  - DEVELOPMENT.md
  - package.json
  - .meteor/release
  - Dockerfile
  - imports/server/setup.ts
  - imports/server/makeFixtureHunt.ts
updated: 2026-09-19
---

# 02. Getting it running

## 1. Prerequisites

You need **Meteor**, and Meteor brings its own Node and its own npm. Install it from
<https://www.meteor.com/install>.

> **Foot-gun: `DEVELOPMENT.md` is wrong about versions.**
> It says the app is Meteor v2 and requires Node v14. Both statements are stale and following
> them will waste your day.
>
> | `DEVELOPMENT.md` says | Reality | Evidence |
> | --- | --- | --- |
> | Meteor v2 | Meteor 3.3.2 | `.meteor/release` |
> | Node v14 | Node 20 (deploy) / Node 22 (Docker image) | `.github/workflows/deploy.yml:29`, `Dockerfile:144` |
> | `$CLUSTER_WORKERS_COUNT` comes from `meteorhacks:cluster` | That package is not installed; the feature is local code in `imports/server/loadBalance.ts` | `.meteor/packages` |
>
> The difference matters: Meteor 3 removed Fibers and made the whole server-side database API
> asynchronous. Almost every "how do I do X in Meteor" answer you find online predates this.
> See [03-meteor-primer.md](03-meteor-primer.md#6-meteor-3-and-the-async-rule).

You do **not** need MongoDB installed. `meteor run` starts a private MongoDB inside
`.meteor/local/db` for you.

## 2. First run

```bash
git clone https://github.com/deathandmayhem/jolly-roger
cd jolly-roger
meteor npm install
meteor
```

That serves the app on <http://localhost:3000>.

> **Foot-gun: use `meteor npm`, never bare `npm`.**
> `meteor npm` and `meteor node` invoke the Node that Meteor bundles. This is not pedantry:
> `mediasoup` is a native addon compiled against a specific Node ABI, so installing with the
> wrong Node produces a package that fails to load at server start.

The first run is slow. Meteor is downloading its release, building both bundles, and generating
TypeScript definitions for every Atmosphere package.

> **Foot-gun: your editor will show hundreds of errors until the first build finishes.**
> All the `meteor/*` type definitions are *generated* by the `zodern:types` package into
> `.meteor/local/types/`, which is git-ignored. Until Meteor has built once, every
> `import { Meteor } from "meteor/meteor"` is an unresolved module. This is also why
> `package.json`'s lint script is `meteor lint && concurrently npm:lint:*`, and the `&&` ordering
> is load-bearing, because `tsgo` cannot typecheck before those definitions exist.

## 3. Bootstrapping an instance

A fresh database has no users and no hunts. Two steps get you to a usable state.

### 3.1 Create the admin account

Load <http://localhost:3000>. Because the database has no users, the app shows a
first-user form instead of a login form. Whoever fills it in is created with the global
`admin` role and logged in. (The "are there any users yet" signal is pushed to the client
from `imports/server/setup.ts` as a pseudo-collection; see
[07-client.md](07-client.md#pseudo-collections).)

### 3.2 Load the sample hunt

Jolly Roger ships a fixture derived from the 2018 MIT Mystery Hunt so you can see a
populated UI rather than an empty one. It is built by `imports/server/makeFixtureHunt.ts`.

If you have no hunts yet, the homepage shows a **"Create sample hunt"** button. Otherwise,
open the **browser** JavaScript console and run:

```js
Meteor.call("Hunts.methods.createFixture");
```

Note "browser console", not the Meteor shell. You should get a hunt named
"Mystery Hunt 2018".

This is the single most valuable thing you can do on day one. The puzzle list page is almost
meaningless with three puzzles and immediately legible with two hundred.

## 4. What works without third-party credentials

Jolly Roger integrates with Google, Discord and AWS S3. **None of them is required for local
development**, but it is worth knowing in advance what will be missing, so you do not spend an
hour debugging a feature that is simply switched off.

| Integration | Without credentials | Configured by |
| --- | --- | --- |
| Google Drive / Sheets | Puzzles are created fine, but have no spreadsheet. The document pane is empty. | Server setup page, Google section |
| Google OAuth ("link your Google account") | Button absent | Server setup page |
| Discord bot and OAuth | No relaying, no role grants, no account linking. Everything else works. | Server setup page, Discord section |
| S3 image uploads | Image upload UI is hidden (`isS3Configured`) | Server setup page, AWS section |
| WebRTC audio calls | Works locally without a TURN server; TURN only matters across restrictive networks | `$TURN_SERVER` env vars |
| Email (signup, password reset) | No mail is sent. Meteor logs the message to the server console instead. | `$MAIL_URL` |

Everything central to the product (puzzles, tags, grouping, chat, guesses, presence,
announcements, notifications) works with no external service at all.

Configuration lives on the **Server setup** page, reachable from the user menu in the top right
once you are an admin. That page walks you through generating each set of credentials. Settings
are stored in the `Settings` collection, not in environment variables or a config file.

## 5. The commands you will actually use

| Command | What it does |
| --- | --- |
| `meteor` | Run the dev server with hot code push on <http://localhost:3000> |
| `meteor --port 4000` | Same, different port (there is no `$PORT` in dev) |
| `meteor npm install` | Install npm dependencies with Meteor's bundled npm |
| `npm run lint` | The whole lint stack. Run this before pushing. |
| `npm run lint:types` | Just the typechecker (`tsgo`), and the fastest useful check |
| `npm test` | The full test suite, in a real browser via Playwright |
| `meteor shell` | A Node REPL attached to the running **server** process |

See [11-tooling-and-tests.md](11-tooling-and-tests.md) for what each of the six lint tools is
responsible for, because the division of labour is not obvious.

> **Foot-gun: type errors do not stop `meteor run`.**
> Meteor's build only *strips* TypeScript types (via SWC); it never typechecks. Your app will
> happily run with code that does not compile. `tsgo` is a separate pass. Get into the habit of
> running `npm run lint:types` before you believe anything works.

## 6. Debugging tools worth knowing on day one

Two of these are genuinely undiscoverable and save a lot of time.

**The model facades.** In the browser console:

```js
await window.loadFacades();
Models.Puzzles.find({}).count();
Models.Puzzles.findOne({ title: /Semaphore/ });
```

`window.loadFacades()` dynamically imports every model and exposes them as `Models`. This lets
you inspect the client's Minimongo cache directly, which answers the single most common
question in Meteor debugging: *"is the data not arriving, or is the component not rendering
it?"* If the document is in Minimongo, it is a UI bug; if it is not, it is a publication bug.

On the **server**, the same facade is installed as a global by `server/main.ts`, so
`meteor shell` gives you:

```js
await Models.Puzzles.findOneAsync({});
```

Note the `Async`: on the server, everything is async. See
[03-meteor-primer.md](03-meteor-primer.md#6-meteor-3-and-the-async-rule).

**Tracing.** `window.loadFacades()` also exposes `window.Tracing`. See
[10-operations.md](10-operations.md) for the observability surfaces.

## 7. Known stale documentation

Collected here so you do not trust the wrong thing. Each is verified against the code.

| Document | Claim | Reality |
| --- | --- | --- |
| `DEVELOPMENT.md:3` | "Meteor web framework (v2)" | `.meteor/release` says `METEOR@3.3.2` |
| `DEVELOPMENT.md:42-48` | Requires Node v14 | Meteor 3 requires Node 20+; production runs 20/22 |
| `DEVELOPMENT.md:69-70` | `$CLUSTER_WORKERS_COUNT` is `meteorhacks:cluster` | Local reimplementation in `imports/server/loadBalance.ts` |
| `DEVELOPMENT.md:11` | Clone from `Palindrome-Puzzles/jolly-roger` | `package.json:8` says `deathandmayhem/jolly-roger`. Fork lineage; confirm with a maintainer which to target. |
| `imports/server/withLock.ts:12` | Mentions SimpleSchema | SimpleSchema is gone; validation is zod |
| `.meteorignore` | Justified by `eslint-import-resolver-typescript` | No longer a dependency |
| `tsconfig.json:36` | Excludes `./packages/**` | There is no `packages/` directory |
| `imports/client/components/TagList.tsx:84` | Comment says `"meta:*"` | There is no `meta:` prefix; it means `meta-for:` |

`README.md` and `DEVELOPMENT.md` are **not** covered by the docs freshness check
(`tests/check_docs.mts` only walks `docs/`), which is precisely why they have drifted.

One document that *is* covered is also currently failing that check: `docs/google-drive.md` was
last committed on 2025-12-30, but three files listed in its front matter
(`imports/server/gdrive.ts`, `imports/server/gdriveActivityFetcher.ts`,
`imports/server/addUserToHunt.ts`) have changed since. So `npm run lint:docs` reports it as out
of date. Someone needs to decide whether the content needs updating or whether bumping the
`updated:` date is enough; do not bump it blindly, because that asserts the document is still
accurate.
