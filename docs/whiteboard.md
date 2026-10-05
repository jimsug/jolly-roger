---
files:
  - imports/client/chatEditorContent.ts
  - imports/client/components/AvatarStack.tsx
  - imports/client/components/ChatMessageReactions.tsx
  - imports/client/components/DeleteChatMessageModal.tsx
  - imports/client/components/HighlightsPanel.tsx
  - imports/client/components/NotificationCenter.tsx
  - imports/client/components/OwnProfilePage.tsx
  - imports/client/components/WhiteboardPage.tsx
  - imports/client/components/tagColors.ts
  - imports/client/components/whiteboard/BoardSearch.tsx
  - imports/client/components/whiteboard/CollapseContext.ts
  - imports/client/components/whiteboard/CommentComposer.tsx
  - imports/client/components/whiteboard/CommentLayer.tsx
  - imports/client/components/whiteboard/CommentList.tsx
  - imports/client/components/whiteboard/CommentPanel.tsx
  - imports/client/components/whiteboard/DownloadButton.tsx
  - imports/client/components/whiteboard/EditPolicyModal.tsx
  - imports/client/components/whiteboard/EditableText.tsx
  - imports/client/components/whiteboard/FeederFocusContext.ts
  - imports/client/components/whiteboard/FeedersButton.tsx
  - imports/client/components/whiteboard/FrameLabelLayer.tsx
  - imports/client/components/whiteboard/FrameNode.tsx
  - imports/client/components/whiteboard/HistoryPanel.tsx
  - imports/client/components/whiteboard/ImageNode.tsx
  - imports/client/components/whiteboard/InkNode.tsx
  - imports/client/components/whiteboard/KeepAboveKeyboard.tsx
  - imports/client/components/whiteboard/LockBadge.tsx
  - imports/client/components/whiteboard/LockLayoutButtons.tsx
  - imports/client/components/whiteboard/NodeChrome.tsx
  - imports/client/components/whiteboard/NodeHandles.tsx
  - imports/client/components/whiteboard/OutlinePanel.tsx
  - imports/client/components/whiteboard/PeopleContext.ts
  - imports/client/components/whiteboard/PuzzleCardNode.tsx
  - imports/client/components/whiteboard/RemoteEditingContext.ts
  - imports/client/components/whiteboard/RemoteSelectionLayer.tsx
  - imports/client/components/whiteboard/ResetLayoutModal.tsx
  - imports/client/components/whiteboard/RoundStateContext.ts
  - imports/client/components/whiteboard/ShapeNode.tsx
  - imports/client/components/whiteboard/ShowOnBoardLink.tsx
  - imports/client/components/whiteboard/TouchTargetSize.tsx
  - imports/client/components/whiteboard/WhiteboardCanvas.tsx
  - imports/client/components/whiteboard/WhiteboardContext.ts
  - imports/client/components/whiteboard/WhiteboardEdge.tsx
  - imports/client/components/whiteboard/WhosHere.tsx
  - imports/client/components/whiteboard/boardFiles.ts
  - imports/client/components/whiteboard/boardWrites.ts
  - imports/client/components/whiteboard/frameToolBox.ts
  - imports/client/components/whiteboard/marker.ts
  - imports/client/components/whiteboard/touch.ts
  - imports/client/hooks/useChatImageUpload.ts
  - imports/client/hooks/useChatImagesEnabled.ts
  - imports/client/hooks/useEditorImageUpload.ts
  - imports/client/hooks/useKeyboardInset.ts
  - imports/client/hooks/usePuzzleViewers.ts
  - imports/client/hooks/usePuzzleViewerUsers.ts
  - imports/client/hooks/useRoundStates.ts
  - imports/client/hooks/useTagSynonyms.ts
  - imports/client/hooks/useWhiteboardLive.ts
  - imports/client/hooks/useWhiteboardNames.ts
  - imports/client/hooks/useWhiteboardOthersEditing.ts
  - imports/client/hooks/useWhiteboardSync.ts
  - imports/client/hooks/useWhiteboardUndo.ts
  - imports/client/uploadChatImage.ts
  - imports/lib/chatMessagePath.ts
  - imports/lib/imageUploads.ts
  - imports/lib/models/Puzzles.ts
  - imports/lib/models/WhiteboardEdges.ts
  - imports/lib/models/WhiteboardNodes.ts
  - imports/lib/models/WhiteboardVersions.ts
  - imports/lib/models/Whiteboards.ts
  - imports/lib/permission_stubs.ts
  - imports/lib/publications/whiteboardInk.ts
  - imports/lib/puzzleTagStatus.ts
  - imports/lib/puzzleViewers.ts
  - imports/lib/tagNames.ts
  - imports/lib/whiteboard/clipboard.ts
  - imports/lib/whiteboard/collapse.ts
  - imports/lib/whiteboard/comments.ts
  - imports/lib/whiteboard/exportFiles.ts
  - imports/lib/whiteboard/feederFocus.ts
  - imports/lib/whiteboard/feeders.ts
  - imports/lib/whiteboard/follow.ts
  - imports/lib/whiteboard/frameTools.ts
  - imports/lib/whiteboard/ink.ts
  - imports/lib/whiteboard/layout.ts
  - imports/lib/whiteboard/limits.ts
  - imports/lib/whiteboard/links.ts
  - imports/lib/whiteboard/minimap.ts
  - imports/lib/whiteboard/notOnBoard.ts
  - imports/lib/whiteboard/outline.ts
  - imports/lib/whiteboard/remoteActivity.ts
  - imports/lib/whiteboard/reset.ts
  - imports/lib/whiteboard/rounds.ts
  - imports/lib/whiteboard/search.ts
  - imports/lib/whiteboard/undo.ts
  - imports/lib/whiteboard/versions.ts
  - imports/methods/exportWhiteboard.ts
  - imports/methods/fetchWhiteboardVersion.ts
  - imports/methods/placeWhiteboardCardsByTags.ts
  - imports/methods/resetWhiteboardLayout.ts
  - imports/methods/restoreWhiteboardItems.ts
  - imports/methods/restoreWhiteboardVersion.ts
  - imports/methods/setWhiteboardEditPolicy.ts
  - imports/methods/setWhiteboardLayoutLocked.ts
  - imports/methods/setWhiteboardLive.ts
  - imports/methods/upsertWhiteboardEdges.ts
  - imports/methods/upsertWhiteboardNodes.ts
  - imports/server/boardCommentAudience.ts
  - imports/server/chatMessageContent.ts
  - imports/server/daemons/whiteboardVersions.ts
  - imports/server/getOrCreateTagByName.ts
  - imports/server/getS3UploadParams.ts
  - imports/server/hooks/ChatNotificationHooks.ts
  - imports/server/jobs/applyTagSynonyms.ts
  - imports/server/methods/addPuzzleAnswer.ts
  - imports/server/methods/deleteChatMessage.ts
  - imports/server/methods/destroyPuzzle.ts
  - imports/server/methods/editChatMessage.ts
  - imports/server/methods/exportWhiteboard.ts
  - imports/server/methods/fetchWhiteboardVersion.ts
  - imports/server/methods/placeWhiteboardCardsByTags.ts
  - imports/server/methods/resetWhiteboardLayout.ts
  - imports/server/methods/restoreWhiteboardItems.ts
  - imports/server/methods/restoreWhiteboardVersion.ts
  - imports/server/methods/sendChatMessage.ts
  - imports/server/methods/setWhiteboardEditPolicy.ts
  - imports/server/methods/setWhiteboardLayoutLocked.ts
  - imports/server/methods/setWhiteboardLive.ts
  - imports/server/methods/undestroyPuzzle.ts
  - imports/server/methods/updatePuzzle.ts
  - imports/server/models/WhiteboardPresence.ts
  - imports/server/models/WhiteboardVersionChunks.ts
  - imports/server/publications/whiteboardContents.ts
  - imports/server/publications/whiteboardInk.ts
  - imports/server/publications/whiteboardPresence.ts
  - imports/server/publications/whiteboardVersions.ts
  - imports/server/rateLimits.ts
  - imports/server/renameOrMergeTag.ts
  - imports/server/sendChatMessageInternal.ts
  - imports/server/tagSynonyms.ts
  - imports/server/transitionGuess.ts
  - imports/server/whiteboard.ts
  - imports/server/whiteboardComments.ts
  - imports/server/whiteboardEdits.ts
  - imports/server/whiteboardLive.ts
  - imports/server/whiteboardPolicy.ts
  - imports/server/whiteboardReset.ts
  - imports/server/whiteboardShared.ts
  - imports/server/whiteboardVersions.ts
  - imports/server/withLock.ts
updated: 2026-10-06
---

# Hunt Whiteboard

Each hunt can have one shared whiteboard, at `/hunts/:huntId/whiteboard`. It
starts as a map of the hunt: a frame for each round, a card for each puzzle in
its round's frame, and an arrow from each feeder to its meta. People add
sticky notes, text, images, rectangles and ellipses, their own frames, lines,
freehand ink and highlighter on top, pin comment threads to anything on it,
and see each other's cursors move.

An operator creates the board (`ensureWhiteboard` in
`imports/server/whiteboard.ts`), which lays out every puzzle in the hunt. An
archived hunt can't get a new board. From then on, puzzle hooks place each new
puzzle, and move a card when its tags change, unless someone has moved that
card by hand (Place by tags and Reset layout hand it back to placement).
Placement takes the `whiteboard:<boardId>` lock, so a burst of new puzzles
can't land in the same slot.

Placement keeps to the board's caps (see Data model). It doesn't add a
round's frame to a board that already has `MAX_NODES_PER_BOARD` nodes: the
puzzle's card goes at the top level instead, and the server logs a warning.
A meta gets feeder arrows from at most `MAX_FEEDERS_PER_META` (200) feeders,
those whose puzzles were created first, and a sync draws no more arrows once
the board has `MAX_EDGES_PER_BOARD` lines; it logs a warning for either.
Seeding a new board keeps to both as well. A sync drawing a lot of arrows
renews the board's lock every 100, so another server can't take the lock
while it's still drawing. A deferred sync that fails (another server taking
the lock, say) is logged and goes round once more; if that fails too, it's
logged again and dropped.

### Deleted, replaced and restored puzzles

Deleting a puzzle (`destroyPuzzle`) and bringing it back (`undestroyPuzzle`)
each queue a placement sync of that puzzle, as adding one does. The sync
goes by the puzzle as it is when it runs, under the board's lock, so a
delete and an undo in quick succession end up right whichever runs first.

