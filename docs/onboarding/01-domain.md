---
files:
  - imports/lib/models/Hunts.ts
  - imports/lib/models/Puzzles.ts
  - imports/lib/models/Tags.ts
  - imports/lib/models/Guesses.ts
  - imports/lib/permission_stubs.ts
updated: 2026-09-19
---

# 01. What Jolly Roger is, and the world it lives in

You cannot read this codebase usefully without knowing what a puzzlehunt is. The product's
central design decisions are responses to specific, non-obvious properties of puzzlehunts, and
they look arbitrary until you know what those properties are.

## 1. Puzzlehunts

A **puzzlehunt** is a competition. An organizing team publishes a large set of puzzles, and
competing teams race to solve them. The canonical example, and the one Jolly Roger was built
for, is the **MIT Mystery Hunt**: roughly 150 to 250 puzzles released over a long weekend in
January, solved by teams that can run to several hundred people, most of them remote.

A **puzzle** in this sense is not a crossword with instructions. It is a self-contained artifact
(a grid, a list of song clips, a physical object, a website) with **no stated question**. Working
out what you are meant to do is the puzzle. The output is an **answer**: a short string, almost
always uppercase letters, like `SEMAPHORE` or `BANANA BREAD`.

Two consequences shape everything:

- **Teams are large and distributed.** Dozens of people work on different puzzles at once, in
  different time zones, dipping in and out over three days. Coordination is the actual problem
  Jolly Roger solves. Solving is done by humans; Jolly Roger just makes sure two people do not
  unknowingly duplicate six hours of work.
- **Nobody sleeps.** A tool used continuously for 72 hours by exhausted people has to degrade
  gracefully and never make anyone refresh a page.

### The structure of a hunt

Puzzles are grouped by the organizers into **rounds** (thematic sets, like "the Emotions round").
Each round usually has a **metapuzzle**, universally shortened to **meta**: a puzzle whose inputs
are the *answers to the other puzzles in the round*. The ordinary puzzles feeding a meta are
**feeders**. A **metameta** is a meta whose feeders are themselves metas; hunts are commonly two
or three levels deep.

There are two ways to make progress:

- **Forward-solving**: solve a feeder normally, then use its answer in the meta.
- **Backsolving**: go the other way. Work out the meta's mechanism, deduce what a missing feeder
  answer *must* be, and submit it without ever solving that puzzle.

Jolly Roger records which of these happened, per guess, on a −10 to +10 scale
(`imports/lib/models/Guesses.ts:31-33`). The UI offers five points on that scale, from
Backsolve (−10) to Forwardsolve (+10) (`imports/client/components/PuzzlePage.tsx:3133-3168`).
This is not trivia: it is how a team measures whether its metas are working.

### Unlocking, and submitting answers

Puzzles are **unlocked** progressively: the organizers release new ones as you solve existing
ones. Your team's view of the hunt therefore grows over the weekend.

To submit an answer you **call it in**. Historically this meant telephoning the organizers, who
would **call back** to say whether you were right. Modern hunts use a web form, but the vocabulary
survives, and so does the social problem: a team that submits every plausible three-letter string
annoys the organizers and may be rate-limited or penalized.

Hence the **operator guess queue**, one of Jolly Roger's signature features. Team members submit
guesses into Jolly Roger; a designated team member reviews them and decides what actually gets
called in. This is controlled per-hunt by `Hunts.hasGuessQueue` (`imports/lib/models/Hunts.ts:27`),
and teams that do not want the overhead can turn it off, in which case solvers mark their own
answers directly.

> **Foot-gun: "operator" and "HQ" are different things.**
> **HQ** is the *external* team running the hunt. An **operator** is a *role inside your own team*
> in Jolly Roger, held by whoever is allowed to create puzzles, action guesses, and unlock puzzles
> (`userMayWritePuzzlesForHunt`, `imports/lib/permission_stubs.ts:273-287`). Confusingly, the UI
> labels the operator view "Deputy" (`imports/client/components/PuzzleListPage.tsx:928-935`).
> HQ never touches Jolly Roger.

### Other words you will meet

- **The grid**: hunters' term for the big table of round × puzzle × answer that a team keeps.
  In Jolly Roger the grid is the grouped puzzle list page, plus the tag hover popover that dumps
  tag → (title, answer) rows to the clipboard for pasting into a spreadsheet
  (`imports/client/components/Tag.tsx:283-321`).
- **Administrivia**: the non-puzzle items a team tracks alongside puzzles: "order food",
  "HQ contact number", "team photo at 3pm". These have a reserved tag and are pinned to the top
  of the list.
- **Runaround**: the final physical activity that typically ends a hunt.

## 2. What Jolly Roger does

Jolly Roger is a self-hosted web application that a hunting team runs for itself for the duration
of a hunt. It is not a service; each team deploys its own instance. It was written by the team
**Death and Mayhem** in 2015 for the 2016 Mystery Hunt and has been in production use every
January since.

