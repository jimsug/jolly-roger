---
files:
  - DEVELOPMENT.md
  - README.md
updated: 2026-09-19
---

# Jolly Roger: a new developer's guide

This directory is a guided introduction to the Jolly Roger codebase for a developer who
is new to it. It assumes you can program and can read TypeScript, but it assumes **nothing**
about Meteor, about MongoDB, about WebRTC, or about puzzlehunts. Every framework-specific
and domain-specific idea is explained where it first matters.

The rest of `docs/` is reference material for people who already know their way around.
This directory is the on-ramp.

## Why you need a guide at all

Most web apps can be learned by opening the router and following the code. Jolly Roger
resists that for three reasons, and the guide is organized around them.

1. **Meteor is not Express + React.** There is no REST API behind the UI. The browser holds a
   live replica of a subset of the database, kept in sync over a persistent WebSocket, and
   React re-renders when that replica changes. If you look for `fetch()` calls you will not
   find the data flow. See [03-meteor-primer.md](03-meteor-primer.md).
2. **Almost nothing calls the framework directly.** The repo wraps Meteor's primitives in
   its own typed layers (`Model`, `TypedMethod`, `TypedPublication`), and registers everything
   through hand-maintained index files. Code that is not imported by one of those index files
   does not exist at runtime, silently. See [04-codebase-map.md](04-codebase-map.md).
3. **The product's core abstraction is a string convention.** Hunt structure is not modeled with
   tables and foreign keys; it is inferred at render time from tag names like `group:emotions`
   and `meta-for:emotions`. See [08-puzzle-logic.md](08-puzzle-logic.md).

## The documents

Read in order if you have the time. The numbering is a suggested sequence, not a hierarchy.

| # | Document | What it covers |
| --- | --- | --- |
| 01 | [What Jolly Roger is](01-domain.md) | Puzzlehunts, the MIT Mystery Hunt, what the product does and for whom |
| 02 | [Getting it running](02-getting-started.md) | Local setup, sample data, what works without third-party credentials |
| 03 | [Meteor primer](03-meteor-primer.md) | DDP, Minimongo, Tracker, Methods, Publications, and Meteor 3's async rules |
| 04 | [Codebase map](04-codebase-map.md) | Directory layout, load order, the client/server/lib split, where things go |
| 05 | [The data layer](05-data-layer.md) | `Model`, zod schemas, soft deletion, the collection catalogue, migrations |
| 06 | [Methods and publications](06-methods-and-publications.md) | How writes and reactive reads work, and how permissions are enforced |
| 07 | [The client](07-client.md) | React bootstrap, routing, data access hooks, styling, `PuzzlePage` tour |
| 08 | [Puzzle logic](08-puzzle-logic.md) | Tags, groups, metas, sorting, solvedness, the guess queue |
| 09 | [Integrations](09-integrations.md) | Google Drive, Discord, WebRTC audio, S3, the HTTP API, the browser extension |
| 10 | [Operations](10-operations.md) | Startup, migrations, multi-process, deploys, logging, debugging |
| 11 | [Tooling and tests](11-tooling-and-tests.md) | The six-tool lint stack, the test suite, CI |
| 12 | [Recipes](12-recipes.md) | Step-by-step: add a field, a method, a publication, a page, a migration |
| 13 | [Walkthroughs](13-walkthroughs.md) | End-to-end traces of the important flows, with diagrams |
| — | [Glossary](GLOSSARY.md) | Every term, domain and technical, in one place |

## Reading paths

**"I have an hour."**
[01-domain.md](01-domain.md), then [03-meteor-primer.md](03-meteor-primer.md) sections 1 to 4, then
skim [04-codebase-map.md](04-codebase-map.md).

**"I have a day and I want to ship something small."**
[02-getting-started.md](02-getting-started.md) to get it running, then
[03-meteor-primer.md](03-meteor-primer.md), then the relevant recipe in
[12-recipes.md](12-recipes.md). Keep [GLOSSARY.md](GLOSSARY.md) open.

**"I have been handed a bug on the puzzle page."**
[08-puzzle-logic.md](08-puzzle-logic.md), then the `PuzzlePage` tour in
[07-client.md](07-client.md), then the relevant walkthrough in
[13-walkthroughs.md](13-walkthroughs.md).

**"I am on call and something is broken in production."**
[10-operations.md](10-operations.md), specifically the debugging order and the
browser-console facades.

## Conventions used here

- File references are repo-relative and usually carry a line number, like
  `imports/lib/models/Puzzles.ts:20`. Line numbers were accurate at the time of writing and
  will drift; the surrounding symbol name is the durable part.
- Blocks marked **Foot-gun** are things that have a good chance of costing you an afternoon.
- Blocks marked **Why** explain a design decision, because several of the choices here look
  strange until you know what they are avoiding.
- Where the guide disagrees with an older document in the repo, the guide says so explicitly
  and cites the code. Several older documents are out of date; see
  [02-getting-started.md](02-getting-started.md#7-known-stale-documentation).