- **Replaced.** When the delete names a replacement that's still live, the
  deleted puzzle's card becomes the replacement's: only its `puzzle` changes,
  so it keeps its id, place, frame, size, `manual`, lock and comment pins.
  If the replacement already had a card of its own, that card goes, and the
  lines and comment pins on it, and free pins that came off it, move onto
  the card that stays (a line between the two goes). The deleted puzzle's
  feeder arrows go and the replacement's are drawn. The replacement is synced
  in the same batch, after the hand-over, so its own placement finds the card
  rather than making another; one placed separately at the same moment
  either finds it too or has its card merged as above, since both take the
  lock. Someone putting the replacement on the board by hand doesn't take
  the lock, and if their card lands first the hand-over can't happen: the
  deleted puzzle's card is then hidden as below, and the lines and pins of
  any card the replacement had move onto theirs. After that the card is
  placed like any other: one nobody has moved goes to the replacement's
  round if that's a different one. If someone had already taken the deleted
  puzzle's card off the board, it stays off and the replacement keeps or
  gets a card of its own.
- **Deleted.** With no replacement, the card is hidden rather than removed,
  marked `hiddenWithPuzzle`, and its comment pins become free pins where they
  were, as when someone takes a card off the board. Feeder arrows to or from
  the deleted puzzle are hidden the same way, and later syncs leave them
  hidden rather than removing them. The "Not on the board" panel and the
  search only list live puzzles, so neither offers the card or its arrows,
  and putting either back is refused ("That puzzle has been deleted"). Reset
  layout's "put back" leaves them off too, as it does any arrow to or from
  the puzzle that someone took off by hand. Taking a card or arrow off by
  hand, or putting one back, clears `hiddenWithPuzzle`, so a person's choice
  isn't undone when the puzzle comes back.
- **Brought back.** The card comes back where it was, with the pins that
  came off it, and its feeder arrows are shown again (or drawn, if a sync
  removed them meanwhile). A card that has never been moved by hand then
  goes wherever its tags say, as usual. A card someone had taken off the
  board before the delete stays off. A puzzle that comes back after being
  replaced gets a card of its own, since its old one is the replacement's.

The client also leaves out any card whose puzzle isn't live (a puzzle
marked deleted without a board sync, as on older boards), so a `?comment=`
link or "Show on board" for a comment pinned to one says "That isn't on the
board any more."

Restoring a version (see History) is told which of the hunt's puzzles are
live, and treats a version's card for a deleted puzzle by what the board
has now:

- If the board's card with the same id was handed over to a replacement
  (and the version has no card of its own for the replacement), the
  version's card is that card, so it goes back to the version's place with
  the version's lines. The deleted puzzle's feeder arrows aren't drawn.
- If the board still has a card for the deleted puzzle, hidden with it,
  that card takes the version's place and lines but stays hidden, as do its
  feeder arrows, so they're all there if the puzzle comes back. A card the
  version had taken off by hand stays off that way.
- Otherwise the card isn't put back, nor are the lines to it.

A deleted puzzle's hidden card the version has no card for is left where
it is (moved out only of a frame the restore removes). A card or feeder
arrow that a version has hidden with a puzzle that has come back since is
restored as shown. Restoring single items from a preview follows the same
rules.

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
imports only `whiteboardComments.ts`, and the rest import it, so there's no
import cycle among them. It also holds the helpers more than one of them
needs, such as the coordinate checks. Taking comment pins off nodes and
putting them back (`detachComments`, `reattachComments`) lives in
`whiteboardComments.ts`, a leaf that imports no other whiteboard server
module, so placement in `whiteboard.ts` can use it too.

### The live channel

Cursors, drags, half-drawn strokes, selections, the text being typed in,
what each person is looking at and who they're following travel through
`Whiteboards.methods.setLive`
(`imports/server/whiteboardLive.ts`) several times a second per person, so
each connection remembers what its user may do on each board instead of
reading it on every call. That memory is dropped as
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

People who can comment but not edit still send their cursor, their view and
who they follow. Their drags, strokes, selections and editing are stored as
null rather than refused, since a refusal would come back every 100ms; anyone
outside the hunt is refused as before. On an archived hunt, where everyone
can only view, the client sends nothing at all; an update that arrives anyway
keeps only its cursor, as before, with its view and who it follows stored as
null. Someone who loses edit rights has their drags, strokes, selections
and editing cleared at once rather than on their next update, by
`clearLiveEditsOfNonEditors` in `whiteboardLive.ts`, which leaves alone
anyone who can still edit:

- `setEditPolicy` clears them for everyone on the board who lost them;
- each process's hunt observer, seeing a hunt archived (or its default
  roles change), clears them on its own connections' presence on that
  hunt's boards;
- each connection's user observer, seeing a role taken away or the hunt
  left, clears them on that connection's presence.

Anyone who can no longer comment (the hunt archived, or the hunt left) has
their view and who they follow cleared in the same pass.

The method unblocks, so updates from one connection can run side by side.
Each connection numbers its updates, and remembers per board the latest one
written, so one that's overtaken while it looks things up isn't written over
the newer one. An update whose access was dropped while it looked things up
(a demotion, say) writes only its cursor, with its drags, strokes,
selection, editing, view and who it follows stored as null, rather than what
was allowed when it started.

The board id must be a document id (the method's `check` and `setLive`
both refuse anything else), and a connection keeps nothing for a board until
the caller has been let onto it: what it remembers about a board (access,
the latest update written, how often its presence subscription stopped) is
only stored after the access check, for at most 16 boards, forgetting the
one it used longest ago. A board that's removed (a purged hunt's) takes its
presence rows and what every connection remembers about it with it, and
purging a hunt removes presence after the boards, so an update let on just
before can't put a row back.

Each connection has a token bucket for its live updates, across all boards:
`LIVE_UPDATES_PER_SECOND` (20) a second, in bursts of up to
`LIVE_UPDATE_BURST` (40). Each person has one too, across all their
connections: `LIVE_USER_UPDATES_PER_SECOND` (60) a second, in bursts of up
to `LIVE_USER_UPDATE_BURST` (120), room for a few busy tabs. An update takes
a token from both. The client sends far fewer than that. An update over
either limit is dropped before anything else is done with it, with no
error back, since the next one comes a moment later; the server logs that
it's dropping updates at debug level, once a minute at most per
connection.

#### Who's here, and following someone

Each update also carries `view`, what the sender is looking at: `{ x, y,
zoom }`, the board point at the centre of their canvas and their zoom. The
server checks it like the cursor: both coordinates within `MAX_COORDINATE`,
and the zoom within the board's own range, `MIN_ZOOM` to `MAX_ZOOM` (0.1 to
2, from `imports/lib/whiteboard/links.ts`). `ViewSender` (in `WhosHere.tsx`)
works it out from React Flow's viewport with `viewAtCentre`, rounded to a
tenth of a unit and held to those limits, and `useWhiteboardLive` sends it at
most every 200ms and only when it changes, whatever else is going faster. It
goes as null while the tab is hidden and while previewing a version, and
comes back with the tab.

`followedUser` is who the sender is following. It must look like a user id
and belong to someone with a tab on this board (a presence document there),
or the update is refused with "Followed people must be on this board"; as
with selections, the last one found is remembered per connection so it isn't
looked up again on every update. Both fields are optional, so an older client
isn't refused, and both are published with the rest of the presence.

Once anyone else is on the board, there's a stack of faces at the top right
of the canvas, `WhosHere`: the viewer first, then everyone else with a tab on
the board, each once however many tabs they have, bordered in their cursor
colour. It shows up to five faces and then "+N", and its tooltip names
everyone. The top-right panels (a thread, History, the Comments list, the
Outline, Not on the board) open below the stack: `WhosHere` measures it and
the canvas moves them down by that much. Someone's face, or their name in
the "+N" list, opens a small popover (a dialog, named for them) with:

- **Jump to their cursor**, which centres the board on where their pointer
  was last seen, at the current zoom. It's disabled until their pointer has
  been on the board since this viewer opened it, and says so under the
  button.
- **Follow** (or **Stop following**).

While following, the board takes their view whenever it changes, with a
120ms ease (`setViewport`), and a banner beside the stack, to the left of
the faces, says "Following Ada" with Stop. The banner, the note saying why
following stopped and the chip of who's following you all sit in the
stack's row rather than under it, so the panels below don't jump as they
come and go. Following stops at once, and the banner says why for a few
seconds, when:

- the viewer pans or zooms the board themselves: a drag, a pinch, the wheel,
  the zoom buttons, the mini map, search, the Outline, a link, or jumping to
  someone's cursor ("you moved the board"). A click or tap that doesn't move
  the board, to deselect or close something, leaves following alone;
- the person followed leaves the board, their last tab's presence going
  ("they left the board");
- the person followed hasn't moved their pointer or their view for 60
  seconds (`FOLLOW_IDLE_MS`; "they haven't moved for a minute").

React Flow reports a move with the input behind it, or none when code made
it. A move made by code stops following as it starts, except for the moves
the canvas starts itself to follow someone, which it counts. One with an
input behind it stops following only once the board actually moves, since
React Flow starts a move on any press of the board. The decisions are pure functions in
`imports/lib/whiteboard/follow.ts` (`startFollowing`, `followPresence`,
`followLocalMove`, `resumeFollowing`).

While previewing a version, following is paused: the banner says "Following
Ada is paused while you look at an earlier version.", nothing is applied and
neither the view nor who's followed is sent. Going back to now moves the
board to their current view again. Downloading a picture of the board
leaves following alone.

The follower's own `followedUser` tells the person followed: a chip beside
their stack says "Ada is following you", or "3 people are following you"
with the names in its title, for as long as anyone follows them.

On a phone the stack sits at the bottom right instead, above React Flow's
attribution, and under the comment sheet when one is open; each face is
44px, and the banner's buttons are too. Phones and other viewers who can
only comment can follow and be followed like anyone else. Viewers on an
archived hunt send nothing, so they aren't in anyone's stack; the stack only
shows while live updates are on.

#### Selections and "is editing"

Each update also carries `selection`, the ids of the nodes selected (at most
`MAX_LIVE_SELECTION`, 50, line ends left out), and `editing`, the node whose
text or label is being typed in, or the line whose label is. Both are checked
like a drag: ids must look like ids, and must be on this board (`editing` may
name a node or a line), the last set found there being remembered per
connection so an unchanged one isn't looked up again. A client that leaves
them out has them stored as null. `useWhiteboardLive` sends them at the cursor's
pace, only when they change, and null for both while the window is in the
background, while the tab is hidden and while previewing a version.
`EditableText` tells the canvas when typing starts and stops, as it already did
to keep collapsed frames open around it.