The feature set, and what each one implies for the code:

| Feature | What it means in the codebase |
| --- | --- |
| A Google Sheet per puzzle, auto-created and auto-shared | A whole Google Drive integration, a document pre-creation pool, and a deployed Google Apps Script. See [09-integrations.md](09-integrations.md). |
| Persistent per-puzzle chat | Its own chat system with a structured (Slate) content model, mentions, and user-configured alert keywords. Not a third-party chat embed. |
| Tag-based hunt structure | No `Round` table. Structure is derived at render time from tag names. See [08-puzzle-logic.md](08-puzzle-logic.md). |
| Viewer tracking ("who is looking at this puzzle") | A presence system that has to work across multiple server processes. |
| Operator guess queue | A guess state machine with side effects into chat and Discord. |
| Announcements | Per-user fan-out so that a user who was asleep still sees it. |
| Audio chat per puzzle | A full WebRTC SFU (mediasoup) whose state is mirrored into MongoDB so it survives across server processes. |
| Everything updates in realtime, always | The reason the app is built on Meteor at all. |

## 3. The design decision that explains the most code

**Jolly Roger has no `Round` model.** This is deliberate and it is the single most important
domain fact in the codebase.

The reasoning, from `README.md`:

> In many hunts, it's not always clear from the beginning what puzzles will be related or may
> contribute to which metapuzzles. Jolly Roger solves this by eschewing a top-down hierarchical
> round structure and instead allowing multiple tags to be applied to each puzzle to construct
> dynamic groupings as you gain more information about the hunt structure over time.

Concretely, a hierarchical `roundId` foreign key fails for four reasons:

1. **Structure is not known up front.** Puzzles arrive one at a time, and which meta a puzzle
   feeds is frequently a mid-hunt discovery. A foreign key forces you to guess wrong, then migrate
   under time pressure at 3am.
2. **A puzzle can belong to several groups at once.** Puzzles that feed two metas are routine.
   Many-to-many is the honest model.
3. **Structure should be inferred, not declared.** Nesting of groups is *derived* from set
   containment of puzzle membership, so tagging one more puzzle reshapes the tree with no schema
   change.
4. **The same mechanism carries everything else.** Priority, physical location, puzzle type,
   "needs extraction", and free-text content tags are all the same list, searchable by the same
   filter box.

So `Puzzles.tags` is an array of tag IDs (`imports/lib/models/Puzzles.ts:11-16`), `Tags` is a
nearly empty document (`{ name, hunt, aliases }`, `imports/lib/models/Tags.ts:7-13`), and **the
colon-prefix convention in the tag name is the schema**. `group:emotions` creates a group;
`meta-for:emotions` marks the puzzle that is the meta for that group.

The full reserved-tag catalogue, and the sorting algorithm that consumes it, are in
[08-puzzle-logic.md](08-puzzle-logic.md). Read that document before you touch anything on the
puzzle list page.

## 4. Who the users are

Three roles, which map onto the permission checks you will see everywhere:

- **Hunter**: an ordinary team member. Can view puzzles in hunts they are a member of, chat,
  submit guesses, edit notes, join calls.
- **Operator**: a per-hunt role. Can create and edit puzzles, action the guess queue, add users,
  post announcements. Checked by `userIsOperatorForHunt` (`imports/lib/permission_stubs.ts`).
- **Admin**: a global role, scoped with `GLOBAL_SCOPE` rather than to a hunt. Can configure the
  server itself: Google credentials, Discord bot, S3, branding. Admins pass every operator check.

A hunt can also grant roles to everyone by default via `Hunts.defaultRoles`, which is how a team
runs "everyone is an operator" if it wants to.

The permission functions all live in `imports/lib/permission_stubs.ts`. Note the directory:
`lib`, not `server`. They are shared so the client can gray out buttons the user cannot use.

> **Foot-gun: client-side permission checks are cosmetic.**
> Anything in `imports/lib/permission_stubs.ts` called from a React component is a UI hint. A
> user can call any method over the WebSocket with any arguments. **Every method and every
> publication must recheck permissions server-side.** See
> [06-methods-and-publications.md](06-methods-and-publications.md).

## 5. The annual rhythm

The MIT Mystery Hunt runs over the Martin Luther King Jr. Day weekend in January. That single fact
explains a lot about the project:

- Development intensity is seasonal. Expect heavy activity in the months before January and a
  quiet middle of the year.
- Reliability requirements are unusual: the app must survive a 72-hour burst of peak load once a
  year, and downtime during that window is very expensive in a way it is not for most software.
- Features get built for one hunt, used hard for three days, and then sit.

This is also why the deployment story (rolling deploys, `runIfLatestBuild`, hot code push that can
be *blocked* while a user is mid-sentence) gets more attention than you would expect in a project
of this size. See [10-operations.md](10-operations.md).
