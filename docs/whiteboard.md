---
files:
  - imports/client/components/WhiteboardPage.tsx
  - imports/client/components/whiteboard/EditPolicyModal.tsx
  - imports/lib/models/WhiteboardEdges.ts
  - imports/lib/models/WhiteboardNodes.ts
  - imports/lib/models/Whiteboards.ts
  - imports/lib/whiteboard/limits.ts
  - imports/methods/setWhiteboardEditPolicy.ts
  - imports/server/methods/setWhiteboardEditPolicy.ts
  - imports/server/models/WhiteboardPresence.ts
  - imports/server/whiteboard.ts
  - imports/server/whiteboardEdits.ts
  - imports/server/whiteboardLive.ts
  - imports/server/whiteboardPolicy.ts
  - imports/server/whiteboardShared.ts
updated: 2026-10-04
---

# Hunt Whiteboard

Each hunt can have one shared whiteboard, at `/hunts/:huntId/whiteboard`. It
starts as a map of the hunt: a frame for each round, a card for each puzzle in
its round's frame, and an arrow from each feeder to its meta. People add
sticky notes, text, their own frames, lines and freehand ink on top, pin
comment threads to anything on it, and see each other's cursors move.

An operator creates the board (`ensureWhiteboard` in
`imports/server/whiteboard.ts`), which lays out every puzzle in the hunt. An
archived hunt can't get a new board. From then on, puzzle hooks place each new
puzzle, and move a card when its tags change, unless someone has moved that
card by hand. Placement takes the
`whiteboard:<boardId>` lock, so a burst of new puzzles can't land in the same
slot.

The board's chat and call belong to a hidden puzzle (`kind: "whiteboard"`)
created with the board. Comment threads are chat messages on that puzzle, so
they also show in the board's chat. Most puzzle methods refuse the hidden
puzzle (`assertNotWhiteboardPuzzle`), and the puzzle list, tags and notes
pages leave it out.

## Who may edit and comment

Everything the board allows comes from one pure helper, `whiteboardAccess` in
`imports/lib/permission_stubs.ts`. The server's method gates, the live channel,
the client's toolbar and the comment panel all call it, so they can't
disagree. It returns one of four levels, checked in this order:

| Condition | Access | Reason |
|---|---|---|
| no user or hunt, or the user isn't in the hunt | `none` | |
| the hunt is archived | `view` | `archived` |
| the board's edit policy leaves the user out | `comment` | the policy |
| otherwise | `edit` | |

`edit` includes commenting, and `comment` includes viewing. Admins pass every
policy, but like everyone else they have to be in the hunt: every whiteboard
publication is for members only, so a gate that let a non-member admin through
would let them write to a board they can't see.

### The edit policy

The policy lives on the board document, as `editPolicy` and `editors`. It isn't
a hunt setting because `Hunts.methods.update` is for admins only, and because
every logged-in user receives every hunt document, which would leak the list
of names. The board is only published to the hunt's members.

- `members` (or unset, which is every board until someone changes it): everyone
  in the hunt edits.
- `operators`: operators and admins edit; everyone else comments.
- `operatorsAndEditors`: as `operators`, plus the people listed in `editors`.

`editors` is kept when the policy moves to another tier, so switching back
doesn't lose the list, but it only counts under `operatorsAndEditors`. On a
hunt whose default roles include operator, every member is an operator, so
every tier lets everyone edit. The dialog says so.

`Whiteboards.methods.setEditPolicy` (logic in
`imports/server/whiteboardPolicy.ts`) changes the policy. Only the hunt's
assigned operators and admins may call it (`userMayMakeOperatorForHunt`): an
operator role that comes from the hunt's default roles doesn't count, or on
such a hunt any member could lock everyone else out. It refuses archived
hunts. The list is deduped, capped at `MAX_WHITEBOARD_EDITORS`, and filtered to
current members of the hunt on every save, whichever tier is chosen. People who
have left are dropped rather than refused, so an operator can always save. A
listed person who leaves the hunt gains nothing in the meantime, since
`whiteboardAccess` checks membership first.

Comments are a member's right whatever the policy: anyone in the hunt can
start a thread, reply, react, resolve and reopen. Deleting a thread is for its
author, until someone else posts a reply that isn't a reaction, and for
operators at any time.

Placement doesn't follow the board's policy. Cards go where their tags say,
so someone who can't edit the board still moves a card by retagging its
puzzle, as the puzzle permissions allow.

### On the server

`imports/server/whiteboardShared.ts` holds the gates:

- `loadBoardAccess` checks the `disable.whiteboard` flag, finds the board,
  loads the caller and checks they're in the hunt, loads the hunt, and works
  out their access. The one read of the caller serves both checks.