Everyone else on the board (anyone who can see it, viewers included) sees a
2px outline round each node someone else has selected, in that person's
cursor colour, with their name in a tag above its top left corner; several
people on one node get a ring each and one tag naming them all. The outline
and tag keep their size on screen at any zoom (`RemoteSelectionLayer`, beside
`CursorLayer`, which reads presence for selections alone, so cursor moves
don't re-render it). Nothing is drawn for the viewer's own selection in
another tab, for a node folded into a collapsed frame, or in a preview.

While someone is typing in a sticky, text box, frame label or line label,
its tag says "Ada is editing" with a pencil, and `EditableText` won't open
it here: double-click and Enter do nothing, the pointer stays an arrow, and
the title says "Ada is editing this". It opens again once their editing
clears, or once their presence has gone 30 seconds
(`REMOTE_EDITING_TIMEOUT_MS`) without changing at all, in case their tab has
stalled. While something is being typed in, `useWhiteboardLive` sends a fresh
`editingAt` every 10 seconds (`EDITING_KEEPALIVE_MS`), so the presence keeps
changing through a long edit with the pointer still, and only a tab that has
really stalled loses the cue. The server keeps `editingAt` only alongside
`editing`, after checking it's a real date, and publishes it with the rest.
`useWhiteboardOthersEditing` works this out from the presence documents with
`othersEditing` in `imports/lib/whiteboard/remoteActivity.ts`. It's a soft
lock, kept by the clients only: the server takes either person's save, two
people who start within one round trip both carry on as before, and the last
to save wins.

### On the client

`WhiteboardPage` works out the viewer's access with `whiteboardAccess` and
passes it to the canvas, which treats anything below `edit` as read-only and
anything from `comment` up as able to comment. On a phone (see Phones) the
page lowers `edit` to `comment` with the reason `narrow`. That is a layout
choice, not a security boundary, and the server never sees it. While Meteor
is disconnected the page also lowers any access to `view`, with the reason
`offline` (see Offline).

On a wide screen the board sits in the puzzle page's pane beside the chat,
as a puzzle's document does, with the minimise chat toggle (or, once chat is
minimised, its strip of buttons) at the pane's top left. The pane sets
`--jr-pane-left-inset`, and the canvas starts its top-left panel, the
toolbar, at least that far in, so the toggle never covers it.

A read-only board's toolbar says "Viewing only", gives the reason on the line
below, and keeps the Comment tool for anyone who can comment, and the
Comments button (see Comments) and Hide ink (see Ink) for everyone. When the
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
aren't found; the "Not on the board" panel lists them. Images, shapes and ink
have nothing to match, so the search passes them by.

### Outline

The Outline button, just after the search field on both toolbars, opens a
panel listing the board's frames as a tree: the rounds seeded from tags,
Ungrouped, and frames people made, nested as they are on the board. Each
level runs top to bottom and then left to right, as the frames sit, with
Ungrouped last. Each row shows the frame's label ("Unnamed frame" for a
hand-made one with none), a padlock if it's locked, a mark if it's
collapsed for everyone, the round's tick once it's finished or its star
once it's ready to meta, and "n/m solved" counting the cards directly
inside it, as its header does (see Rounds). Frames someone took off the
board aren't listed. The tree is `outlineTree` in
`imports/lib/whiteboard/outline.ts`, which also tolerates a parent loop by
listing the frames in it at the top level, as the board draws them. It
follows the board live, and works for anyone who can see the board,
archived hunts included.

Picking a row fits the view to that frame, with a tenth of the view's room
round it and the zoom kept within the board's limits, and pulses it as the
search does. Beside a wide board the panel stays open, so the fit also
leaves the panel's width clear on the right and the frame isn't left under
it. A frame inside a collapsed one opens that one for this viewer first
(see Collapsed rounds) and is fitted once it's drawn; a collapsed frame
itself is fitted as it's drawn, folded to its header. "Fit whole board",
above the tree, fits everything on show. A row with frames nested in it
has a chevron that folds them away in the panel only, leaving the board
alone; what's folded, and the row last focused, last until the board is
left, and opening the panel again scrolls back to that row. The rows are a
tree for the keyboard: Up and Down move between them (Up from the first
goes to Fit whole board), Home and End go to the first and last, Right
opens a folded row or steps into an open one, Left folds an open row or
steps out to its parent, and Enter fits the view to the frame. Escape
closes the panel, from inside it or from the board, and Delete and
Backspace in the panel don't touch the board's selection.

The Outline shares the top-right slot with Not on the board, Comments and
History, so only one of them shows at a time, and like them it gives way to
an open thread or a comment being started. The Outline button shows as
pressed only while the panel itself is showing; pressed while a thread has
its place, it closes the thread and brings the Outline back. On a phone it
opens as a sheet along the bottom, like a thread's, with rows 44px tall;
picking a row closes the sheet as the board moves to the frame, so the
frame isn't left under it.

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
then. A board that does fit itself on opening (no link and no saved view)
waits until all of it, ink included, has arrived, since ink comes on its
own subscription (see Ink).

The toolbar's link button, "Copy link to here", copies a link to the selected
card (`?puzzle=`), to a selected frame, note, text box, image or shape
(`?node=`), or else to the current view (`?v=`), for pasting into chat
(`boardLinkQuery` in `imports/lib/whiteboard/links.ts`). Nothing can be selected on a read-only
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

Except on a phone (see Phones), the mini map shows each card in its
solvedness colour and each frame and shape in its colour, faintly, so solved
rounds stand out. The card colours are the theme's `miniMapSolvedness`,
stronger than the card backgrounds so they show at that size, and frames and
shapes take the strong version of their colour, or a fainter grey when they
have none. Free line ends are left off, and everything else is grey
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
the board", History and Outline panels, so only one of them shows at a
time. It lists the board's threads with unread ones first and then the most
recent activity first, leaving out resolved threads unless the resolved
toggle is on, as the pins do. Each row shows what the comment is on, the first line of the comment,
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
`useChatImageUpload` in `imports/client/hooks/` (the composer, and chat's
in-place edit, through `useEditorImageUpload`, which keeps the note under
the editor), which uploads through
`uploadChatImage` in `imports/client/uploadChatImage.ts` (as the board's own
images do, see Images), and each shows a failure its own way: chat in a dialog, the composer in a line under it.
`uploadChatImage` sends a PNG, JPEG or GIF as it is (so a GIF stays
animated) and draws anything else (WebP, AVIF, BMP, SVG) to a canvas and
sends that as a PNG, through Insert Image's `convertImageToPng`, before
asking the server for an upload. An SVG opened straight from the bucket
would run any script in it, so `createChatImageUpload` refuses any type but
those three (`assertUploadableImageType`), whoever calls it. A file the
browser can't decode is refused before anything is uploaded, with "This
browser can't convert that image to PNG. Use a PNG, JPEG or GIF instead." A failed image
doesn't count as something to send, so a comment that is only a failed image
can't be sent. When the server has no S3 image bucket, the image isn't
uploaded and the composer says "Images can't be added here: this server has
nowhere to store them." in plain words, rather than the setup message chat
shows admins.

An image can be at most 10 MB (`MAX_UPLOAD_BYTES` in
`imports/lib/imageUploads.ts`) as it would be uploaded, after any change to
a PNG. `uploadChatImage` refuses a bigger one before asking the server for
an upload, and chat, the composer and the board each show "Images can be at
most 10 MB." their own way. The upload the server hands out refuses anything
bigger as well, but the POST is `no-cors`, so the browser can't see that
refusal: without the check, the message would be sent with an image that
isn't there.

The server takes an image in a message or comment only from this hunt's
uploads in the image bucket, named as chat's own are (`assertStoredChatImages`
in `imports/server/chatMessageContent.ts`, through the board's
`assertStoredImages`; see Images), so a message can't have its readers'
browsers fetch from anywhere else, or show another hunt's image that goes
blank when that hunt is purged; anything else is refused with "That image
isn't one we stored". An edit can keep the images the message already has,
wherever they are, so an older message's image doesn't stop it being edited.

### Highlights

On the board, the chat's Highlights panel has a Comments tab listing the
threads the viewer started or replied to (reactions don't count), by their
first comment. Picking a row scrolls chat to the comment, as in the other
tabs, and each row's "Show on board" closes the panel and shows the thread
on the board.

### Who hears about a comment

A reply goes to whoever left the comment and everyone who has replied since,
as long as they're still in the hunt (reactions don't count). Mentions and
dingwords in comments work as they do in chat.

A new comment pinned to a puzzle's card also goes to the people on that
puzzle: anyone with its page open in a visible tab, or in a hidden tab they
looked at in the last five minutes (the puzzle list's window), anyone in its
call, and anyone who has bookmarked it. Unlike the puzzle list, nobody is
placed on just one puzzle, so someone looking at the board itself still
counts for the puzzles they have open elsewhere. The comment's author is
left out, as is anyone not in the hunt, and each person gets one
notification for the message: someone mentioned keeps their mention, and
someone whose dingwords matched gets the board comment notification with
their words still recorded on it. Replies don't go to the puzzle's people,
and a comment on a note, a frame, a text box, a deleted puzzle's card or a
loose spot on the board goes to nobody beyond its mentions and dingwords.
`boardCommentAudience` in `imports/server/boardCommentAudience.ts` works out
who, from the `puzzle:<id>` subscribers, the call's peers (none while
`disable.webrtc` is on) and the bookmarks, and the chat notification hook
adds them; their rows carry `reason: "boardComment"`, the thread, and
`cardPuzzle` naming the card's puzzle.

The toast reads "Comment on <puzzle>" ("Comment on the whiteboard" if that
puzzle has since been deleted), with the sender's name and the comment's
first line, and links to the board with the thread open and chat at the
comment (`?comment=` and `#msg=`). Closing it dismisses it as any other.
These aren't dingwords, so muting dingwords for the board neither stops
them nor clears them. Turning off "Tell me about board comments on puzzles
I'm on" on the profile page stops new ones (ones already showing stay until
dismissed): it's stored as `boardCommentNotifications: false` on the user,
and unset means on. The toast's settings menu links there. Like every chat
notification, they aren't shown while the `disable.dingwords` flag is on.

## Editing

### Keyboard

The tool keys, 1 to 4, N, Ctrl+A, Ctrl+L, Ctrl+C, Ctrl+V, Ctrl+D and the
undo and redo keys only work while the board has focus (the last press or
focus was on it) and nothing is being typed: not in a text box, a note being
edited, the comment composer or the search field, where Ctrl+Z is the
browser's own. Each tool's tooltip shows its key.

