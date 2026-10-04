---
files:
  - imports/client/chatEditorContent.ts
  - imports/client/components/ChatMessageReactions.tsx
  - imports/client/components/HighlightsPanel.tsx
  - imports/client/components/WhiteboardPage.tsx
  - imports/client/components/tagColors.ts
  - imports/client/components/whiteboard/BoardSearch.tsx
  - imports/client/components/whiteboard/CollapseContext.ts
  - imports/client/components/whiteboard/CommentComposer.tsx
  - imports/client/components/whiteboard/CommentLayer.tsx
  - imports/client/components/whiteboard/CommentList.tsx
  - imports/client/components/whiteboard/CommentPanel.tsx
  - imports/client/components/whiteboard/EditPolicyModal.tsx
  - imports/client/components/whiteboard/EditableText.tsx
  - imports/client/components/whiteboard/FeederFocusContext.ts
  - imports/client/components/whiteboard/FrameLabelLayer.tsx
  - imports/client/components/whiteboard/FrameNode.tsx
  - imports/client/components/whiteboard/HistoryPanel.tsx
  - imports/client/components/whiteboard/InkNode.tsx
  - imports/client/components/whiteboard/LockBadge.tsx
  - imports/client/components/whiteboard/LockLayoutButtons.tsx
  - imports/client/components/whiteboard/NodeChrome.tsx
  - imports/client/components/whiteboard/NodeHandles.tsx
  - imports/client/components/whiteboard/PeopleContext.ts
  - imports/client/components/whiteboard/PuzzleCardNode.tsx
  - imports/client/components/whiteboard/ResetLayoutModal.tsx
  - imports/client/components/whiteboard/RoundStateContext.ts
  - imports/client/components/whiteboard/ShowOnBoardLink.tsx
  - imports/client/components/whiteboard/WhiteboardCanvas.tsx
  - imports/client/components/whiteboard/WhiteboardEdge.tsx
  - imports/client/components/whiteboard/boardWrites.ts
  - imports/client/hooks/useChatImageUpload.ts
  - imports/client/hooks/useKeyboardInset.ts
  - imports/client/hooks/usePuzzleViewers.ts
  - imports/client/hooks/usePuzzleViewerUsers.ts
  - imports/client/hooks/useRoundStates.ts
  - imports/client/hooks/useTagSynonyms.ts
  - imports/client/hooks/useWhiteboardSync.ts
  - imports/client/hooks/useWhiteboardUndo.ts
  - imports/lib/chatMessagePath.ts
  - imports/lib/models/WhiteboardEdges.ts
  - imports/lib/models/WhiteboardNodes.ts
  - imports/lib/models/WhiteboardVersions.ts
  - imports/lib/models/Whiteboards.ts
  - imports/lib/permission_stubs.ts
  - imports/lib/puzzleTagStatus.ts
  - imports/lib/puzzleViewers.ts
  - imports/lib/tagNames.ts
  - imports/lib/whiteboard/collapse.ts
  - imports/lib/whiteboard/comments.ts
  - imports/lib/whiteboard/feederFocus.ts
  - imports/lib/whiteboard/layout.ts
  - imports/lib/whiteboard/limits.ts
  - imports/lib/whiteboard/links.ts
  - imports/lib/whiteboard/minimap.ts
  - imports/lib/whiteboard/reset.ts
  - imports/lib/whiteboard/rounds.ts
  - imports/lib/whiteboard/search.ts
  - imports/lib/whiteboard/undo.ts
  - imports/lib/whiteboard/versions.ts
  - imports/methods/fetchWhiteboardVersion.ts
  - imports/methods/placeWhiteboardCardsByTags.ts
  - imports/methods/resetWhiteboardLayout.ts
  - imports/methods/restoreWhiteboardItems.ts
  - imports/methods/restoreWhiteboardVersion.ts
  - imports/methods/setWhiteboardEditPolicy.ts
  - imports/methods/setWhiteboardLayoutLocked.ts
  - imports/methods/upsertWhiteboardEdges.ts
  - imports/methods/upsertWhiteboardNodes.ts
  - imports/server/daemons/whiteboardVersions.ts
  - imports/server/methods/fetchWhiteboardVersion.ts
  - imports/server/methods/placeWhiteboardCardsByTags.ts
  - imports/server/methods/resetWhiteboardLayout.ts
  - imports/server/methods/restoreWhiteboardItems.ts
  - imports/server/methods/restoreWhiteboardVersion.ts
  - imports/server/methods/setWhiteboardEditPolicy.ts
  - imports/server/methods/setWhiteboardLayoutLocked.ts
  - imports/server/models/WhiteboardPresence.ts
  - imports/server/models/WhiteboardVersionChunks.ts
  - imports/server/publications/whiteboardVersions.ts
  - imports/server/tagSynonyms.ts
  - imports/server/whiteboard.ts
  - imports/server/whiteboardEdits.ts
  - imports/server/whiteboardLive.ts
  - imports/server/whiteboardPolicy.ts
  - imports/server/whiteboardReset.ts
  - imports/server/whiteboardShared.ts
  - imports/server/whiteboardVersions.ts
  - imports/server/withLock.ts
updated: 2026-10-05
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
card by hand (Place by tags and Reset layout hand it back to placement).
Placement takes the `whiteboard:<boardId>` lock, so a burst of new puzzles
can't land in the same slot.

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
anything from `comment` up as able to comment. On a phone (see Phones) the
page lowers `edit` to `comment` with the reason `narrow`. That is a layout
choice, not a security boundary, and the server never sees it. While Meteor
is disconnected the page also lowers any access to `view`, with the reason
`offline` (see Offline).

A read-only board's toolbar says "Viewing only", gives the reason on the line
below, and keeps the Comment tool for anyone who can comment, and the
Comments button (see Comments) for everyone. When the
viewer's edit rights come or go while the board is open, a notice says so,
and a note being edited closes, keeping what was typed as "Not saved" until
it can be retried (see When a save is refused). A window becoming
phone-sized isn't announced, and text being typed then is saved, since the
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
(`compilePuzzleMatcher`, with the same tag synonyms) so a search finds the same
puzzles in both places. It also finds frames by the label they show, sticky
notes and text boxes by their contents, and the lines the board draws by
their label, including those inside a collapsed frame (not a line to a
hidden card, or a feeder arrow the viewer has turned off). `/` or Ctrl+F (Cmd+F on a Mac) jumps to it while the board has
focus, meaning the last press or focus was on the board; anywhere else, and
from the search field itself, Ctrl+F is the browser's own find.

The results drop down under the field. Arrow keys move through them and Enter
picks one, as does a click. Picking something pans the board to it, zooming in
to at least 0.8 if it's further out, and marks it with a pulse for a couple of
seconds; a line is marked at its middle. Something inside a collapsed frame,
or a line with an end inside one, opens the frame for this viewer first (see
Collapsed rounds) and is shown once it's drawn. A puzzle whose card is hidden, or
that has no card, and a round's frame that someone removed, are listed last
as "Not on the board". Picking that row does nothing; anyone who can edit gets
a "Put back" button on it, which puts the card or frame back at the middle of
the screen, so a search never moves anything by itself. The matching is
`searchBoard` in `imports/lib/whiteboard/search.ts`. Hidden feeder arrows
aren't found; the "Not on the board" panel lists them.

