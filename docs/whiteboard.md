---
files:
  - imports/client/components/WhiteboardPage.tsx
  - imports/client/components/tagColors.ts
  - imports/client/components/whiteboard/BoardSearch.tsx
  - imports/client/components/whiteboard/EditPolicyModal.tsx
  - imports/client/components/whiteboard/FeederFocusContext.ts
  - imports/client/components/whiteboard/FrameLabelLayer.tsx
  - imports/client/components/whiteboard/FrameNode.tsx
  - imports/client/components/whiteboard/PuzzleCardNode.tsx
  - imports/client/components/whiteboard/RoundStateContext.ts
  - imports/client/components/whiteboard/ShowOnBoardLink.tsx
  - imports/client/components/whiteboard/WhiteboardEdge.tsx
  - imports/client/hooks/useRoundStates.ts
  - imports/lib/chatMessagePath.ts
  - imports/lib/models/WhiteboardEdges.ts
  - imports/lib/models/WhiteboardNodes.ts
  - imports/lib/models/Whiteboards.ts
  - imports/lib/puzzleTagStatus.ts
  - imports/lib/whiteboard/feederFocus.ts
  - imports/lib/whiteboard/layout.ts
  - imports/lib/whiteboard/limits.ts
  - imports/lib/whiteboard/links.ts
  - imports/lib/whiteboard/minimap.ts
  - imports/lib/whiteboard/rounds.ts
  - imports/lib/whiteboard/search.ts
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
pages leave it out. The board page's tab is titled with the hunt's name, like
the hunt's other pages ("Whiteboard :: <hunt> :: Jolly Roger").

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

## Finding things on the board

### Search

The search field at the start of the toolbar, there on read-only boards too,
finds puzzles by title, answer or tag, using the puzzle list's own matcher
(`compilePuzzleMatcher`) so a search finds the same puzzles in both places. It
also finds frames by the label they show, sticky notes and text boxes by their
contents, and the lines the board is drawing by their label (not a line to a
hidden card, or a feeder arrow the viewer has turned off). `/` or Ctrl+F
(Cmd+F on a Mac) jumps to it while the board has focus, meaning the last press
or focus was on the board; anywhere else, and from the search field itself,
Ctrl+F is the browser's own find.

The results drop down under the field. Arrow keys move through them and Enter
picks one, as does a click. Picking something pans the board to it, zooming in
to at least 0.8 if it's further out, and marks it with a pulse for a couple of
seconds; a line is marked at its middle. A puzzle whose card is hidden, or
that has no card, is listed last as "Not on the board". Picking that row does
nothing; anyone who can edit gets a "Put back" button on it, which puts the
card back at the middle of the screen, so a search never moves a card by
itself. The matching is
`searchBoard` in `imports/lib/whiteboard/search.ts`. Hidden frames and hidden
feeder arrows aren't found, since nothing can put them back yet.

### Links

The board page follows four kinds of link, each of which waits for the board
to load, shows what it names, and is then dropped from the address:

- `?comment=<threadId>` opens a comment thread and pulses its pin. A thread
  that has been deleted gives a notice, "That comment is gone.", rather than
  waiting for ever, and one on something that has been hidden or deleted
  says "That isn't on the board any more." The canvas knows the thread is
  gone once the puzzle page's chat has loaded, which the page tells it through
  `ChatLoadedContext`.
- `?puzzle=<puzzleId>` pans to that puzzle's card and marks it, or says the
  puzzle isn't on the board.
- `?node=<nodeId>` does the same for any node.
- `?v=x,y,zoom` opens the view with board point (x, y) in the middle at that
  zoom. Anything that isn't three numbers on the board (within
  `MAX_COORDINATE`) at a zoom the board allows is ignored and dropped.

A board opened from a link doesn't fit itself to the screen first, so it
doesn't jump twice; if the link names something that isn't there, it fits
then.

The toolbar's link button, "Copy link to here", copies a link to the selected
card (`?puzzle=`), to a selected frame, note or text box (`?node=`), or else
to the current view (`?v=`), for pasting into chat (`boardLinkQuery` in
`imports/lib/whiteboard/links.ts`). Nothing can be selected on a read-only
board, so there it always copies the view.

Elsewhere, the puzzle page has a "Show on board" link beside the bookmark,
and each row of the puzzle list has one too, showing while the row is hovered
or focused (always, on touch screens). Both go to `?puzzle=`, and only show
when the hunt has a board and the whiteboard is on. The puzzle list works
that out once for the page (`HuntHasWhiteboardContext`) rather than in every
row. Double-clicking a card on
the board opens its puzzle, unless something sits on top of it there.

Notifications link the same way, through `chatMessagePath` in
`imports/lib/chatMessagePath.ts`. A ding on a board message opens the board
with chat scrolled to it (`#msg=`); one in a comment thread also opens the
thread (`?comment=`). Messages on the board that go to the hunt's Discord
firehose link there too, rather than to the hidden puzzle, which would only
redirect.

### The mini map