- `assertMayCommentOnBoard` refuses a board that is only `view` (an archived
  hunt). New comments, replies in a thread, resolving and deleting go through
  it.
- `assertMayEditBoard` also refuses anything below `edit`. Every node and line
  write goes through it.

Each method call reads the board, hunt and user afresh, so a change to the
policy, the hunt or someone's roles applies from the next call. A call that
was already past the gate finishes.

Of the other whiteboard modules it imports only `whiteboard.ts`, which
imports none of them, and the rest import it, so there's no import cycle
among them. It also holds the helpers more than one of them
needs, such as the coordinate checks and `detachComments`.

### The live channel

Cursors, drags and half-drawn strokes travel through
`Whiteboards.methods.setLive` (`imports/server/whiteboardLive.ts`) several
times a second per person, so each connection remembers what its user may do
on each board instead of reading it on every call. That memory is dropped as
soon as anything that would change the answer changes:

- each server process observes every board's `editPolicy` and `editors`, and
  every hunt's `isArchived` and `defaultRoles`, from startup;
- each connection observes its own user's `roles` and `hunts` from its first
  live update until it closes, and drops everything it remembers when
  someone else logs in on it;
- `setEditPolicy` also drops the board's entries in its own process at once.

With the oplog these observers hear of a change within about a second, and
without it within Meteor's ten-second poll. The 60-second TTL is only a
backstop. A check that was reading when its answer was dropped doesn't keep
what it read.

People who can comment but not edit still send their cursor. Their drags and
strokes are stored as null rather than refused, since a refusal would come back
every 100ms; anyone outside the hunt is refused as before. When a policy change
takes edit rights away, `setEditPolicy` clears the drags and strokes of anyone
on the board who lost them.

### On the client

`WhiteboardPage` works out the viewer's access with `whiteboardAccess` and
passes it to the canvas, which treats anything below `edit` as read-only and
anything from `comment` up as able to comment. Below the desktop breakpoint
the page lowers `edit` to `comment` with the reason `narrow`. That is a layout
choice, not a security boundary, and the server never sees it.

A read-only board's toolbar says "Viewing only", gives the reason on the line
below, and keeps the Comment tool for anyone who can comment. When the
viewer's edit rights come or go while the board is open, a notice says so,
and a note being edited closes without saving. A screen narrowing past the
breakpoint isn't announced, and text being typed then is saved, since the
server still takes it.

On a hunt with no board, operators get a button to create one, unless the
hunt is archived. Assigned operators and admins get a "Who can edit" button
on the toolbar, whose title names the current policy. It opens
`EditPolicyModal`, which picks people from the hunt's display names and stays
open until a save comes back.

## Flags

- `disable.whiteboard` turns the board off. Creating one, every node and line
  write, new comments, resolving and deleting comments, and policy changes are
  refused; the whiteboard publications return nothing; placement stops; and
  live updates do nothing. The page says the whiteboard is turned off and the
  hunt nav hides its link. Ordinary chat on the hidden puzzle isn't gated.
- `disable.whiteboard_live` turns off cursors, live drags and strokes: the
  presence publication returns nothing and `setLive` does nothing.

There is no flag for the edit policy: `members` is already the off position.

## Data model

- `Whiteboards` (`jr_whiteboards`): one per hunt (a unique `hunt` index), with
  the hidden puzzle in `puzzle`, and the optional `editPolicy` and `editors`.
- `WhiteboardNodes` (`jr_whiteboard_nodes`): cards, frames, sticky notes, text,
  ink segments and the free ends of lines. A node inside a frame has `parent`
  set and a position relative to it. `hidden` marks a card or seeded frame
  someone removed, so placement doesn't put it back; `manual` marks a node
  someone has moved, so placement leaves it alone. `contributors` records who
  wrote or restyled it.
- `WhiteboardEdges` (`jr_whiteboard_edges`): lines between nodes. Feeder arrows
  are `auto`, with `feeder` and `meta` puzzle ids, and follow the puzzles'
  tags.
- `WhiteboardPresence` (`jr_whiteboard_presence`, server only): one document
  per connection per board, with the cursor, drag and stroke. It goes when the
  connection closes, the presence subscription stops or its server dies.
- Comments are `ChatMessages` on the hidden puzzle with a `comment` anchor
  (`node`, `x`, `y`, and `resolvedAt` and `resolvedBy` once resolved). Replies
  carry `thread`, the root's id.

The server enforces the limits in `imports/lib/whiteboard/limits.ts` (batch
sizes, nodes and lines per board, text lengths, ink points, coordinate range,
frame depth, the edit list), and the client keeps to the ones it can. Purging
a hunt removes all four collections, and merging users carries `createdBy`,
`contributors` and the `editors` list over to the merged account and drops the
source account's presence.