| Key | Does | Needs |
|---|---|---|
| V | Select and move | edit |
| P | Pen | edit |
| E | Eraser | edit |
| L | Line | edit |
| S | Sticky note | edit |
| T | Text | edit |
| F | Frame | edit |
| R | Shape, a rectangle or an ellipse as picked beside it (see Shapes) | edit |
| C | Comment | comment |
| N | Go to the next comment thread with something unread (see Comments) | |
| 1, 2, 3, 4 | Thin, medium or thick pen, or the highlighter (see Ink) | edit |
| Ctrl+A (Cmd+A on a Mac) | Select everything but frames (a selected frame carries its contents anyway) and no lines, switching to Select | edit |
| Escape | Close an open Feeders popover, then an open comment thread, then the Comments list, then leave a preview, then close History or the Outline; with none of those open, drop a comment being started, a line being drawn, a click-to-connect line or an erase, and go back to Select | |
| / or Ctrl+F (Cmd+F) | Jump to the search field (see Search) | |
| Delete or Backspace | Delete the selection, leaving out anything locked (see Locks) | edit |
| Ctrl+C (Cmd+C) | Copy the selection (see Copy, paste and duplicate), unless some text on the page is selected | edit |
| Ctrl+V (Cmd+V) | Paste a copy from a board, text or an image, at the pointer or the middle of the screen | edit |
| Ctrl+D (Cmd+D) | Duplicate the selection and select the copy, only with the Select tool; with nothing selected or another tool it's the browser's own | edit |
| Ctrl+L (Cmd+L) | Lock the selection, or unlock it if it's all locked (see Locks), only with the Select tool; with nothing selected or another tool it's the browser's own | edit |
| Arrow keys | Move the selection 5 units, 20 with Shift; it joins or leaves a frame as a drop would | edit |
| Enter | Start editing a focused sticky note or text box, unless someone else is typing in it | edit |
| Ctrl+Z (Cmd+Z) | Undo your own last edit from this visit (see Undo and redo) | edit |
| Ctrl+Shift+Z (Cmd+Shift+Z) or Ctrl+Y | Redo the last edit undone | edit |
| Space (held) | Pan while a drawing tool is picked | |
| Shift (while drawing a line) | Snap a free end to 15° steps | |

In a text box being edited, Escape cancels, Enter saves a one-line label, and
leaving the box saves. Escape anywhere in a comment thread's panel closes it,
unless the composer's suggestions are open, when it closes those, or the
composer has something written in it, when it does nothing, so a slip of the
key doesn't throw the text away.

A touch screen has buttons for what's done here with keys (see Tablets and
touch).

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

### Tablets and touch

A touch screen that isn't compact (see Phones) edits by touch: a tablet, or
a touch laptop whose main pointer is a finger. `WhiteboardPage` asks
`(pointer: coarse)` and passes `coarse` to the canvas when it matches and
the screen isn't compact. That decides what the toolbar offers, that a
tap places a note, and that only a selected node can be dragged. Otherwise
what a press does is decided by the press itself
(`pointerType === "touch"`), so a mouse on a tablet works as it does on a
desktop, and a finger on a touch laptop draws, erases, draws lines,
selects by long press and pinches as it would on a tablet, though it
places a note as a mouse does.

What works by touch:

- **Placing.** With the sticky, text, frame or shape tool, a tap places one
  at the size a click gives, centred on the tap, and opens it for typing (a
  shape has nothing to type in, so it doesn't). As with the Comment tool, a
  finger that moves more than 10px first pans the board instead, and a
  second finger pinches; neither places anything. There's no dragging out a
  size by touch: resize it after. A stylus places by tap too, since the
  browser pans from its touch events whatever the canvas does with its
  pointer events; only a mouse drags out a size. The tap puts focus in a
  hidden input inside the board for a moment, since iOS only brings up its
  keyboard for a focus made in the tap itself, and the note's editor takes
  focus from it once the note shows. Text being typed on the board (a note,
  a text box or a label) is 16px on a touch screen, so iOS doesn't zoom in
  on it. If the keyboard (`useKeyboardInset`) would cover the note, the
  board pans it up to 16px above the keyboard, as far as its top can go
  without leaving the board.
- **Selecting.** A long press on a node (an ink stroke too, which selects
  the whole stroke), 500 ms without moving more than
  10px (`LongPress` in `imports/client/components/whiteboard/touch.ts`),
  adds it to the selection and shows its toolbar; a second long press adds
  another. The click the browser makes on letting go is ignored, so it
  doesn't select just that one again or follow a card's link, and the
  browser's own long-press menu doesn't show on the board, though it still
  does on the toolbars and comment panels, and for anyone who can't edit
  (whose long press selects nothing). A tap on a node selects it as
  a click does, and a tap on the empty board clears the selection.
- **Select area.** A toggle on a touch screen's toolbar. While it's on, one
  finger dragged on the empty board draws a box, and what's wholly inside it
  is selected, as Shift-drag does with a mouse. Picking another tool, Cancel
  or Escape turns it off. A second finger drops the box and anything it had
  selected so far.
- **Moving.** Only a selected node can be dragged (`dragOnlySelected`), so a
  finger on one that isn't selected pans the board, as it would on the
  empty board; a tap or long press, then a drag, moves it. This goes for a
  mouse on a tablet too. A drag moves the node once it's gone 10px (React
  Flow's `nodeDragThreshold`, 1px elsewhere), so a long press that wobbles
  a little still selects. A finger gets a 44px target on a selected node's
  handles and resize corners, and on a selected line's grips, at any zoom,
  without them looking any bigger (`TouchTargetSize` sets the sizes, and
  allows for React Flow scaling resize corners up when zoomed out).
- **Pen and eraser.** One finger draws or erases. Pressure comes from a pen
  that reports it and is simulated otherwise, as with a mouse. A stroke
  drawn by touch goes out on the live channel as it's drawn, but the cursor
  isn't sent for a finger. There's no palm rejection: a hand resting on the
  screen counts as a finger.
- **Lines.** The line tool draws with a finger dragged from one thing to
  another. A handle can be dragged from, or tapped for click-to-connect;
  while a click-to-connect line waits, every node's handles show, since
  there's no hover to find them by.
- **Two fingers.** Two fingers pan and pinch whatever tool is out. React
  Flow does this itself while one finger pans (Select, or a tool that
  places by tap); while the pen, the eraser, the line tool or Select area
  has the first finger, the canvas does it: the board point between the
  fingers stays between them and the zoom follows how far apart they are.
  The second finger drops whatever the first had started (a line, an erase,
  a long press, an area being selected, or a stroke, unless part of a long
  one has already been saved, when it ends where it got to), and neither
  finger does anything more until it's lifted.

On a touch screen the edit toolbar gains, beside Undo and Redo, Delete
(leaving out anything locked, as the key does), Copy, Paste and Duplicate,
each greyed out with nothing selected except Paste. Copy and Paste use the
Clipboard API (`navigator.clipboard.writeText` and `readText`), and each is
left off where the browser doesn't have it. Paste takes a copy from a board
or text, not images, and puts it in the middle of the view; the browser may
ask first, and if the board has gone read-only by the time the text
arrives (a version opened meanwhile, say) nothing is pasted. While a tool
is out, Select area is on, a comment is being started, or a line is being
drawn or waits for a click-to-connect end, a Cancel button does what Escape
would: drops it, turns off Select area and goes back to Select.

The tool buttons' names (read out by a screen reader, and shown as
tooltips) describe touch rather than keys on a touch screen, for example
"Sticky note: tap to place".

What stays desktop only: the tool, pen width and other keys, Space to pan,
Shift to snap a line's angle, Ctrl-click to add to the selection (a long
press does that), dragging out a note's or shape's size, arrow-key nudges,
and pasting images (Image on the toolbar still picks a file).

### Lines from handles

Each card, note, text box, frame, image and shape has a handle on each side.
Dragging from one draws a line to wherever it's let go. Clicking one instead starts a line
that ends at the next handle clicked; until then the handle is ringed in the
theme's primary colour and a dashed line runs from it to the pointer, so it's
clear the next click joins something. Escape, or picking another tool, lets
go of it, as does Cancel on a touch screen (see Tablets and touch), where a
tap on a handle and then another joins them. A locked node's handles only end lines: a line can be drawn to it,
but not started from it.

### Copy, paste and duplicate

Ctrl+C (Cmd+C) copies the selection and Ctrl+V (Cmd+V) pastes it, on the
same board or another one, for anyone who can edit. On a touch screen the
edit toolbar has Copy, Paste and Duplicate buttons too (see Tablets and
touch); its Paste takes text only and lands in the middle of the view. A copy takes:

- the selected notes, text boxes, frames, images, shapes and ink, with
  everything inside a selected frame (folded away or not) where it is in the frame, and
  every segment of a selected ink stroke;
- each hand-drawn line whose ends are both in the copy, or free, as long as
  one end is in it or the line itself is selected, with its style and label;
- the free ends those lines use, and no others.

Puzzle cards are left out, since a puzzle has one card, along with any line
to one; when cards are all that's selected, copying says "Puzzle cards can't
be copied" and leaves the clipboard alone, and when there's more besides, a
copy or duplicate takes the rest and says "Puzzle cards were left out".
Feeder arrows, comments, locks and who made what aren't copied either. A
round's frame is copied as a plain frame with the round's name as its label,
and a folded frame stays folded. An image is copied by its address, with
both its sizes, so its paste shows the same upload rather than a new one.
An image uploaded in another hunt can't go on this hunt's board (see
Images), so a paste from another hunt's board leaves its images out, with
any line to them, pastes the rest, and says "Images from another hunt were
left out" (`withoutOtherHuntsImages` in `clipboard.ts`).

A paste puts everything back with fresh ids, so it can go onto the board it
came from or any other, as often as wanted. It keeps its layout, centred on
the pointer while that's over the board (not its toolbars) and otherwise on
the middle of the screen. Anything at the top of the copy goes where a drop
would put it: into the innermost frame under its middle, though never a
collapsed or locked one, nor a frame that was copied or anything inside it
(so a duplicated frame sits beside the original rather than in it), or
otherwise the top level; an ink stroke goes as one, by the middle of the
whole stroke. What was inside a copied frame stays inside the pasted one.

Pasted text that isn't a copy from a board becomes a sticky note with that
text, trimmed and cut to the 2000 characters a note can hold; a single web
address (http or https, nothing else with it) becomes a text box with the
link instead. Both land as a paste does. An image on the clipboard is
uploaded and added as an image node at the pointer or the middle of the
screen (see Images) when there's no text with it, or the copied HTML is
nothing but the image, as a browser's Copy Image gives. A copy from a
spreadsheet or word processor, which brings a picture of itself along with
its text, pastes as text, as before. A copy from a board
this version can't read says "That copy can't be pasted here".