### Links

The board page follows four kinds of link, each of which waits for the board
to load, shows what it names, and is then dropped from the address:

- `?comment=<threadId>` opens a comment thread and pulses its pin. A thread
  that has been deleted gives a notice, "That comment is gone.", rather than
  waiting for ever, and one on something that has been hidden or deleted
  says "That isn't on the board any more." The canvas knows the thread is
  gone once the puzzle page's chat has loaded, which the page tells it through
  `ChatLoadedContext`. A thread on something inside a collapsed frame opens
  the frame for this viewer first (see Collapsed rounds), and so does "Show
  on board" from chat.
- `?puzzle=<puzzleId>` pans to that puzzle's card and marks it, or says the
  puzzle isn't on the board.
- `?node=<nodeId>` does the same for any node. Either opens any collapsed
  frame the node is in for this viewer first, as picking it in the search
  does.
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

Except on a phone (see Phones), the mini map shows each card in its solvedness colour and
each frame in its colour, faintly, so solved rounds stand out. The card
colours are the theme's `miniMapSolvedness`, stronger than the card
backgrounds so they show at that size, and frames take the strong version of
their colour. Free line ends are left off, and everything else is grey
(`miniMapColor` in `imports/lib/whiteboard/minimap.ts`).

## Comments

### Unread comments and the Comments panel

A thread is unread when someone else has written in it since this viewer
last opened it. That is kept per device, in local storage, as before; the
viewer's own messages never count. The Comment tool carries a badge with the
number of unread threads. On a board the viewer can only view (an archived
hunt, or while offline) there's no Comment tool, so the Comments button
carries it instead.

The toolbar's Comments button opens a panel in the same place as the "Not on
the board" and History panels, so only one of them shows at a time. It lists the board's
threads with unread ones first and then the most recent activity first,
leaving out resolved threads unless the resolved toggle is on, as the pins
do. Each row shows what the comment is on, the first line of the comment,
the number of replies and, for an unread thread, a dot. Picking a row shows
the thread the way "Show on board" in chat does: the board pans to the pin,
the thread opens and the pin pulses. The panel comes back when the thread is
closed. While a thread or a new comment has the list's place, the Comments
button closes it and goes back to the list; it shows as pressed only while
the list itself is showing. The list and N work for anyone who can see the
board.

N goes to the next unread thread: the newest one if none is open, otherwise
the next older unread one after the open thread, starting again from the
newest after the oldest. With nothing unread it does nothing. A thread N
opens takes focus on its panel rather than its composer, as on a phone, so
the next N carries on; the Comments button's tooltip names the
key. `threadList` and `nextUnread` in `imports/lib/whiteboard/comments.ts` do
the ordering.

### Reactions and images

A thread's panel shows reactions with the chat's own reaction pills
(`ChatMessageReactions`), under the message they're on, and anyone who can
comment gets a React button on the comment and each reply that opens the
chat's emoji picker. Someone who can only view sees the pills and gets no
way to add or take back a reaction. The server refuses a new reaction on an
archived hunt's board, since a reaction is a reply; taking one back goes
through `removeChatReaction`, which only checks that it's the caller's own.

Pasting or dropping an image into the comment composer uploads it the way
chat does (`createChatImageUpload`, then a POST to the bucket) and puts it in
the comment, which can't be sent until the upload finishes. Both use
`useChatImageUpload` in `imports/client/hooks/`, and each shows a failure its
own way: chat in a dialog, the composer in a line under it. A failed image
doesn't count as something to send, so a comment that is only a failed image
can't be sent. When the server has no S3 image bucket, the image isn't
uploaded and the composer says "Images can't be added here: this server has
nowhere to store them." in plain words, rather than the setup message chat
shows admins.

### Highlights

On the board, the chat's Highlights panel has a Comments tab listing the
threads the viewer started or replied to (reactions don't count), by their
first comment. Picking a row scrolls chat to the comment, as in the other
tabs, and each row's "Show on board" closes the panel and shows the thread
on the board.

## Editing

### Keyboard

The tool keys, 1 to 3, N, Ctrl+A, Ctrl+L and the undo and redo keys only
work while the board has focus (the last press or focus was on it) and
nothing is being typed: not in a text box, a note being edited, the comment
composer or the search field, where Ctrl+Z is the browser's own. Each tool's
tooltip shows its key.

| Key | Does | Needs |
|---|---|---|
| V | Select and move | edit |
| P | Pen | edit |
| E | Eraser | edit |
| L | Line | edit |
| S | Sticky note | edit |
| T | Text | edit |
| F | Frame | edit |
| C | Comment | comment |
| N | Go to the next comment thread with something unread (see Comments) | |
| 1, 2, 3 | Thin, medium or thick pen | edit |
| Ctrl+A (Cmd+A on a Mac) | Select everything but frames (a selected frame carries its contents anyway) and no lines, switching to Select | edit |
| Escape | Close an open comment thread, then the Comments list, then leave a preview, then close History; with none of those open, drop a comment being started, a line being drawn, a click-to-connect line or an erase, and go back to Select | |
| / or Ctrl+F (Cmd+F) | Jump to the search field (see Search) | |
| Delete or Backspace | Delete the selection, leaving out anything locked (see Locks) | edit |
| Ctrl+L (Cmd+L) | Lock the selection, or unlock it if it's all locked (see Locks), only with the Select tool; with nothing selected or another tool it's the browser's own | edit |
| Arrow keys | Move the selection 5 units, 20 with Shift; it joins or leaves a frame as a drop would | edit |
| Enter | Start editing a focused sticky note or text box | edit |
| Ctrl+Z (Cmd+Z) | Undo your own last edit from this visit (see Undo and redo) | edit |
| Ctrl+Shift+Z (Cmd+Shift+Z) or Ctrl+Y | Redo the last edit undone | edit |
| Space (held) | Pan while a drawing tool is picked | |
| Shift (while drawing a line) | Snap a free end to 15° steps | |

In a text box being edited, Escape cancels, Enter saves a one-line label, and
leaving the box saves. Escape anywhere in a comment thread's panel closes it,
unless the composer's suggestions are open, when it closes those, or the
composer has something written in it, when it does nothing, so a slip of the
key doesn't throw the text away.

With the Comment tool, a press on the board starts a comment where it was
pressed once it's let go. A press that moves more than a few pixels first
doesn't start one, whether it's a mouse, a pen or a finger.

A thread's panel is a dialog named after what the comment is on. Opening a
thread moves focus to its reply box, or to the panel when the viewer can't
comment. On a phone an existing thread focuses the panel too, so the
on-screen keyboard doesn't cover the board; a new comment still focuses its
composer. Focus only moves when the panel opens, not when access changes
while it's open. Closing it with its Close button or
Escape puts focus back on its pin; deleting the thread puts focus on the node
it was on, if any.

### Lines from handles

Each card, note, text box and frame has a handle on each side. Dragging from
one draws a line to wherever it's let go. Clicking one instead starts a line
that ends at the next handle clicked; until then the handle is ringed in the
theme's primary colour and a dashed line runs from it to the pointer, so it's
clear the next click joins something. Escape, or picking another tool, lets
go of it. A locked node's handles only end lines: a line can be drawn to it,
but not started from it.

### Not on the board

The toolbar's "Not on the board" button (with a count of everything in it)
opens a panel in three parts, for anyone who can edit:

- **Puzzles**: cards someone deleted, which only hides them, and live puzzles
  with no card. "Put back" puts the card at the middle of the screen.
- **Frames**: rounds' frames (seeded frames and Ungrouped) someone deleted,
  which only hides them. Their contents moved out to the frame around them
  when they went, so a frame comes back at the top level, centred on the
  screen, and placement puts new cards for that round in it again. When a
  round's frame (one with a tag) comes back, the server queues a placement
  sync of that round's puzzles (those with the frame's tag, and for a
  `group:X` frame those tagged `meta-for:X`), so the cards that left with it
  go back in together. Moving out with the frame doesn't mark a card as
  moved by hand, so only cards someone has moved since stay where they are.
  A puzzle with more than one round tag goes where placement would put it,
  which may be another of its rounds.