On a wide screen the mini map shows each card in its solvedness colour and
each frame in its colour, faintly, so solved rounds stand out. The card
colours are the theme's `miniMapSolvedness`, stronger than the card
backgrounds so they show at that size, and frames take the strong version of
their colour. Free line ends are left off, and everything else is grey
(`miniMapColor` in `imports/lib/whiteboard/minimap.ts`).

## What cards and rounds show

Everything here is display only: it reads puzzles, tags and the board's
nodes, all already on the client, and writes nothing.

### Cards

A card shows less as the board zooms out (`useWhiteboardDetail`):

- **Full** (zoom 0.6 and up): a lock on a locked puzzle, the Meta or Metameta
  badge, any `needs:` and location (`where:`, `loc:` or `location:`) tags as
  small chips in the puzzle list's tag colours (shared through
  `imports/client/components/tagColors.ts`), then at the right a priority icon (a red double chevron for
  `priority:high`, a single one for `priority:low`), the stuck flag (🤷, for
  `stuck` or `is:stuck`) and the link that opens the puzzle. Below them come
  the title, the answers (or the locked summary), and the people on its call
  or looking at it while it's unsolved and unlocked.
- **Mid** (0.3 to 0.6): the title and answers in larger type. A stuck puzzle's
  card gets a red inner edge, since the flag would be too small to see.
- **Far** (below 0.3): the first answer, or failing that the first word of the
  title.

The badge, icons and chips come from `puzzleStatusFromTags` in
`imports/lib/puzzleTagStatus.ts`, which the puzzle list's rows use too, so the
two agree on which tags make a meta, a priority or a stuck puzzle. The list
leaves those tags out of its chips (`shownAsStatus`).

### Rounds

A frame's header shows "n/m solved" over the cards directly inside it, the
way the puzzle list's group headings count, so a sub-round's cards count in
its own frame and not its parent's. Puzzles with nothing to solve
(`computeSolvedness` says `noAnswers`) count neither way, and a frame with no
solved or unsolved cards in it shows no count. Zoomed right out, the round's label pill shows the
same count.

The rest comes from `roundState` in `imports/lib/whiteboard/rounds.ts`. A
round is a frame with a tag. Its metas are the puzzles tagged `meta-for:X` for
its `group:X` tag, wherever their cards are, which is how feeder arrows pair
them; its feeders are the other puzzles tagged `group:X`.

- **Ready to meta**: every feeder is solved, at least one is, and a meta
  isn't. The header shows a "Ready to meta" badge in the meta badge's colours.
- **Finished**: the round has a meta and every meta is solved, or, with no
  meta, at least one of its cards is solved and none, at any depth, is
  unsolved. Solvedness is `computeSolvedness`, so a locked puzzle with no
  answer and one with an unknown number of answers are both unsolved. Solving
  the meta finishes a round even with feeders left, since that's what closes
  it for a team.

A finished round recedes rather than disappearing: a tick before its label,
"Finished" after it in place of the count (or "Finished, N unsolved" while
cards inside it, counted at any depth, are unsolved), its fill at 20% alpha
instead of 40%, and its label in the secondary text colour. The far-zoom pill
keeps the count and gets the tick and the same grey. In a narrow frame the
count and status are cut short before the round's name is. Nothing else about a finished round changes: its cards,
lines and comments behave as before. `finishedFrames` lists the finished
rounds on a board, for folding them later.

The counts are worked out on the client once per board, in the canvas's
`useTracker` (`useRoundStates` in `imports/client/hooks/useRoundStates.ts`),
reading only the fields they need, so moving a card or renaming a puzzle
doesn't recount. Frame headers and the far-zoom pills read their frame's
state from `RoundStateContext`.

### Feeder arrows

Feeder arrows are thin, grey and at 55% opacity. Hovering or selecting a
meta's card brings its arrows up to full opacity and 2px and fades every other
feeder arrow; hovering a feeder brings out its arrows to its metas the same
way. Hovering a card with no feeder arrows changes nothing. The canvas tracks
the hovered card and passes the cards in focus to the lines through
`FeederFocusContext`; `feederFocus`, `feederArrowEmphasis` and
`feederArrowLook` in `imports/lib/whiteboard/feederFocus.ts` decide which
arrows stand out and how.

### Where metas go on a new board

When a board is created, `seedLayout` puts each round's metas on their own
row (or rows, past four) at the top of its frame, with the feeders starting
on the row below, so the arrows have somewhere to run. A round without a meta
is laid out four to a row as before. This only applies when a board is laid
out: boards that already exist keep their cards where they are, and a puzzle
added later goes in the first free slot of its frame, which may be beside a
meta.

## Flags

- `disable.whiteboard` turns the board off. Creating one, every node and line
  write, new comments, resolving and deleting comments, and policy changes are
  refused; the whiteboard publications return nothing; placement stops; and
  live updates do nothing. The page says the whiteboard is turned off, the
  hunt nav hides its link, and the puzzle page and list hide "Show on board".
  Ordinary chat on the hidden puzzle isn't gated.
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