Once a paste or duplicate is on the board, what it made is selected in
place of what was selected before: the nodes at the top of it (a pasted
frame carries what's in it) and its lines. So pressing Ctrl+D again copies
the copy, and a row of copies fans out 24 units further each time.

Ctrl+D (Cmd+D), or Duplicate under the selection (shown when nothing
selected is a card, titled "Duplicate what's selected, a little below and
to the right [Ctrl/⌘+D]"), copies the selection in place, 24 units right
and down, without touching the clipboard. It takes the same things a copy
does and lands by the same rules.

A paste or duplicate goes through `upsertNodes` and then `upsertEdges` as
new inserts, so the board's caps, access and locks apply as for anything
drawn: what's pasted is unlocked, and lists the person who pasted it as its
creator. It's one step for Undo, which deletes the lot. If the server
refuses any of it, the usual "Couldn't save" alert shows and whatever got
through is deleted again. That includes a paste with more ink than the
board has room for, refused with "This board has as much drawing as it can
hold" (see Ink).

On the clipboard a copy is plain text: `jolly-roger-whiteboard/1` on the
first line, then the copy as JSON, with each node's position on the board
rather than in its frame and its parent, if any, given as another node in
the copy. Nothing else goes on the clipboard, so pasting a copy into another
app shows the JSON. A paste that starts `jolly-roger-whiteboard/` but isn't
a version 1 copy that holds together (every parent a frame in the copy, no
loops, every line between two nodes in it, an image node with its image and
size and nothing else with an image, a shape node with a known shape and a
size and nothing else with a shape, values within the server's limits, ids
of at most 64 characters and image addresses of at most 2,048) is refused,
as is one longer than `MAX_CLIP_LENGTH` (32 MB of text, about what a whole
board at its caps copies to), which isn't even parsed, so a planted one
can't hang the tab. `copySelection`, `readClip`, `clipFromText` and
`pasteClip` in `imports/lib/whiteboard/clipboard.ts` do the work.

### Images

An image node shows a picture uploaded to the server's S3 image bucket, the
one chat images go to. There are three ways to add one, all for people who
can edit:

- the Image tool on the toolbar (titled "Image: pick a file to add in the
  middle of the view, or paste or drop one on the board"), which opens a
  file picker (images only, one or several) and puts each image in the
  middle of the view;
- pasting an image with Ctrl+V (Cmd+V) while the board has focus, which puts
  it at the pointer, or the middle of the screen when the pointer isn't on
  the board;
- dropping image files on the board, which puts them where they're dropped.
  A file dropped into the comment composer is left to it (it goes in the
  comment, not on the board), and one dropped on a panel over the board,
  such as History or Not on the board, adds nothing.

Several images at once go 24 units right and down from each other. Each is
read for its size in pixels first; a file the browser can't show as an image
says "That file isn't an image the board can show" in the usual "Couldn't
save" alert. While it uploads a dashed grey placeholder with a spinner sits
where it will land, at its own size in pixels but no wider than 480 units,
keeping its shape. The placeholder is only on this screen and isn't saved. The
upload goes through `createChatImageUpload` for the board's backing puzzle and
a POST to the bucket (`uploadChatImage` in
`imports/client/uploadChatImage.ts`, which turns anything but a PNG, JPEG or
GIF into a PNG first, as for comments); once it's done, the node is saved
through `upsertNodes` in the frame under its middle, as one step for Undo. A
failed upload takes the placeholder away and shows why in the "Couldn't save"
alert, and nothing is saved; that includes a file over 10 MB, which is refused
before anything is uploaded (see Reactions and images). Images already on the
board (as this client has them) and those still uploading count towards the
board's cap on images, and files past it aren't uploaded at all: the alert
says "This board can't take any more images", as the server would.

When the server has no image bucket the Image tool is disabled, titled
"Images can't be added here: this server has nowhere to store them.", and a
pasted or dropped image shows the same words as a notice and uploads nothing.
Dropping a file on a board that can't be edited does nothing, rather than
leaving the page to show the file.

An image draws at the node's size (`ImageNode`), and resizing it from a
corner keeps its shape. It has handles for lines, takes comments ("an
image"), can be locked, and lists who added it, like a note, but has no
colour to pick. Zoomed right out it's a grey box with a picture icon. Copy,
paste and duplicate carry images (see Copy, paste and duplicate), and Undo
puts a deleted one back with the same upload.

On the server, `upsertNodes` takes a new image node only with an `image` of
`{ url, width, height }` (its size in pixels) and a width and height for the
node. The address must be an object in the configured bucket named the way
`createChatImageUpload` names chat images, by a hunt's id, a puzzle's id and
an upload's id
(`https://s3.<region>.amazonaws.com/<bucket>/<hunt>/<puzzle>/<upload>`;
`assertStoredImages` in `imports/server/getS3UploadParams.ts`, which chat and
comments use too). The hunt must be the board's own: purging a hunt removes
everything under its id, so an image from another hunt could go blank on this
board when that hunt is purged. An image from another hunt, anything else (a
`data:` address included), or any image at all when there's no bucket, is
refused with "That image isn't one we stored". Once the node is made its
`image` never changes: an update that sends a different one is refused with
"An image can't be changed", and one sent on any other kind of node with "Only
image nodes have an image". A board takes at most `MAX_IMAGES_PER_BOARD` (100)
images, which count towards its node cap too. Deleting an image node leaves
the file in the bucket, as deleting a chat message does, and purging the hunt
removes it with the rest of the hunt's images.

### Shapes

The Shape tool (R, titled "Shape: click to place, or drag to size") places a
rectangle or an ellipse, whichever the select beside it says while the tool
is out. The choice is remembered in this browser (`whiteboard:shapeKind`)
and starts as a rectangle. A click places one 160 by 120 centred on the
click, a drag places one the size of the box dragged out, and on a tablet a
tap places one as a click does (see Tablets and touch). Either way it goes
in the frame under its middle, and the tool goes back to Select. Nothing
opens for typing: a shape holds no text, so a text box goes on top of one
for a label.

A shape is drawn by `ShapeNode`, filling the node: in its colour's pastel,
the same one a sticky note of that colour has, outlined 2 units thick in the
strong version of the colour. A new shape has no colour, which leaves it
clear with an outline in the theme's text colour, so it can ring a group of
cards without hiding them. Picking a colour from its toolbar fills it in,
and the toolbar's last swatch, No fill, takes the colour away again (saved
as `color: null`, which the server unsets). Shapes sit above frames and
below cards, notes, text, images and ink, so a filled one can mark out a
group of cards behind them, the cards inside an outline still take clicks,
and a line end let go over a card inside a shape attaches to the card. A
selected shape stays there too: React Flow lifts a selected node 1,000 above
where it stacks, so the canvas hands it a selected shape that much lower
(`keepSelectedShapeDown` in `useWhiteboardSync`). Zoomed right out a shape
is drawn as just its filled outline, kept 2 pixels thick, and its padlock if
it's locked, with no names.

Otherwise a shape is a node like a note: it's at least 40 by 40 and resizes
from its corners and edges, has handles so the line tool and
click-to-connect join it (a line end let go anywhere over it attaches to it,
and a line to an ellipse ends on its outline rather than the box around it),
takes comments ("a rectangle" or "an ellipse"), can be locked, lists who
made and recoloured it, folds away inside a collapsed frame, and goes
through copy, paste, duplicate, undo, history, restore and export. Search
doesn't find shapes, since there's nothing in one to match, and they count
towards the board's node cap.

On the server, `upsertNodes` takes a new shape node only with a `shape` of
`rect` or `ellipse` and a width and height ("Shape nodes need a shape and a
size"); any other value is refused, by the method's check and again by
`upsertNodes` ("Unknown shape"). Once the node is made its `shape` never
changes: an update that sends a different one is refused with "A shape
can't be changed", and one sent on any other kind of node with "Only shape
nodes have a shape". These checks run over the whole batch before any of it
is written.

### Ink

The pen draws a stroke as the pointer moves, dropping samples within half a
unit of the last one kept, and saves it in segments of up to
`MAX_INK_POINTS` (500) points that share a stroke id, each repeating the
last two points of the one before so the joins overlap (`InkSegmenter` in
`imports/lib/whiteboard/ink.ts`). While it's drawn the stroke goes to
everyone else on the live channel.

The pen width select beside the pen has four widths: thin, medium and thick
(3, 6 and 12 units) and the highlighter (`marker`, 24 units), picked there
or with 1 to 4. The width is remembered in this browser and starts at
medium. While the highlighter is picked the pen's toolbar button shows a
highlighter instead of a pen. A highlighter stroke is the same width all the
way along, whatever the pressure, and is drawn at 40% opacity
(`MARKER_OPACITY`) and blended with what's under it, multiplied on the light
theme and screened on the dark one (`marker.ts`), so a card or note under it
still reads. Since a node is drawn on a layer of its own, the blend goes on
the whole node that holds a highlighter stroke (the canvas's
`.react-flow__node-ink:has(.jr-ink-marker)` rule), so its padlock, names and
selection outline are blended with it too; a stroke being drawn, here or by
someone else, blends itself. Where a long stroke's segments overlap at a
join, the overlap is a little darker. Otherwise a highlighter stroke is ink
like any other: simplified the same way, counted in the same budget, erased,
undone, copied and kept in versions the same, and only its `strokeWidth`
says what it is.

`upsertNodes` simplifies each new segment before storing it, with
Ramer-Douglas-Peucker (`simplifyInk` in `ink.ts`): between any two points it
keeps, it keeps the one furthest from the straight segment joining them if
that's more than `INK_SIMPLIFY_TOLERANCE` (half a unit) away, until none is,
so every point it drops is within half a unit of the stroke as stored. The
first and last points always stay, so a segment of two or more points keeps
at least two, and each point kept keeps its own pressure. Distance is
measured to the segment rather than the whole line, so a stroke that
doubles back keeps its turn. A straight run comes down to its two ends. A
segment sent with more than 500 points is still refused, before
simplifying. Only new segments are simplified; a saved stroke's points never
change. To draw a simplified stroke as it was drawn, `inkPath` fills in
points along any gap longer than 4 units before working out the outline
(`filledIn`), and the eraser measures to the line between samples rather
than to the samples alone. Filling in adds at most `MAX_FILLED_POINTS`
(2,000) points to a stroke, spacing them further apart on a stroke longer
than that allows, so a stroke whose samples are far apart (anything within
the coordinate limit is allowed) still draws quickly, saved or live.

A board holds at most `MAX_INK_POINTS_PER_BOARD` (200,000) points of ink,
counted after simplifying, which is about 6 MB. `upsertNodes` counts the
board's ink (`inkPointsOnBoard` in `whiteboardShared.ts`, summed by the
database, which reads every ink document on the board to do it) plus the
batch's, and refuses the whole batch, before anything is written, with
"This board has as much drawing as it can hold". Only a batch that adds ink
is checked, so a full board still takes notes, lines and moves. Like the
other caps, the count and the new ink's write happen under the board's lock,
so people drawing at the same moment can't together take a board past the
budget. A long stroke is saved a segment at
a time, so one that reaches the budget part-way keeps the segments saved
before it. A paste goes through the same check (see Copy, paste and
duplicate), and so do restores: a version whose ink is past the budget, and
more than the board has now, is refused with "This version has more drawing
on it than a board can hold", and Restore this item with "This board has as
much drawing as it can hold" (see History).

Hide ink (a toggle on both toolbars, titled "Hide ink", pressed while ink
is hidden) takes ink off the board for this viewer, for a board where it's
in the way. It's remembered in this browser for every board
(`whiteboard:hideInk`, beside the feeder arrows toggle), and starts off
shown. Like the other settings kept in this browser (pen colour and width,
shape, line style, feeder arrows, showing resolved comments), it follows a
change made elsewhere in the same tab as well as in other tabs. With storage
blocked or full, a change still holds for the rest of the visit, including
in parts of the page opened after it, and is saved by the next change once
storage takes it again. Ink comes on its own publication,
`Whiteboards.publications.inkForBoard`
(`imports/server/publications/whiteboardInk.ts`), and `contentsForBoard`
sends everything else and no ink. Both publish to members of the hunt, and
nothing to anyone else or while `disable.whiteboard` is on
(`boardForMember` in `whiteboardShared.ts`). While ink is hidden
`WhiteboardPage` subscribes with `outlines: true`, which sends each segment
without its points: where it is, how big and what frame it's in, which is
a small part of the bytes. The canvas keeps those as hidden nodes that
can't be seen or selected, so resizing a frame from its top or left edge,
Fit to contents and Tidy treat the ink in it as they would if it were
shown, and undoing a stroke drawn before ink was hidden still works.
Copying a frame while ink is hidden leaves its ink out.

Hiding ink puts down the pen or the eraser, and picking either up (from
the toolbar or by its key) shows ink again; hiding it in another window
does the same. Someone else's stroke still shows while it's being drawn. A
version being previewed is shown without its ink, and if the version or
the board has any, the preview banner says "Ink is hidden, so it isn't
shown here. Restoring this version still puts its drawing back as it
was."

### Not on the board

The toolbar's "Not on the board" button (with a count of everything in it)
opens a panel in three parts, for anyone who can edit:

- **Puzzles**: cards someone deleted, which only hides them, and live puzzles
  with no card. "Put back" puts the card at the middle of the screen. A
  deleted puzzle's card isn't listed (see Deleted, replaced and restored
  puzzles). `missingCards` and `hiddenFeederArrows` in
  `imports/lib/whiteboard/notOnBoard.ts` build the puzzle and arrow lists.
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
  align or distribute, a burst of arrow-key nudges, Fit to contents, Tidy
  and Place by tags, each as one step, and a move that grows the frames it
  lands in undoes the growth with it. Undoing a move puts the node back
  where it was and leaves it marked as moved by hand, as any move does;
- text, frame labels, line labels and colours, which go back to what they
  were, or to none;
- creating something (a note, text, frame, image, shape, line or ink
  stroke), which undo deletes, and a paste or duplicate, which undo deletes
  as a whole;
- deleting something made on the board (a note, text, frame, image, shape,
  ink stroke, line or a line's free end), which undo puts back with the same id and
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
frames, notes, text, images, shapes and ink can be locked; a line's free end
can't.

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

A locked node shows a padlock: on the top-right corner of a card, note, text
box, image or shape, sitting over its edge so it isn't confused with a locked
puzzle's padlock inside a card, and in the header of a frame. A locked ink stroke
shows one, on the corner of whichever of its segments reaches furthest
right (`InkNode`). Zoomed right out, a locked frame's label carries a small
padlock. The padlock's title says who locked it ("Locked by Carol"), or just
"Locked" when the client doesn't know them.

On the client a locked node isn't draggable (React Flow's per-node
`draggable: false`, which also keeps it out of arrow-key nudges and out of a
group drag), has no resize handles or colour picker (and a frame no Fit to
contents button), and its text or label can't be opened for editing (a
frame keeps its fold button, and a frame label being typed when a lock
arrives is kept as unsaved, as notes keep theirs). The eraser passes over locked ink. Delete leaves locked nodes out
and says "Some of those are locked", or "That's locked" when everything
selected is. Align and distribute leave locked nodes out (`selectionUnits`
skips them), Place by tags sends only the unlocked cards selected, Fit to
contents and Tidy say "That's locked" when a lock is in the way (see
Rounds), a locked frame doesn't grow for something dropped into it, and the
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
node passes when the same batch moves and resizes its frame and the node
stays where it was on the board, measured against where the whole batch
leaves the frame (`staysPutInMovedFrame`). The frame's change must be a
real resize from the top or left: an origin that moves keeps the opposite
edge where it was. Listing the frame again later in the batch, moving it
without resizing it, or moving and resizing it at once doesn't let the node
through. So a lock keeps a node's place on the board through a resize, not
its place in the frame: shrinking a frame from the left, moving it back and
widening it from the right, each an ordinary edit, leaves a locked node
further left in it.
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
their locks; restoring a whole version puts each node back where the version
had it. Both record a version first. An operator's Restore this version
puts back the version's locks too, so it can unlock or lock nodes, and for
an operator the preview marks a node whose lock, or who holds it, differs.
Anyone else's Restore this version changes the layout but never who holds a
lock: every node keeps the lock it has on the board, and nodes the restore
brings back come back unlocked. For them the preview doesn't mark lock
differences, since their restore won't change any, though it still shows
the version's padlocks. Place by tags on a locked card is refused ("That's
locked"), and so is Restore this item when it would change anything a lock
covers, or the lock itself, on a node that's locked on the board
(`restoreItems`), since both are a person's edit to chosen things. Whoever
locked it, or an operator, unlocks it first. Restore this item on a node
that's unlocked on the board, or one the board no longer has, puts it back
as the version has it. For an operator that includes the version's lock;
for anyone else, as for Restore this version, a node unlocked on the board
stays unlocked, and one the board no longer has comes back unlocked
(`planItemRestore` with `keepLocks`).

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
and operators at any time. The check for replies and the delete run under
the thread's `chat-message:<id>:thread` lock, which a reply also takes to be
written, checking the comment is still there, so a reply sent while the
author deletes is either seen by the check or refused, never deleted with
the thread unseen.

### Editing and deleting from chat

Comments and their replies are chat messages, so the chat's own Edit and
Delete (on the hover pill of the user's own messages) work on them too, under
the board's rules rather than chat's:

- **Edit** changes the text and nothing else: a comment keeps its pin, a reply
  keeps its thread, and nobody is notified again. Notifications already sent
  keep the text as it was. Like a new reply, an edit needs a board that can
  be commented on, so it's refused on an archived hunt. An edited comment or
  reply shows "(edited)" in the thread's panel, with when in its tooltip.
- **Delete on a reply** works as in chat: the reply stays in the thread as
  "Message deleted", its reactions and notifications go, and replies to it keep
  their place. It can't be pinned or reacted to again. The pin's count, the
  Comments list and unread dots leave it out, but it still counts as someone
  else's reply when the comment's author goes to delete the thread. It's
  refused on an archived hunt, as an edit is.
- **Delete on a comment** goes through `deleteWhiteboardComment`, the same as
  Delete on the thread's panel, with the panel's wording, and the whole thread
  goes. Chat offers it only while nobody else has replied; an operator deletes
  a thread others have replied to from the board.
  `ChatMessages.methods.delete` refuses a comment, so a comment is never left
  as "Message deleted" with its thread hanging off it.

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
write. An `upsertNodes` or `upsertEdges` batch that adds anything records with
`recordVersionBeforeLockedEdit` instead, from under the board's lock once the
caps are counted (see Data model), so a batch the caps refuse records
nothing. Restoring one item (`restoreItems`, below) records the same way from
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
records the board it's about to change, unless the newest version is a reset
or restore by the same person from under a minute ago, which it joins
instead: someone resetting or restoring over and over, with nothing else in
between, stores at most one version a minute. An edit in between records a
version of its own (the first after a reset or restore always does), and the
reset or restore after it records another, so nothing limits a loop of
restore, edit, restore beyond the history's size cap. Someone editing
steadily gets a version every 10 minutes, and a burst of edits is one
version. The fast
path (rule 1) is one indexed read with no lock, for a batch that only
changes what's there; the rest takes the board's
`whiteboard:<boardId>` lock, which placement also takes, so a version never
sees half a placement. A failure to record is logged and the edit goes ahead:
a missing version beats a refused edit. Changes to nodes and lines already
on the board are written without the lock, so a version can catch part of
someone else's batch of changes; restore cleans up what that can leave. A
batch that adds anything takes the lock for its count, its version and its
inserts, so a version never holds part of its new nodes or lines.

### The History panel

The panel lists versions by day, newest first. A version is the board before
the edits it lists, so each row names a state: "Now", then "Before edits by
Alice and Bob, 14:20 to 14:29 (37 changes)" (a change is one save, whatever
it held), "Before Carol reset the layout · 14:02" or "Before Carol restored
the 12:10 version · 13:40". When older versions have been pruned, the panel
ends with "Older history was cleared to save space". With history turned off
it says so instead.

Picking a row previews it. The client fetches the version's chunks with
`Whiteboards.methods.fetchVersion`, one call per chunk (not unblocked, so a
connection's fetches run one after another), joins them, unpacks them
with `DecompressionStream("gzip")` and hands the nodes and lines to
`useWhiteboardSync` in place of the live board. While previewing, the board
can't be edited or commented on, comment pins, cursors and other people's drags
are hidden, the viewer's own cursor comes off everyone else's screens, and a
banner at the top says "Viewing the board as it was at 14:20." with "Restore
this version" and "Back to now". Nodes and lines the version has differently
from the board as it is now get a pink outline (`versionDifferences` in
`imports/lib/whiteboard/versions.ts`): ones the board no longer has, and ones
with a different place, frame, size, text, label, colour, ends, line style, or
hidden or collapsed state, and for an operator a different lock or locker
(see Locks). They're matched by what they are, as a restore matches them, so
a card that has only changed id isn't marked. The outline
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
are lines with a missing end and free ends no line uses. Cards for deleted
puzzles aren't put back (see Deleted, replaced and restored puzzles). A
restore that would take the board past its node or line limit is refused
("This version has more on it than a board can hold"), as is one whose ink
is past the ink budget and more than the board has now ("This version has
more drawing on it than a board can hold"; see Ink).

Node and line ids are chosen by clients, and a deleted node's id is free
again, so an id the restore would insert may have been taken by a document
on another board since. Each one that has is inserted under another id
instead, with the plan's references to it (parents, line ends, changes)
renamed to match, and comments that came off the old id still go back on
it. The new id is worked out from the board's id and the old one, trying
again a few times if that's taken too before falling back to a random id,
and one on this board that the restore removes counts as free. So
restoring the same version again, or finishing a restore that failed
part-way, gives the node the same id, and its comments come back to it.
The same goes for restoring one item, though there nothing is removed, so a
node already back under its new id gets another.

Only after that does it record the board as it is (a version of kind
`restore`), or join the same person's reset or restore from under a minute
ago instead (see What a version is), so a refused restore records nothing.
Then:

- Cards for puzzles the version doesn't have stay, moved to the top level at
  the same place on screen and no longer marked as moved by hand. After the
  lock, a placement sync of the hunt's puzzles puts them in their rounds and
  redraws feeder arrows.
- Comments on nodes the restore removes or hides become free pins where they
  were, remembering the node in `comment.detachedFrom`. Deleting a node does
  the same.
- Everything else is put back as the version has it, locks included for an
  operator (`userMayWritePuzzlesForHunt`). For anyone else `planRestore`
  takes `keepLocks`: each node keeps the `locked` and `lockedBy` it has on
  the board, and nodes the restore inserts come back unlocked, so a whole
  restore changes the layout but not who holds a lock.
- Free pins that came off a node the restore brings back or unhides go back
  on it.
- The board's `lastRewrittenAt` is set.

Documents a restore changes or puts back draw on top of anything else at their
level, since their `updatedAt` is new: documents it inserts again get the time
of the restore rather than the one stored in the version. Edits that land
while a restore runs may survive on top or be overwritten. A restore that
loses the board's lock part-way stops and says so (see "When the board is
busy" below). Every step of the write can be run again, so a restore that
fails part-way for any other reason (a database error, say) reads the board as
it was left, plans again from there to the same version, and writes that,
putting back comments the first attempt would have, so the board isn't left
half restored. Only if that fails too is the error returned. The version this
restore recorded still holds the board as it was just before it; when it
joined the same person's reset or restore from under a minute ago instead, the
history holds only the board from before the first of those. Pins that came
off a node before this feature have no `detachedFrom` and stay free.

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
board isn't restored, nor is its free end, and neither is a card for a
deleted puzzle or a line to one. Putting things back that would
take the board past its node, line or image limit is refused with "This board is
full", and past its ink budget with "This board has as much drawing as it
can hold".

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
(`MAX_VERSION_BYTES_PER_BOARD`), never dropping the newest. Resets and
restores count towards that cap like any other version. Once the hunt is
archived, or the board has gone 14 days without a new version, its history
thins to the newest 10 versions plus every reset and restore. Anything pruned
sets the board's `versionsPrunedBefore`. A recording that takes the board
over the cap prunes there and then, and never refuses the edit. The daemon
also removes chunks over an hour old that have no version (left by a write
that didn't finish), and logs each board's history size once a day, so an
ink-heavy board shows up before it reaches the cap. A board that fails is
logged and left for the next pass, and the rest carry on.

### Export

The Download menu, on both toolbars, saves the board as a picture or as
data. It isn't shown on a phone. Anyone who can see the board can use it,
including people who can only view or comment and everyone once the hunt is
archived. While a download is being made the button shows a spinner, is
titled "Preparing the download" and can't be used again; a failure says why
under the toolbar ("Couldn't download the board: ..."). The date in each
file name is the day it's downloaded.

**Picture (PNG)** draws the board with `html-to-image` (pinned to 1.11.11,
the version React Flow's download-image example uses; dependabot leaves it
alone), as React Flow's own export example does (`boardPng` in
`imports/client/components/whiteboard/boardFiles.ts`): it takes the bounds of
every node on show (`getNodesBounds`), adds 40 units of background round
them, and draws React Flow's viewport at that size (`getViewportForBounds`)
on the board's background colour (`whiteboardBackground` in the theme, which
the board on screen uses too). It's drawn at twice the board's size, and
scaled down so the longer side is at most 8,192 pixels (`exportImageSize`
in `imports/lib/whiteboard/exportFiles.ts`). While it's drawn the board
renders every node rather than just those in view, and leaves out cursors,
other people's selections and drags, comment pins, a preview's highlights,
the viewer's own selection, and anything they're part-way through drawing,
joining, uploading or placing; it waits for the nodes that were out of view
to be measured (up to 120 frames) and then puts things back. It shows the
board as this viewer sees it, so hidden ink and folded frames stay that way,
and while a version is previewed it's a picture of that version. Images on
the board are fetched again to go into the picture, and one the browser
can't fetch is left blank. The file is called
`<hunt name>-whiteboard-<yyyy-mm-dd>.png`, by the local date, with each run
of characters a file name can't hold in the hunt's name replaced by a hyphen
(`exportFileName`), and "hunt" for a name with nothing else left.

**Data (JSON)** is the board in a version's payload format,
`{ format: 1, nodes, edges }` as EJSON, with every node and line as stored:
ink with its points (even while this viewer hides ink), hidden cards and
frames, and fields like `createdBy` and `contributors`. It's always the live
board, even while a version is previewed. It comes from
`Whiteboards.methods.exportBoard` (`{ boardId, index, hash? }`, in
`imports/server/whiteboardVersions.ts`), which needs only membership of the
hunt (archived hunts included) and the whiteboard to be on; history being off
doesn't matter. Like `fetchVersion` it returns the gzipped payload in chunks
of at most 4 MiB, one per call, so a big board doesn't go through one message,
with the chunk count and the payload's hash. Chunk 0 reads and compresses the
board; a board of more than one chunk is then kept on that server for the
connection, which asks for the rest with chunk 0's hash and gets them from the
same compression. It's dropped once its last chunk is sent, when the
connection starts another export, when the connection closes, five minutes
after a chunk of it was last fetched (`EXPORT_KEPT_MS`), or when the server is
keeping `MAX_KEPT_EXPORTS` (8) others fetched from more recently, so a
download abandoned part-way doesn't hold the compressed board in memory for as
long as the tab stays open. The five minutes are checked whenever anyone on
that server asks for a chunk, which drops every stale export, rather than on a
timer. If the server no longer has it (the connection dropped and came back,
or it expired), the board is read again, and a hash that differs from chunk
0's means the board changed in between: the client then says "Couldn't
download the board: it changed while it was downloading. Try again." The
method isn't unblocked, so one connection's export calls run one after
another. Each person can fetch `BIG_READS_PER_MINUTE` (60) chunks a minute, of
exports and versions together and across all their connections, refilled
evenly over the minute; past that a call is refused with a 429, "That's a lot
of downloading; try again in a minute". The client joins the chunks, unpacks
them with `DecompressionStream` and saves
`<hunt name>-whiteboard-<yyyy-mm-dd>.json`. A browser without
`DecompressionStream` says so instead. A typical board's file is a megabyte or
two; the largest a board can hold is about 50 MB.

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
it, and collapsed rounds open. Notes, drawings, lines and comments stay. The
board as it is now is saved in history, so you can undo this from there."
with a checkbox, "Also
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
  its round. A frame that was collapsed is opened, for everyone, since the
  layout it gets is the open one; people's own frames keep their fold.
- Frames and cards the layout needs that aren't on the board are added, one
  at a time, frames first. If someone puts a card on the board by hand at
  the same moment, theirs is the one placed.
- A round's frame that no puzzle needs any more stays, moved to the top
  level below everything else on the board, with whatever is in it.
- Cards and round frames someone took off the board stay off and where they
  were. The layout leaves them out, so their puzzles go where placement
  would put them today: another of their rounds, or Ungrouped. With the
  checkbox ticked (`putBack`) they're laid out with everything else and come
  back, and so do feeder arrows someone took off (not those hidden with a
  deleted puzzle). With Ungrouped taken off
  and the box not ticked, the cards it would hold go where it would have
  been, at the top level.
- Cards for deleted puzzles are left alone.

Sticky notes, text, images, shapes, ink, people's own frames, lines and their
free ends, and comments aren't touched; anything inside a round's frame keeps its place in
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

A node or line batch that adds anything waits for the same lock to count the
board's caps (see Data model), so it waits behind a reset or restore and
then sees what it left: once it has the lock it checks again that its user
may still edit, that the frames its new nodes go in and the nodes its new
lines join are still on the board, and that its new cards' puzzles still
have none, and is refused if not. If it loses the lock before its first
write it's refused the same way, and a version it recorded is taken away
again.

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
hide resolved pins, hide ink (see Ink), open a pin's thread, place a
comment, reply, react, resolve and reopen, delete their own thread while
nobody else has replied (operators can always), edit or delete their own
comments and replies from chat (see Editing and deleting from chat), use
search, the Outline and the Comments list, copy a link to the view, follow
"Show on board" from chat, open a collapsed round for themselves ("Show (only
for you)", see Collapsed rounds), and see who's here, jump to someone's
cursor and follow them (see Who's here, and following someone). Nothing
else: no tools, no moving, no folding rounds for everyone, no who-can-edit
button.

The toolbar says "Viewing only" with "Editing needs a wider screen. You can
still comment." under it, and its Outline, Comment, Comments, resolved and
Hide ink buttons are 44px square. While the Comment tool is out, a banner under the
toolbar says "Tap where your comment goes", with Cancel to put the tool
away.

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

A phone gets none of Tablets and touch (see Editing): compact wins over
`coarse`, so a phone keeps the comment-only toolbar above.

## What cards and rounds show

Everything here is display only: it reads puzzles, tags, the board's nodes
and the hunt's presence, and writes nothing.

### Cards

A card shows less as the board zooms out (`useWhiteboardDetail`):

- **Full** (zoom 0.6 and up): a lock on a locked puzzle, the Meta or Metameta
  badge with its Feeders chevron (see Feeders below), any `needs:` and
  location (`where:`, `loc:` or `location:`) tags as small chips in the
  puzzle list's tag colours (shared through
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
`group:`, `meta-for:` or `is:`, whatever the case, since lookups ignore it
(`tagSynonymRuleProblems` calls that `structural`), apart from the built-in
`stuck` rule, so the tags that organise a
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
setting. Renaming or merging a tag, from the tag manager or the job that
applies the table, runs under the hunt's `hunt:<id>:tags` lock
(`renameOrMergeTag`), reading the tag again there, so two merges at once
can't leave a puzzle on a tag the other destroyed. A `group:` tag is only
made if its `meta-for:` twin, a few characters longer, fits under
`MAX_TAG_NAME_LENGTH` too.

### Feeders

At full zoom a meta's card (Meta or Metameta badge) has a chevron beside its
badge, "Feeders", that opens a popover listing the puzzles that feed it
(`FeedersButton`). For a `meta-for:X` card they're the puzzles tagged
`group:X`, as feeder arrows pair them; for a metameta without a `meta-for:`
tag, the round metas (`is:meta` or `meta-for:`, but not other metametas)
sharing one of its `group:` tags, or every round meta in the hunt when it
has no `group:` tag; and for a bare `is:meta` card, the other puzzles in its
own rounds. Tags are read through the synonym table. The header counts them, "5
of 8 solved", leaving out puzzles with nothing to solve. Each row is the
puzzle's title and its answers on its solvedness colour, unsolved rows
greyed, a locked puzzle (in a hunt that has them) with its padlock and locked
summary, and links to the puzzle's page.

The list is in board order: frame by frame, then by slot row inside the
frame, then left to right. Frames go top to bottom in rows a card's height
apart, so frames side by side read left to right even when one sits a little
higher, and a frame inside a round is read in place among the round's own
cards. A card at the top level counts as a frame of its own, and puzzles
without a card on show go last. "By solve time" puts the most recently
answered first, then the rest in board order. It goes by the puzzle's
`answersUpdatedAt`, which the server sets whenever an answer is added or
removed (`addPuzzleAnswer`, and a guess becoming correct or stopping being
correct in `transitionGuess`, which `removePuzzleAnswer` goes through), and
when a puzzle is marked complete with no answer or that's taken back
(`updatePuzzle`), and nothing else touches. A puzzle answered, or marked
complete with no answer, before that was recorded goes by when it last
changed at all, so a retag, an unlock or a note from its sheet moves one of
those up. The choice is each viewer's own, kept in local storage
(`whiteboard:feederOrder`) and read each time a popover opens; an open
popover also follows a change made in another one, in this tab or another.
"Copy answers" copies a line per feeder in the order shown, its answers
joined by commas, or a blank line for one without an answer, ready to paste
into a sheet.

The popover is read-only, so viewers and phones get it too (a tap opens it).
Escape or a click outside closes it, and Escape closes only the popover:
the board's own Escape (closing a thread or History, leaving a preview)
waits for the next press. It reads the hunt's puzzles and tags and the
board's cards from what the page already has, only while it's open;
`feedersOf`, `feederCounts` and `feederAnswersText` in
`imports/lib/whiteboard/feeders.ts` pick, order and copy them.

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

#### Fit to contents, Tidy, and frames that grow

A selected frame that isn't collapsed has two more buttons in the toolbar
above it, beside "Collapse for everyone", for anyone who can edit:

- **Fit to contents** makes the frame just big enough for everything
  directly in it, with 24 units of padding at the sides and bottom and the
  56-unit header above, shrinking or growing it on any side, but no smaller
  than a frame can be resized to. Nothing moves on the board: when the
  frame's top or left edge moves, everything in it is moved the other way in
  the same save, as a resize from the top or left does. If the fitted frame
  would then overhang a frame it's in, that frame grows to take it, and so
  on outwards, again keeping their contents still. A frame with nothing in
  it is left alone. A collapsed frame inside counts at its full size.
- **Tidy** lays the frame's cards out as a new board would: the round's metas
  (`meta-for:X` for a frame tagged `group:X`, from `roundMetas`) on their own
  row or rows at the top, then the other cards, each in the order their
  puzzles were created, four to a row, through `placeIntoFrame`. Notes, text,
  images, ink, line ends and frames inside it stay where they are, and the
  cards go round them; so do locked cards, which stay put. Shapes stay where
  they are too but count as background (`frameToolBox` in
  `imports/client/components/whiteboard/frameToolBox.ts` marks them): cards
  are laid out as if they weren't there and may land on top of them. The
  frame and the frames around it grow to take the cards, but nothing
  shrinks. Moved cards are marked as moved by hand, as any move does, so
  placement leaves them be until Place by tags or Reset layout.

Separately, dropping something into a frame (or moving it within one), or
nudging or aligning it there, grows the frame when the thing would overhang
its right or bottom edge, to take it with 24 units to spare, and the frames
around it the same way if they'd then be overhung. This is saved with the
move. It never shrinks a frame or grows one up or left, and a locked frame,
or one inside a locked frame that would have to grow, doesn't grow.

A locked frame has no Fit to contents button. Fit to contents is refused
with the board's "That's locked" notice, changing nothing, when a locked
frame around it would have to grow, or when its top or left edge would move
and something locked is inside, since that would have to move the other
way, and likewise for something locked in a frame around it that has to
grow up or left. Tidy works on a locked frame, since its lock doesn't cover
what's in it, but is refused the same way when that frame, or a locked
frame around it, would have to grow; otherwise it just goes round locked
cards. Something another person is dragging is theirs to save: Fit to
contents and Tidy count it where it was last saved, Tidy goes round it, and
neither moves it. Each is one step for Undo, and a drop that grows frames
is one step with the move. A frame grows to a size worked out from what
this client has, so if someone else has just made it bigger and that
hasn't arrived yet, a drop that grows it saves the smaller size over
theirs, as two resizes at once would.
Everything is worked out on the client by `fitFrame`, `tidyFrame` and
`growFrameFor` in `imports/lib/whiteboard/frameTools.ts` and saved through
`upsertNodes` like a resize; the server needs nothing new, and records a
version for it as for any edit.

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
other changes do, as does any size change from elsewhere (someone else's
resize, Fit to contents, a frame growing, or undoing one of those), along with
the frame's contents: a size that changes on every animation frame has React
Flow's ResizeObserver report a loop. Moves from elsewhere still glide.

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
- `disable.whiteboard_live` turns off cursors, live drags and strokes,
  others' selections and "is editing" (so nothing is held back from
  editing), and the who's here stack with following: the presence
  publication returns nothing and `setLive` does nothing.
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
  ink segments, images, shapes and the free ends of lines (`type` is
  `puzzle`, `frame`, `sticky`, `text`, `ink`, `image`, `shape` or `point`).
  An image node has `image` (`url`, and `width` and `height` in pixels),
  which never changes. A shape node has `shape` (`rect` or `ellipse`), which
  never changes either, and its `color` is its fill. An ink segment's
  `strokeWidth` is `thin`, `medium`, `thick` or `marker` (the
  highlighter). A node inside a frame has `parent` set and a position
  relative to it. `hidden` marks a card or seeded frame
  someone removed, so placement doesn't put it back, and `hiddenWithPuzzle`
  one hidden because its puzzle was deleted; `manual` marks a node
  someone has moved, so placement leaves it alone until Place by tags or a
  reset clears it. `collapsed` marks a frame folded for everyone (see
  Collapsed rounds). `locked` and `lockedBy` mark a node locked and who
  locked it (see Locks). `contributors` records who wrote or restyled it.
- `WhiteboardEdges` (`jr_whiteboard_edges`): lines between nodes. Feeder arrows
  are `auto`, with `feeder` and `meta` puzzle ids, and follow the puzzles'
  tags; `hiddenWithPuzzle` marks one hidden because a puzzle at either end
  was deleted.
- `WhiteboardPresence` (`jr_whiteboard_presence`, server only): one document
  per connection per board, with the cursor, drag, stroke, `selection`,
  `editing`, `editingAt`, `view` and `followedUser` (all optional, null once
  cleared). It goes when the connection closes, the presence subscription
  stops or its server dies.
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

The server enforces the limits in `imports/lib/whiteboard/limits.ts`, and
the client keeps to the ones it can. The per-board caps on nodes, images,
lines and ink points are hard. `upsertNodes` and `upsertEdges` check a whole
batch before writing any of it: no new node or line twice in one batch
(several changes to one already there are fine), every field,
locks, and for nodes each parent (a frame on this board, no loops, no deeper
than `MAX_FRAME_DEPTH`), each new card's puzzle (one of this hunt's, with no
card on the board and only one new card in the batch) and each new stroke's
points, taking the batch's own new nodes and parent changes into account in
the order they're written (new nodes first, then changes). A batch that adds
anything then counts the board and writes its new nodes or lines under the
board's `whiteboard:<boardId>` lock, which placement, resets and restores
hold too, so two batches at once can't together pass a cap: the second
counts what the first wrote and is refused. Under the lock it first checks
again what it may have waited behind a reset, restore or placement to see
(see Reset layout and Place by tags). Changes to nodes and lines already
there are written after the lock is let go. A batch that waits behind a
long reset or restore and then loses the lock is refused with "The board
was busy; try again", with nothing written.

| Limit | Value | What it caps |
|---|---|---|
| `MAX_BATCH` | 100 | nodes or lines in one write, or one restore of an item |
| `MAX_NODES_PER_BOARD` | 5,000 | nodes on a board, images and shapes included |
| `MAX_IMAGES_PER_BOARD` | 100 | images on a board |
| `MAX_EDGES_PER_BOARD` | 3,000 | lines on a board, feeder arrows included |
| `MAX_TEXT_LENGTH` | 2,000 | a note's or text box's text |
| `MAX_LABEL_LENGTH` | 200 | a frame's or line's label |
| `MAX_INK_POINTS` | 500 | points in one ink segment as sent |
| `MAX_INK_POINTS_PER_BOARD` | 200,000 | ink points on a board, once simplified (see Ink) |
| `MAX_COORDINATE` | 1,000,000 | how far from the origin anything can be |
| `MAX_DIMENSION` | 100,000 | a node's width or height |
| `MAX_CONTRIBUTORS` | 50 | the names kept in a node's or line's contributors |
| `MAX_LIVE_DRAG_NODES` | 50 | nodes in one live drag |
| `MAX_LIVE_SELECTION` | 50 | nodes in a live selection |
| `LIVE_UPDATES_PER_SECOND`, `LIVE_UPDATE_BURST` | 20, 40 | live updates per connection (see The live channel) |
| `LIVE_USER_UPDATES_PER_SECOND`, `LIVE_USER_UPDATE_BURST` | 60, 120 | live updates per person, across their connections |
| `MAX_FEEDERS_PER_META` | 200 | feeders a meta gets arrows from (see Hunt Whiteboard) |
| `MAX_FRAME_DEPTH` | 64 | frames inside frames |
| `MAX_WHITEBOARD_EDITORS` | 500 | people the edit policy can name |

History's intervals and caps are in the same file (see Retention and
storage), as are `BIG_READS_PER_MINUTE` (60 chunks of versions and exports a
minute per person) and `MAX_KEPT_EXPORTS` (8 part-fetched exports per
server; see Export).

A hunt-sized board is tested by `tests/acceptance/whiteboardScale.tsx`: a
test-only method (`test.methods.whiteboard.seedHuntSizedBoard`, refused
outside `meteor test`) seeds a hunt of 200 puzzles in 20 rounds, each round
with a meta, creates its board, and adds 300 ink strokes of 100 points over
the first rounds' frames, 50 sticky notes and 50 lines. The test opens the
board on the first round, and times how long the first card takes to show,
how long until all the ink has arrived and the strokes in view are drawn,
and how long a dragged card takes to be saved once it's let go, with the
ink there. It logs all three, and fails over 8, 8 and 2 seconds
respectively, ceilings well above what it takes so only a real slowdown
fails it.

Purging a hunt removes all six collections (presence last), and merging users
carries `createdBy`, `contributors`, `lockedBy`, the `editors` list and
versions' `users` over to the merged account and drops the source account's
presence, and clears `followedUser` wherever someone was following it. User
ids inside a version's payload aren't rewritten; a restore maps them instead.