- **Feeder arrows**: arrows someone deleted, which only hides them, named
  "feeder → meta". "Put back" brings one back, and "Put back all feeder
  arrows" brings back every one the panel lists. Neither changes the
  toolbar's feeder arrows toggle, so with it off the arrows come back unseen;
  the panel says so while the viewer has them turned off ("Feeder arrows are
  hidden for you; turn them on in the toolbar to see these.").

`deferSyncRoundsOnBoard` in `imports/server/whiteboard.ts` does the round's
sync, started from `upsertNodes` once the frame is back and run after the
method returns, so a failure there is logged rather than failing the
put-back; the tags come from
`roundTags` in `imports/lib/whiteboard/layout.ts`.

`Whiteboards.methods.upsertEdges` takes `hidden: false` on a feeder arrow to
put it back. Anything else to do with `hidden` on a line is refused: lines
are hidden through `deleteEdges`, and only feeder arrows are hidden rather
than deleted. A seeded frame comes back through `upsertNodes` with
`hidden: false`, as cards do.

### Undo and redo

Ctrl+Z (Cmd+Z on a Mac) undoes the viewer's own last edit to the board, and
Ctrl+Shift+Z (Cmd+Shift+Z) or Ctrl+Y redoes it. The toolbar has Undo and Redo
buttons beside the note tools, disabled when there's nothing to undo or redo,
titled "Undo your last change [Ctrl/⌘+Z]" and "Redo what you last undid
[Ctrl/⌘+Shift+Z or Ctrl+Y]". Both need edit access; the read-only toolbar
doesn't have them.

It covers the viewer's own edits this visit, up to the last 100:

- moves, resizes and moves into or out of a frame, including a whole drag,
  align or distribute, a burst of arrow-key nudges, and Place by tags, each as
  one step. Undoing a move puts the node back where it was and leaves it
  marked as moved by hand, as any move does;
- text, frame labels, line labels and colours, which go back to what they
  were, or to none;
- creating something (a note, text, frame, line or ink stroke), which undo
  deletes;
- deleting something made on the board (a note, text, frame, ink stroke,
  line or a line's free end), which undo puts back with the same id and
  fields, along with the lines that went with it and whatever was in a
  deleted frame, back in it;
- deleting a card, a round's frame or a feeder arrow, which only hid it, so
  undo shows it again, and putting one back from "Not on the board", which
  undo takes away again;
- moving a line's end and restyling a line, which go back to the old end
  (bringing back a free end the move removed) and the old style;
- collapsing or expanding a frame for everyone, including Collapse finished
  rounds;
- locking or unlocking with the Lock button or Ctrl+L. Undoing an unlock
  locks the node again, as the viewer's lock, even when someone else had
  locked it: an operator who unlocks Ada's note and undoes that becomes its
  locker, so Ada can no longer unlock it herself. An undo that would unlock
  someone else's lock, for a viewer who isn't an operator, is refused by the
  server and shows the usual alert. Lock layout isn't undone.

An ink stroke is one step however many segments it was saved in, and a
selection deleted in one go is one step. Edits to the same thing made before
the first of them is saved (two quick colour clicks on a note, say) are one
step too, since the board the client has doesn't show the first yet.

Undo and redo wait for the viewer's own saves that are still on their way,
and save arrow-key nudges at once rather than after the usual pause, so they
always take the latest edit. A new edit made while an undo is on its way
leaves nothing to redo, as any new edit does, and drops undo and redo
presses still waiting.

It leaves out comments (they have their own delete rules), anyone else's
edits, Reset layout and restoring from History (which History undoes), and
anything from before the page was opened. Undoing a deletion doesn't put
comments back on what it brings back: they stay where they were left when it
was deleted. What it brings back goes through `upsertNodes` and
`upsertEdges` as a new insert, so it lists the person who undid the deletion
as its creator and only contributor. Restore this item, in History, keeps the
original authorship.

Each step remembers when everything it touches was last changed (its
`updatedAt`). If someone else has changed any of it since, or deleted it,
undo doesn't apply the step: it drops it and says "Changed by someone else
since, so it wasn't undone" (for redo, "...so it wasn't redone"). The same
goes when something the step needs but doesn't write has gone: the frame a
node goes back into, or a node at either end of a line it puts back. The
viewer's own later edits don't count, so undoing several steps in a row
works. Both stacks are cleared when the board is restored from History or its
layout is reset (an open board sees its `lastRewrittenAt` change), since what
they would put back describes a board that's gone, and when the viewer loses
edit access. Going offline or to a phone-sized screen doesn't clear them.

Undo and redo send their changes through the same methods as any edit, so
they count towards History's versions, and a refusal shows in the usual
"Couldn't save" alert and drops the step. The stack logic is in
`imports/lib/whiteboard/undo.ts`; `inverseOf` in
`imports/client/components/whiteboard/boardWrites.ts` works out each step's
reverse from the documents the client has just before the save, and
`useWhiteboardUndo` keeps the stacks, joins saves still on their way, and
sends the steps. So that a colour can go back to none, `upsertNodes` and
`upsertEdges` take `color: null` to clear it.

### Locks

A lock stops a node being moved, resized, edited or deleted by anyone,
including whoever locked it, until it's unlocked. It's for the common
accident on a busy board: a frame dragged by someone trying to pan. Cards,
frames, notes, text and ink can be locked; a line's free end can't.

The edit toolbar has a Lock button beside Undo and Redo, and Ctrl+L (Cmd+L)
does the same while the board has focus. With anything unlocked in the
selection it locks the lot ("Lock what's selected, so it can't be moved,
resized, edited or deleted [Ctrl/⌘+L]"); with all of it locked it unlocks
it ("Unlock what's selected [Ctrl/⌘+L]"). With nothing selected it's
disabled. Unlocking is for whoever locked each node and for operators
(`userMayWritePuzzlesForHunt`, so admins and anyone the hunt makes an
operator); for anyone else the button is disabled, titled "Only the person
who locked this, or an operator, can unlock it", and Ctrl+L says the same in
a notice. A disabled button gets no hover in Bootstrap, so the title sits
on a wrapper around it as well.

A locked node shows a padlock: on the top-right corner of a card, note or
text box, sitting over its edge so it isn't confused with a locked puzzle's
padlock inside a card, and in the header of a frame. A locked ink stroke
shows one, on the corner of whichever of its segments reaches furthest
right (`InkNode`). Zoomed right out, a locked frame's label carries a small
padlock. The padlock's title says who locked it ("Locked by Carol"), or just
"Locked" when the client doesn't know them.

On the client a locked node isn't draggable (React Flow's per-node
`draggable: false`, which also keeps it out of arrow-key nudges and out of a
group drag), has no resize handles or colour picker, and its text or label
can't be opened for editing (a frame keeps its fold button, and a frame
label being typed when a lock arrives is kept as unsaved, as notes keep
theirs). The eraser passes over locked ink. Delete leaves locked nodes out
and says "Some of those are locked", or "That's locked" when everything
selected is. Align and distribute leave locked nodes out (`selectionUnits`
skips them), Place by tags sends only the unlocked cards selected, and the
end of a line attached to a locked node can't be dragged off it ("That's
locked").

The server enforces the same through `Whiteboards.methods.upsertNodes`, which
takes `locked: true` or `false` on a node already on the board. True sets
`locked` and `lockedBy` (the caller), unless it's locked already, when
nothing changes, so locking something again doesn't take it over; false
removes both. A new node with `locked`, or a point, is refused ("That can't
be locked"), and unlocking by anyone but the locker or an operator is refused
("Only the person who locked this, or an operator, can unlock it"). While a
node is locked, `upsertNodes` refuses any change to its `position`, `parent`,
`width`, `height`, `text`, `label`, `color` or `hidden` ("That's locked"),
unless the same input unlocks it; folding a locked frame is still allowed,
since it changes no geometry. One move is allowed: resizing a frame from its
top or left edge moves its origin, and the client keeps the frame's contents
still by moving each child the other way, so a `position` alone on a locked
node passes when its frame's new `position` is in the same batch and the
node stays where it was on the board (`staysPutInMovedFrame`).
`deleteNodes` refuses a locked node, or an ink stroke with any locked
segment, and `upsertEdges` refuses moving a line's end off a locked node,
though the line can be restyled or relabelled and new lines can be drawn to
it. Each of these refuses the whole batch before any of it is written, as
the collapse check does. Locking isn't authorship: it doesn't mark the node
as moved by hand or add a contributor. A batch that does nothing but lock,
unlock, collapse or expand records no version, since none of those change
the layout. The checks read each node before writing, so the write is made
conditional on the lock they saw: an edit that finds the node locked in the
meantime is refused ("That's locked") rather than landing, a lock that finds
it locked leaves the other locker in place, and an unlock doesn't remove a
newer lock by someone else.

Deleting an unlocked frame moves its children up to its own frame (or the
top level), keeping them where they are on the board, and that includes
locked children: their `parent` changes though they don't move.

Some things still move locked nodes: placement from puzzle hooks, which
isn't a person's edit, puts new cards into a locked frame and grows it, and
moves a locked card that isn't marked as moved by hand when its tags change;
Reset layout lays out locked cards and frames like any others, keeping
their locks; restoring a whole version puts each node back as the version
had it, lock included, so it can unlock or lock nodes (the preview marks a
node whose lock differs). Both record a version first. Place by tags on a
locked card is refused ("That's locked"), and so is Restore this item when
it would change anything a lock covers, or the lock itself, on a node that's
locked on the board (`restoreItems`), since both are a person's edit to
chosen things. Whoever locked it, or an operator, unlocks it first.

#### Lock layout

Operators get "Lock layout" and "Unlock layout" buttons beside Reset layout,
for when the map has settled. `Whiteboards.methods.setLayoutLocked`
(`setLayoutLocked` in `imports/server/whiteboardEdits.ts`) takes `boardId`
and `locked`, needs edit access, and refuses anyone who isn't an operator
("Only operators can lock or unlock the layout"). Under the board's lock it
locks every frame on show, seeded or hand-made, in one update with the
caller as `lockedBy`, or unlocks every locked frame, hidden or not. A frame
someone has already locked keeps its locker, and a frame taken off the
board stays unlocked so it can still be put back. It records no version and
isn't undone.

### When a save is refused

Every write the board makes (nodes, lines, comments, replies, resolving,
deleting, Place by tags, and undo and redo) reports a refusal from the server
in a dismissible alert under the toolbar, "Couldn't save: " and the server's
own reason, until it's dismissed or the next refusal replaces it. The board
goes back to what the server has, except for text: a sticky note, text box,
frame label or line label whose edit was refused keeps what was typed, with a
Retry button. Retry sends it again; editing it back to what's saved drops it.
Text being typed when the viewer loses edit rights is kept the same way,
marked "Not saved" until they can edit again, when it gets the Retry button. A
refused comment or reply goes back in the composer, unless something new has
been written there since, and a new comment's panel stays open until the
server has taken it.

### Offline

While Meteor reports the connection down, the board is view-only for that
viewer, whatever their access: the page lowers it to `view` with the reason
`offline`, the toolbar says "Viewing only", and a banner under it says
"Offline: the board is view-only until you reconnect". Meteor would hold any
edit made meanwhile and send it whenever it reconnected, which could be long
after the board around it had changed. Live cursors stop. An open comment
thread keeps its composer and whatever is written in it, with Send off until
the connection is back. When it is, the viewer's access returns without the
"You can now edit" notice, unless their edit rights changed while they were
offline, which is announced as usual.

### Deleting a comment

Delete on a thread's panel asks first, in a dialog that says the comment and
every reply to it go and that it can't be undone. Cancel leaves the thread as
it was. Who may delete is unchanged: the author until someone else replies,
and operators at any time.

## History

The board keeps earlier versions of itself, so anyone can see how it was and
someone who can edit it can put it back. The History button (a clock with an
arrow) sits beside "Not on the board" in the toolbar, and in the read-only
toolbar, so archived hunts and people who can't edit can look too. It isn't
shown on a phone, and a screen that becomes phone-sized closes the panel and
any preview.

### What a version is

A version is a copy of every node and line on the board, hidden ones
included, taken just before an edit. Taking it before the write means
nothing has to run later to finish one off, and the live board is always the
newest state. It doesn't hold comments, cursors, the board's own document or
its edit policy, so a restore never changes who may edit.

Node and line edits (`upsertNodes`, `deleteNodes`, `upsertEdges`, `deleteEdges`
and `placeByTags`) call `recordVersionBeforeEdit` in
`imports/server/whiteboardVersions.ts` after their checks and before their first
write. Restoring one item (`restoreItems`, below) records the same way from
under the board's lock. Comments, live drags and strokes, placement from puzzle
hooks, an `upsertNodes` batch that does nothing but collapse, expand, lock or
unlock, and Lock layout never record one. Versions hold each frame's
`collapsed` and each node's `locked` and `lockedBy` like any other field, so
a restore brings them back. The rule for whether an edit records a
version is `versionDecision` in `imports/lib/whiteboard/versions.ts`. Each
version lists who edited after it and when each of them started:

1. If someone has edited in the last 10 minutes (`VERSION_INTERVAL_MS`,
   counted from when they joined the version, not when it started), their
   edit counts towards that version and nothing new is stored.
2. Otherwise, if the newest version is less than a minute old
   (`VERSION_JOIN_MS`), they join it. A crowd starting together costs at most
   one version a minute.
3. Otherwise the board is serialised and hashed; if it's the same as the
   newest version, they join that one rather than storing it again.
4. Otherwise a new version is stored.

Only ordinary edits made since the last reset or restore count for 1 to 3, so
the first edit after one always records the board it left. A reset or restore
always records the board it's about to change. Someone editing steadily gets
a version every 10 minutes, and a burst of edits is one version. The fast
path (rule 1) is one indexed read with no lock; the rest takes the board's
`whiteboard:<boardId>` lock, which placement also takes, so a version never
sees half a placement. A failure to record is logged and the edit goes ahead:
a missing version beats a refused edit. User edits don't take the lock for
their own writes, so a version can catch part of someone else's batch;
restore cleans up what that can leave.

### The History panel

The panel lists versions by day, newest first. A version is the board before
the edits it lists, so each row names a state: "Now", then "Before edits by
Alice and Bob, 14:20 to 14:29 (37 changes)" (a change is one save, whatever
it held), "Before Carol reset the layout · 14:02" or "Before Carol restored
the 12:10 version · 13:40". When older versions have been pruned, the panel
ends with "Older history was cleared to save space". With history turned off
it says so instead.

Picking a row previews it. The client fetches the version's chunks with
`Whiteboards.methods.fetchVersion`, one call per chunk, joins them, unpacks them
with `DecompressionStream("gzip")` and hands the nodes and lines to
`useWhiteboardSync` in place of the live board. While previewing, the board
can't be edited or commented on, comment pins, cursors and other people's drags
are hidden, the viewer's own cursor comes off everyone else's screens, and a
banner at the top says "Viewing the board as it was at 14:20." with "Restore
this version" and "Back to now". Nodes and lines the version has differently
from the board as it is now get a pink outline (`versionDifferences` in
`imports/lib/whiteboard/versions.ts`): ones the board no longer has, and ones
with a different place, frame, size, text, label, colour, ends, line style, or
hidden or collapsed state. They're matched by what they are, as a restore
matches them, so a card that has only changed id isn't marked. The outline
follows the live board, so it goes from anything that's put back. Nodes can be
selected in a preview, though nothing can be moved, and a single selected node,
or a whole ink stroke, offers "Restore this item" (see below). Opening,
switching or leaving a preview clears the selection, so nothing picked in one
stays selected on the live board. Restore asks first: "Restore the board to
14:20? Changes since then, by anyone, are undone. Comments are kept. The board
as it is now is saved in history, so you can come back to it." The question
stays up, its buttons disabled, until the server answers; a refusal shows in it.
Once it's done, the preview closes and a notice says "Board restored to 14:20."
For anyone who can't edit, Restore is disabled with the reason beside it, and so
is "Restore this item". Rows give only the time, under their day; the banner,
the question, the notice and a restore row's "restored the … version" add the
day when it isn't today. Escape leaves a preview, and then closes the panel. A
browser without `DecompressionStream` can list versions but not preview them,
and says so.

### Restoring

`Whiteboards.methods.restoreVersion` needs edit access and history turned on.
Under the board's lock it checks both again, reads the version and checks
every document against today's schemas, refusing with "This version is from
an older layout and can't be restored" if anything doesn't fit. User ids in
`createdBy`, `updatedBy` and `contributors` are mapped through completed
account merges, so a restore never writes a merged-away account back.

`planRestore` then matches documents by what they are rather than by id: a
card by its puzzle, a round's frame by its tag, Ungrouped by its kind, a
feeder arrow by its feeder and meta, and anything else by id. Where the
version and the board have the same thing under different ids, the board's id
wins and the version's references are remapped to it. Parents that are
missing or would make a loop are dropped (the node goes to the top level), as
are lines with a missing end and free ends no line uses. A restore that would
take the board past its node or line limit is refused.

Only after that does it record the board as it is (a version of kind
`restore`), so a refused restore records nothing. Then:

- Cards for puzzles the version doesn't have stay, moved to the top level at
  the same place on screen and no longer marked as moved by hand. After the
  lock, a placement sync of the hunt's puzzles puts them in their rounds and
  redraws feeder arrows.
- Comments on nodes the restore removes or hides become free pins where they
  were, remembering the node in `comment.detachedFrom`. Deleting a node does
  the same.
- Everything else is put back as the version has it.
- Free pins that came off a node the restore brings back or unhides go back
  on it.
- The board's `lastRewrittenAt` is set.

Documents a restore changes or puts back draw on top of anything else at
their level, since their `updatedAt` is new: documents it inserts again get
the time of the restore rather than the one stored in the version. Edits that
land while a restore runs may survive on top or be overwritten. A restore
that loses the board's lock part-way stops and says so (see "When the board
is busy" below). Pins that came off a node before this feature have no
`detachedFrom` and stay free.

### Restoring one item

"Restore this item", on a node selected in a preview, puts back just that
node, for when someone deleted a sticky and nobody wants to roll back
everyone else's work. Selecting part of an ink stroke selects all of it, and
the button then puts back the whole stroke; the server does the same for any
one segment it's sent, as deleting one deletes them all. On a frame it reads
"Restore this frame and everything in it as it was at 14:20", since the
frame brings everything inside it back too, undoing later edits to those by
anyone. On success the board's notice says "Put back as it was at 14:20."
(or "That's already as it was at 14:20." when nothing differed) and the
preview stays open; a refusal shows in the usual "Couldn't save" alert.

`Whiteboards.methods.restoreItems` (`restoreItems` in
`imports/server/whiteboardVersions.ts`) takes 1 to 100 node ids from one
version and returns whether anything on the board changed. It needs edit
access and history turned on, and the version must be this board's. Under the
board's lock it checks those again and reads the version as a whole restore
does. `restoreItemSet` adds every segment of an ink stroke, everything inside
a frame (in the version), the lines touching any of it and those lines' free
ends. If that comes to more than 100 nodes or 100 lines it refuses with
"That's too much to restore at once", and the button is disabled with that
reason when the client can see it coming.

`planItemRestore` matches documents the way `planRestore` does, so a card
whose puzzle now has a card under another id, or a frame whose tag now has
another frame, updates the one on the board instead of inserting a second.
Only the documents in that set are written. It never removes anything: live
documents outside the set stay as they are, including things added to a
restored frame since the version. A node whose frame isn't on the board (and
isn't being restored with it), or that would make a loop, goes to the top
level where the version had it on screen. A line whose other end isn't on the
board isn't restored, nor is its free end. Putting things back that would
take the board past its node or line limit is refused with "This board is
full".

It's an edit, not a rewrite: it records a version of kind `edits` through
`recordVersionLocked`, which coalesces with the same person's other edits
like any save, and it doesn't set `lastRewrittenAt`. When nothing in the set
differs from the board there's nothing to write, so it records nothing and
returns false. Comments come off nodes it hides and go back on nodes it
brings back, as for a whole restore. After the lock, a
placement sync of any cards it touched puts them back in step with their
rounds.

### Retention and storage

A version's payload is `gzip(EJSON.stringify({ format: 1, nodes, edges }))`,
with documents sorted by id and keys in a fixed order, and its sha256 hash
says whether the board has changed. The payload is stored in 4 MiB chunks
(`WhiteboardVersionChunks`, server only), written before the version's
header, so a listed version always has its data. A typical board's version
is about half a megabyte; ink is most of it.

Every hour, `imports/server/daemons/whiteboardVersions.ts` prunes each
board's history under its lock (`pruneWhiteboardVersions` in
`imports/server/whiteboardVersions.ts`, rules in `versionsToPrune`):
everything from the last two hours stays; before that, the first version in
each UTC hour stays, as does every reset and restore; and the newest versions
are kept up to 256 MiB of compressed payload per board
(`MAX_VERSION_BYTES_PER_BOARD`), never dropping the newest. Once the hunt is
archived, or the board has gone 14 days without a new version, its history
thins to the newest 10 versions plus every reset and restore. Anything pruned
sets the board's `versionsPrunedBefore`. A recording that takes the board
over the cap prunes there and then, and never refuses the edit. The daemon
also removes chunks over an hour old that have no version (left by a write
that didn't finish), and logs each board's history size once a day, so an
ink-heavy board shows up before it reaches the cap. A board that fails is
logged and left for the next pass, and the rest carry on.

## Reset layout and Place by tags

Both are edits: they need edit access, so the edit policy decides who may use
them and an archived hunt refuses them, and both go through history.

### Place by tags

Selecting cards with the Select tool, on a board the viewer can edit, shows a
"Place by tags" button above them, titled "Move back to where its tags put it,
and keep it in step from now on". It doesn't ask first; undo (Ctrl+Z) or
History reverses it. It calls `Whiteboards.methods.placeByTags` (`placeByTags`
in `imports/server/whiteboardReset.ts`) with the selected cards' node ids, in
batches of `MAX_BATCH`. Locked cards are left out of the selection it sends
and don't get the button. Anything that isn't a card on show on this board
is refused ("Only cards on this board can be placed by tags"), and so is a
locked card ("That's locked"). Otherwise it records a version like any
edit, clears `manual` on the cards, and runs a placement sync of their
puzzles under the board's lock. A card already in the
frame its tags choose stays where it is, but follows its tags from now on; one
anywhere else moves to the first free slot of that frame, which grows to fit.
Its comments and lines go with it, since its id is kept.

### Reset layout

"Reset layout…" (a grid button beside History in the toolbar) is there for
people who can edit, while history is turned on. It asks first: "Reset the
layout? Every card and round frame goes back to where the puzzle list puts
it. Notes, drawings, lines and comments stay. The board as it is now is
saved in history, so you can undo this from there." with a checkbox, "Also
put back cards and rounds taken off the board". The question stays up, its
buttons disabled, until the server answers, and a refusal shows in it. Once
it's done, a notice says "Layout reset. Undo it from History." with an "Open
History" button.

`Whiteboards.methods.resetLayout` (`resetLayout` in
`imports/server/whiteboardReset.ts`) needs edit access and history turned
on ("Reset layout needs board history, which is turned off"). Under the
board's lock it checks both again and records the board as it is, a version
of kind `reset` that History shows as "Before Carol reset the layout"; if
that fails, nothing on the board changes. It then lays the hunt out with
`seedLayout`, as a new board would be, and `planReset` in
`imports/lib/whiteboard/reset.ts` maps that onto what's there:

- Each round's frame, Ungrouped and each card keeps its id and gets the
  frame, position and size the layout gives it, and is no longer marked as
  moved by hand. A card someone dragged into their own frame goes back to
  its round.
- Frames and cards the layout needs that aren't on the board are added, one
  at a time, frames first. If someone puts a card on the board by hand at
  the same moment, theirs is the one placed.
- A round's frame that no puzzle needs any more stays, moved to the top
  level below everything else on the board, with whatever is in it.
- Cards and round frames someone took off the board stay off and where they
  were. The layout leaves them out, so their puzzles go where placement
  would put them today: another of their rounds, or Ungrouped. With the
  checkbox ticked (`putBack`) they're laid out with everything else and come
  back, and so do feeder arrows someone took off. With Ungrouped taken off
  and the box not ticked, the cards it would hold go where it would have
  been, at the top level.
- Cards for deleted puzzles are left alone.

Sticky notes, text, ink, people's own frames, lines and their free ends, and
comments aren't touched; anything inside a round's frame keeps its place in
the frame and moves with it. Since ids are kept, comment pins and lines stay
on what they were attached to. Feeder arrows are redrawn to match the
puzzles' tags (ones someone took off stay off unless putting back), and the
board's `lastRewrittenAt` is set, so anyone's next edit records the reset
board. Each write is its own update, and the lock is renewed every 200.

The new layout starts at the top left, as a new board's does, so notes at
the top level there can end up under frames, and anything in a round's
frame can overlap its cards' new slots. Restoring the reset's version from
History puts every card, frame and arrow back, and that restore records a
version of its own, so it can be undone too.

### When the board is busy

A reset or restore holds the board's `whiteboard:<boardId>` lock while it
runs, renewing it as it goes. If another server takes the lock anyway (it
does once a holder has gone 10 seconds without renewing), the reset or
restore stops at its next renewal and refuses with "The board was busy; try
again" rather than an internal error. Each renews just before its first
write to the board, so one that loses the lock before then leaves the board
as it was, and takes away the version it recorded for itself. One that loses
it after it has started writing stops there and keeps what it wrote, and
`lastRewrittenAt` isn't set; running it again finishes the job, and the
version it recorded undoes it.

## Phones

A phone gets the board read-only plus comments. `WhiteboardPage` treats the
screen as compact when it matches `(max-width: 575px), (pointer: coarse) and
(max-height: 575px)`: narrower than the puzzle page's desktop breakpoint, or
a touch screen too short for the toolbar and a thread, which catches phones
held on their side. A compact board lowers `edit` to `comment` with the
reason `narrow`, hides the mini map, and passes `compact` to the canvas and
its context. The server doesn't know or care: someone who may edit can still
do so from a desktop.

On a phone the viewer can pan and pinch, open puzzles from cards, show and
hide resolved pins, open a pin's thread, place a comment, reply, react,
resolve and reopen, delete their own thread while nobody else has replied
(operators can always), use search and the Comments list, copy a link to the
view, follow "Show on board" from chat, and open a collapsed round for
themselves ("Show (only for you)", see Collapsed rounds). Nothing else: no
tools, no moving, no folding rounds for everyone, no who-can-edit button.

The toolbar says "Viewing only" with "Editing needs a wider screen. You can
still comment." under it, and its Comment, Comments and resolved buttons are
44px square. While the Comment tool is out, a banner under the toolbar says
"Tap where your comment goes", with Cancel to put the tool away.

A tap places the comment. With the tool out on a phone the board still pans
under a finger: React Flow's `panOnDrag` stays on, and the canvas leaves a
touch press to React Flow rather than taking it over as it does a mouse
press. A press that moves further than a tap can, a second finger, or a
cancelled touch drops it without a comment, so panning and pinching never
leave a stray draft. A touch gets 10px of room before it counts as a pan; a
mouse or pen gets 4px. The click the browser makes from the tap is ignored, so
a tap on a card's link places the comment without opening the puzzle.

A thread opens in a sheet along the bottom of the board, as wide as the
board, with rounded top corners, at most 60% of its height, never within
48px of the top of what's showing, and never past the top of the board, so
its header stays in view when the keyboard lifts it. The sheet and the
top-right panel a wider screen uses are one element, so the screen changing
size while a comment is being written keeps what's written. Its buttons are full size and it scrolls
without dragging the page with it. Opening a pin, placing a new comment, or
showing a comment from chat or the Comments list, pans the board so the pin
sits above the sheet. A
new comment's composer takes focus, which brings up the keyboard; opening an
existing thread doesn't. `useKeyboardInset` (in `imports/client/hooks/`)
follows `window.visualViewport`, and the sheet sits that far up from the
bottom so the keyboard doesn't cover it. The composer's text is 16px on a
phone, so iOS doesn't zoom in when it takes focus, and Send is 44px tall.

On any touch screen (`pointer: coarse`) a pin takes presses from 5px past its
edge, a 44px target, without looking any bigger.

## What cards and rounds show

Everything here is display only: it reads puzzles, tags, the board's nodes
and the hunt's presence, and writes nothing.

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

The people on a card are the ones the puzzle list's viewers column shows on
that puzzle's row. The canvas works them out once for the board in
`PuzzlePeopleProvider` with `usePuzzleViewers`
(`imports/client/hooks/usePuzzleViewers.ts`), the hook the puzzle list uses,
which subscribes to the hunt's puzzle subscribers, call peers and
`UserStatuses` and runs `computePuzzleViewers`
(`imports/lib/puzzleViewers.ts`) again every minute while the tab is
visible. Only the provider and the cards whose people changed re-render on
that clock. Each card reads its own puzzle's entry from `PeopleContext` and
turns it into users with `usePuzzleViewerUsers`
(`imports/client/hooks/usePuzzleViewerUsers.ts`), as the list's row does. So
each person is placed once: on every puzzle they have open in a visible tab,
failing that on the puzzle of their latest chat message, call or document
edit in the last five minutes, or failing that the hidden tab they last had
open in that time. Callers come first with the phone icon (none while
`disable.webrtc` is set), then viewers with the eye, with those placed by a
hidden tab or an interaction drawn faded. Anyone without a display name is
left out. Having the board open in a visible tab puts someone on the board's
own puzzle, so while they look at the board they drop off the card of any
puzzle they only have open in a hidden tab or last did something on.

The badge, icons and chips come from `puzzleStatusFromTags` in
`imports/lib/puzzleTagStatus.ts`, which the puzzle list's rows use too, so the
two agree on which tags make a meta, a priority or a stuck puzzle. The list
leaves those tags out of its chips (`shownAsStatus`). Both read tags through the
tag vocabulary in `imports/lib/tagNames.ts` (`tagKind`), through the server-wide
synonym table admins edit on the Setup page (by default `loc:` and `location:`
are synonyms for `where:` and `stuck` for `is:stuck`); the whiteboard's layout
finds metas with its `isMetaForTag` too. The table can't rewrite into or out of
`group:`, `meta-for:` or `is:` (`tagSynonymRuleProblems` calls that
`structural`), apart from the built-in `stuck` rule, so the tags that organise a
hunt keep the names they're stored under: a round's state, for one, reads
`group:` and `meta-for:` tags as written. Without that, a tag stored before a
rule existed would mean one thing there and another through the table. "Use the
built-in rules" on the Setup page drops a saved table, after asking and saying
how many rules will go (it's greyed out, with a line saying the built-in rules
are in use, when there's none). The question stays up, its buttons disabled,
until the server answers, and a refusal shows in it. Saving an empty table turns
synonyms off. The helpers take the table as an argument: components get it from
`useTagSynonyms`, and server code (placing cards, a reset's seed layout) from
`currentTagSynonyms` in `imports/server/tagSynonyms.ts`, which follows the
setting.

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
rounds that aren't collapsed, from the states `roundStates` worked out, which
is what "Collapse finished rounds" folds (see Collapsed rounds).

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
is laid out four to a row as before.

Placement keeps it that way. `placeIntoFrame` puts a card in the first free
slot of its frame, but skips any row whose cards are all the round's metas
(the puzzles tagged `meta-for:X` in a frame tagged `group:X`, from
`roundMetas`), so a puzzle added during the hunt goes below the meta row
rather than beside the meta. A new meta still takes the first free slot,
which on a seeded round is in the meta row. Rows that also hold a feeder, as
on boards seeded before metas had a row of their own, fill as they always
did, so existing boards only change in where new cards land.

## Collapsed rounds

A frame can be folded to its header, hiding what's in it, so a round the
team has finished stops taking up the board. Nothing folds on its own: it's
done by hand, a frame at a time or every finished round at once, so nobody's
view changes under them mid-solve.

### For everyone, or just for you

Folding a frame is shared: "Collapse for everyone" folds it on every
screen, and "Expand for everyone" opens it again. Both need edit access.
They're the chevron at the start of the frame's header, and a button beside
the colour picker above a selected frame, which is there at every zoom
(the header isn't drawn when the board is zoomed right out).

Anyone who can see the board, editors included, can look inside a collapsed
frame without changing it for anyone else: "Show (only for you)" opens it on
their screen, and "Hide again" folds it back. For someone who can't fold it
for everyone (a non-editor, an archived hunt, a phone) that's what the
chevron does; editors get it as an eye button beside the chevron. A peek
lasts until the viewer leaves the board, and goes once the frame is expanded
for everyone, so folding it again later folds it for them too.

A frame someone else folds stays open for this viewer while anything inside
it is being dragged, resized or typed in by them, or has a change of theirs
on its way to the server, so their work isn't folded away under them.

### What a collapsed frame shows

A collapsed frame is drawn as its header, 56 units tall
(`COLLAPSED_FRAME_HEIGHT`), at its full width, with a dashed edge. Its stored
size doesn't change, so it opens at the size it was, and it can't be resized
while collapsed. The header shows "n/m solved" over every card inside it at
any depth (puzzles with nothing to solve count neither way), or "N items"
when it holds no puzzles; the edge is in the warning colour while an
unsolved puzzle is inside; and "N comments", a button that opens the frame
for the viewer, when it hides open comment threads. A finished round keeps
its tick and "Finished". Zoomed right out, its label is sized to its width
rather than its height and reads "label (n/m)".

Lines with an end inside the frame are drawn to the frame instead, and a
line with both ends inside isn't drawn. Feeder arrows that end up joining
the same frame and meta are drawn once, so a folded round sends one arrow to
its meta. A line drawn to a collapsed frame in place of something inside it
has no grips, so its real end can't be dragged off it, and a line's free end
inside the frame is hidden with it. Comment pins on anything inside aren't
drawn; a new comment on the header is pinned to the frame. Someone else's
live drag of something inside isn't shown.

Nothing can be dropped into a collapsed frame: drags, arrow-key moves,
placed notes and frames, and new ink land around it, as if it weren't there.
Moving the frame moves what's in it (positions inside are relative to the
frame) and the free ends of lines attached to it. Align and distribute treat
it as the header it is. A collapse or expand snaps rather than gliding as
other changes do.

The folding is worked out on the client: `foldedInto` in
`imports/lib/whiteboard/collapse.ts` maps each hidden node to the outermost
collapsed frame above it that isn't open for this viewer, `foldLines` moves
the lines' ends, and `collapsedAncestors` finds the frames to open for a
link. `useWhiteboardSync` takes the viewer's peeked and busy nodes and does
this as it builds the nodes, and the canvas passes each folded frame's
counts to its header and far-zoom label through `CollapseContext`.

### Collapse finished rounds

With edit access, the toolbar has "Collapse finished rounds" beside Reset
layout while any round is finished and still open, titled "Fold every round
whose metas are solved". It folds them all at once, sending `collapsed: true`
for each in batches of `MAX_BATCH`. Finished is as Rounds describes it.

### On the server

Folding goes through `Whiteboards.methods.upsertNodes` with `collapsed: true`
or `false` on a frame, so it needs edit access like any edit, and an
archived hunt refuses it. Anything but a frame is refused ("Only frames can
be collapsed"), and a batch holding one is refused before any of it is
written. `true` sets the field and `false` removes it. It doesn't mark
the frame as moved by hand or name anyone as a contributor. A new frame can
be created collapsed, so putting one back keeps it. Taking a seeded frame off
the board opens it, so it comes back open. A batch that does nothing but
collapse or expand frames records no version. Placement ignores the field: a
new card goes into the frame's stored layout, the frame grows to fit, and its
count shows it. Reset layout keeps every frame's id, so collapsed rounds stay
collapsed, and a restore puts back each frame's `collapsed` as the version
had it.

## Flags

- `disable.whiteboard` turns the board off. Creating one, every node and line
  write, new comments, resolving and deleting comments, and policy changes are
  refused; the whiteboard publications return nothing; placement stops; and
  live updates do nothing. The page says the whiteboard is turned off, the
  hunt nav hides its link, and the puzzle page and list hide "Show on board".
  Ordinary chat on the hidden puzzle isn't gated.
- `disable.whiteboard_live` turns off cursors, live drags and strokes: the
  presence publication returns nothing and `setLive` does nothing.
- `disable.whiteboard_versions` ("Whiteboard history" on the Setup page)
  stops recording versions, empties the history list (the publication returns
  nothing), refuses fetching and restoring versions, and refuses Reset layout
  and hides its button, since History is how a reset is undone. Place by tags
  still works, recording nothing, like any other edit. Versions already
  recorded are kept.

There is no flag for the edit policy: `members` is already the off position.

## Data model

- `Whiteboards` (`jr_whiteboards`): one per hunt (a unique `hunt` index), with
  the hidden puzzle in `puzzle`, the optional `editPolicy` and `editors`, and
  the optional `versionsPrunedBefore` and `lastRewrittenAt` from history.
- `WhiteboardNodes` (`jr_whiteboard_nodes`): cards, frames, sticky notes, text,
  ink segments and the free ends of lines. A node inside a frame has `parent`
  set and a position relative to it. `hidden` marks a card or seeded frame
  someone removed, so placement doesn't put it back; `manual` marks a node
  someone has moved, so placement leaves it alone until Place by tags or a
  reset clears it. `collapsed` marks a frame folded for everyone (see
  Collapsed rounds). `locked` and `lockedBy` mark a node locked and who
  locked it (see Locks). `contributors` records who wrote or restyled it.
- `WhiteboardEdges` (`jr_whiteboard_edges`): lines between nodes. Feeder arrows
  are `auto`, with `feeder` and `meta` puzzle ids, and follow the puzzles'
  tags.
- `WhiteboardPresence` (`jr_whiteboard_presence`, server only): one document
  per connection per board, with the cursor, drag and stroke. It goes when the
  connection closes, the presence subscription stops or its server dies.
- `WhiteboardVersions` (`jr_whiteboard_versions`): one per version, with its
  `kind` (`edits`, `reset` or `restore`), the
  `users` who edited after it and when each started, `changeCount`,
  `lastEditAt`, `restoredFromAt` for a restore, counts, the compressed `size`,
  `chunkCount` and the payload's `hash`. Published to members without the
  hash.
- `WhiteboardVersionChunks` (`jr_whiteboard_version_chunks`, server only): the
  pieces of each version's payload, by `version` and `index`.
- Comments are `ChatMessages` on the hidden puzzle with a `comment` anchor
  (`node`, `x`, `y`, `resolvedAt` and `resolvedBy` once resolved, and
  `detachedFrom` on a free pin that came off a node). Replies carry `thread`,
  the root's id.

The server enforces the limits in `imports/lib/whiteboard/limits.ts` (batch
sizes, nodes and lines per board, text lengths, ink points, coordinate range,
frame depth, the edit list, history's intervals and caps), and the client
keeps to the ones it can. Purging a hunt removes all six collections, and
merging users carries `createdBy`, `contributors`, `lockedBy`, the `editors`
list and versions' `users` over to the merged account and drops the source
account's presence. User ids inside a version's payload aren't rewritten; a
restore maps them instead.
