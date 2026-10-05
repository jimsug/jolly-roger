import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import type React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import CloseButton from "react-bootstrap/CloseButton";
import Overlay from "react-bootstrap/Overlay";
import Popover from "react-bootstrap/Popover";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import type {
  FollowState,
  FollowStopReason,
} from "../../../lib/whiteboard/follow";
import {
  followersOf,
  followIdleAt,
  followLocalMove,
  followPresence,
  resumeFollowing,
  startFollowing,
  viewAtCentre,
  viewportFor,
} from "../../../lib/whiteboard/follow";
import type { BoardView } from "../../../lib/whiteboard/links";
import useAvatarUsers from "../../hooks/useAvatarUsers";
import WhiteboardPresence from "../../WhiteboardPresence";
import { userColors } from "../Avatar";
import type { AvatarStackUser } from "../AvatarStack";
import AvatarStack from "../AvatarStack";

// How many faces the stack shows before "+N".
const MAX_FACES = 5;
// Each face's avatar, inside a 2px border: 28px across, and 44px
// (finger-sized) on a phone.
const FACE_SIZE = 24;
const COMPACT_FACE_SIZE = 40;
// How long a followed person's move takes to play out here.
const FOLLOW_EASE_MS = 120;
// How long the note saying why following stopped stays up.
const STOPPED_NOTE_MS = 8000;
// React escapes text and attributes, so i18next's escaping would only show
// entities. Goes once both i18n inits stop escaping.
const interpolation = { escapeValue: false };

// The pans and zooms the board makes, as React Flow reports them: event is
// the input behind one, or null when code moved the board.
export interface ViewportMoves {
  start: (event: MouseEvent | TouchEvent | null) => void;
  move: (event: MouseEvent | TouchEvent | null) => void;
}

// The stack, with the follow banner and the chip of who's following this
// viewer beside it, so they don't change its height (which the top-right
// panels sit below).
const Corner = styled.div<{ $compact: boolean }>`
  position: absolute;
  z-index: 4;
  right: 15px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 30px);
  pointer-events: none;

  > * {
    pointer-events: auto;
  }

  ${({ $compact }) =>
    $compact
      ? css`
          bottom: 28px;
        `
      : css`
          top: 15px;
        `}
`;

const People = styled.fieldset`
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
`;

const Chip = styled.output`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
`;

// No taller than the faces on a wider screen, and with finger-sized buttons
// on a phone.
const Banner = styled.output<{ $compact: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  padding: 2px 4px 2px 10px;
  border-radius: 8px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.background};
  border: 2px solid ${({ theme }) => theme.colors.primary};
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);

  ${({ $compact }) =>
    $compact
      ? css`
          .btn,
          .btn-close {
            min-height: 44px;
            min-width: 44px;
          }
        `
      : css`
          .btn {
            padding-top: 0;
            padding-bottom: 0;
          }
        `}
`;

const Actions = styled.div<{ $compact: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;

  ${({ $compact }) =>
    $compact &&
    css`
      .btn {
        min-height: 44px;
      }
    `}
`;

const Hint = styled.small`
  display: block;
  margin-top: -2px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const MoreList = styled.ul`
  list-style: none;
  margin: 0 0 6px;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
`;

// Tells everyone else on the board what this viewer is looking at: the board
// point at the centre of the canvas and the zoom, or nothing while `enabled`
// is off. Its own component, so the rest of the canvas doesn't re-render as
// the board moves.
export const ViewSender = ({
  enabled,
  setView,
}: {
  enabled: boolean;
  setView: (view: BoardView | null) => void;
}) => {
  const transform = useStore((s) => s.transform);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  useEffect(() => {
    if (!enabled) {
      setView(null);
      return;
    }
    if (!width || !height) return;
    const [x, y, zoom] = transform;
    setView(viewAtCentre({ x, y, zoom }, width, height));
  }, [enabled, transform, width, height, setView]);
  return null;
};

interface Picked {
  user?: string;
  more?: boolean;
  target: HTMLElement;
}

// What can be done about one person on the board: jump to their pointer, if
// it has been seen, and follow them or stop.
const PersonActions = ({
  user,
  following,
  hasCursor,
  compact,
  onJump,
  onFollow,
  onStop,
}: {
  user: string;
  following: boolean;
  hasCursor: boolean;
  compact: boolean;
  onJump: (user: string) => void;
  onFollow: (user: string) => void;
  onStop: () => void;
}) => {
  const { t } = useTranslation();
  const hintId = useId();
  const jump = useCallback(() => onJump(user), [onJump, user]);
  const follow = useCallback(() => onFollow(user), [onFollow, user]);
  return (
    <Actions $compact={compact}>
      <Button
        size="sm"
        variant="outline-secondary"
        disabled={!hasCursor}
        aria-describedby={hasCursor ? undefined : hintId}
        onClick={jump}
      >
        {t("whiteboard.presence.jump", "Jump to their cursor")}
      </Button>
      {!hasCursor && (
        <Hint id={hintId}>
          {t(
            "whiteboard.presence.noCursor",
            "Their pointer hasn't been on the board since you opened it",
          )}
        </Hint>
      )}
      <Button
        size="sm"
        variant={following ? "secondary" : "primary"}
        onClick={following ? onStop : follow}
      >
        {following
          ? t("whiteboard.presence.stopFollowing", "Stop following")
          : t("whiteboard.presence.follow", "Follow")}
      </Button>
    </Actions>
  );
};

// Someone past the first few faces, picked from the "+N" list.
const MoreRow = ({
  user,
  onPick,
}: {
  user: AvatarStackUser;
  onPick: (user: string) => void;
}) => {
  const pick = useCallback(() => onPick(user._id), [onPick, user._id]);
  return (
    <li>
      <Button size="sm" variant="link" onClick={pick}>
        {user.displayName}
      </Button>
    </li>
  );
};

// Moves the board to the followed person's view whenever it changes, and
// stops following when they leave or stop moving. Its own component, so
// their pointer and view moving don't re-render the stack.
const FollowTracker = ({
  boardId,
  user,
  paused,
  followRef,
  applyView,
  stopFollowing,
}: {
  boardId: string;
  user: string;
  paused: boolean;
  followRef: React.RefObject<FollowState | undefined>;
  applyView: (view: BoardView) => void;
  stopFollowing: (reason?: FollowStopReason) => void;
}) => {
  const theirs = useTracker(
    () =>
      WhiteboardPresence.find(
        { board: boardId, user },
        { fields: { user: 1, cursor: 1, view: 1 } },
      ).fetch(),
    [boardId, user],
  );
  // Checked again when they'd count as idle, if nothing else changes first.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const state = followRef.current;
    if (!state || paused) return undefined;
    const result = followPresence(state, theirs, Date.now());
    if (result.stopped) {
      stopFollowing(result.stopped);
      return undefined;
    }
    followRef.current = result.state;
    if (result.apply) applyView(result.apply);
    if (!result.state) return undefined;
    const timer = window.setTimeout(
      () => setTick((n) => n + 1),
      Math.max(0, followIdleAt(result.state) - Date.now()) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [theirs, paused, tick, followRef, applyView, stopFollowing]);
  return null;
};

// Who else is on the board, as a stack of faces at its top right (bottom
// right on a phone), with this viewer first, once anyone else is there. A
// face offers to jump to that person's pointer or to follow them: the board
// then moves as they do, until the viewer moves it themselves, presses Stop,
// or the person leaves or stops moving for a minute. Anyone following this
// viewer shows as a chip beside the stack.
const WhosHere = ({
  boardId,
  sending,
  paused,
  compact,
  setFollowedUser,
  movesRef,
  onHeight,
}: {
  boardId: string;
  // Whether this viewer tells others where they are (see useWhiteboardLive).
  sending: boolean;
  // An earlier version is being looked at: following is paused, and who's
  // followed isn't sent.
  paused: boolean;
  compact: boolean;
  setFollowedUser: (user: string | null) => void;
  movesRef: React.RefObject<ViewportMoves | undefined>;
  // Told how far below the board's top the top-right panels should start to
  // clear the stack, or 0 when they needn't move.
  onHeight: (height: number) => void;
}) => {
  const { t } = useTranslation();
  const idPrefix = useId();
  const flow = useReactFlow();
  const storeApi = useStoreApi();
  const cornerRef = useRef<HTMLDivElement>(null);
  const selfId = useTracker(() => Meteor.userId(), []);

  // Who's here and who they follow. Pointers and views aren't read here, so
  // they don't re-render the stack.
  const presence = useTracker(
    () =>
      WhiteboardPresence.find(
        { board: boardId },
        { fields: { user: 1, followedUser: 1 } },
      ).fetch(),
    [boardId],
  );
  const others = [
    ...new Set(presence.map((p) => p.user).filter((u) => u !== selfId)),
  ];
  const ids = selfId ? [selfId, ...others] : others;
  const idsKey = ids.join(",");
  const stableIds = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);
  const avatarUsers = useAvatarUsers(stableIds);
  const users = avatarUsers.map((u) =>
    u._id === selfId
      ? {
          ...u,
          displayName: t("whiteboard.presence.you", "{{name}} (you)", {
            name: u.displayName,
            interpolation,
          }),
        }
      : u,
  );
  const nameOf = useCallback(
    (id: string) => avatarUsers.find((u) => u._id === id)?.displayName ?? "",
    [avatarUsers],
  );
  const [firstFollower, ...otherFollowers] = selfId
    ? followersOf(selfId, presence)
    : [];

  // The last place each person's pointer was seen, kept without
  // re-rendering on every move. withCursor changes only when someone's
  // pointer is seen for the first time.
  const lastCursors = useRef(new Map<string, { x: number; y: number }>());
  const [withCursor, setWithCursor] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    lastCursors.current = new Map();
    setWithCursor(new Set());
    const note = (doc: {
      user: string;
      cursor?: { x: number; y: number } | null;
    }) => {
      if (!doc.cursor) return;
      const known = lastCursors.current.has(doc.user);
      lastCursors.current.set(doc.user, doc.cursor);
      if (!known) setWithCursor((seen) => new Set(seen).add(doc.user));
    };
    const handle = WhiteboardPresence.find(
      { board: boardId },
      { fields: { user: 1, cursor: 1 } },
    ).observe({ added: note, changed: note });
    return () => handle.stop();
  }, [boardId]);

  // Who this viewer follows, and why they last stopped. Names are kept
  // from when following started, since someone who has left the board is no
  // longer in the stack to name.
  const follow = useRef<FollowState | undefined>(undefined);
  const [followed, setFollowed] = useState<{ user: string; name: string }>();
  // The same, for callbacks that shouldn't change when it does. Written
  // wherever followed is set.
  const followedRef = useRef(followed);
  const [stopped, setStopped] = useState<{
    id: number;
    name: string;
    reason: FollowStopReason;
  }>();
  // How many moves to a followed view have been asked for and not yet
  // started, so the moves they start aren't taken for the viewer's own. A
  // move that never starts (one replaced before it began) is forgotten
  // after a second.
  const ownMoves = useRef(0);
  const ownMovesReset = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(ownMovesReset.current), []);

  const stopFollowing = useCallback((reason?: FollowStopReason) => {
    const name = followedRef.current?.name;
    follow.current = undefined;
    followedRef.current = undefined;
    setFollowed(undefined);
    if (name !== undefined && reason) {
      setStopped({ id: Date.now(), name, reason });
    }
  }, []);

  useEffect(() => {
    if (!stopped) return undefined;
    const timer = window.setTimeout(
      () =>
        setStopped((current) =>
          current?.id === stopped.id ? undefined : current,
        ),
      STOPPED_NOTE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [stopped]);

  const applyView = useCallback(
    (view: BoardView) => {
      const { width, height, transform } = storeApi.getState();
      if (!width || !height) return;
      const next = viewportFor(view, width, height);
      if (
        Math.abs(next.x - transform[0]) < 0.5 &&
        Math.abs(next.y - transform[1]) < 0.5 &&
        Math.abs(next.zoom - transform[2]) < 1e-4
      ) {
        return;
      }
      ownMoves.current += 1;
      window.clearTimeout(ownMovesReset.current);
      ownMovesReset.current = window.setTimeout(() => {
        ownMoves.current = 0;
      }, 1000);
      // A hidden tab doesn't animate, so its moves would all start at once
      // when it's shown again, long after they were asked for. It moves
      // straight there instead.
      void flow.setViewport(next, {
        duration: document.visibilityState === "hidden" ? 0 : FOLLOW_EASE_MS,
      });
    },
    [flow, storeApi],
  );

  const followedUser = followed?.user;

  // A pause (an earlier version being looked at) moves the board away from
  // their view, so it's applied again once the pause is over.
  useEffect(() => {
    if (paused && follow.current) {
      follow.current = resumeFollowing(follow.current);
    }
  }, [paused]);

  // Who this viewer follows goes to everyone, except while paused.
  useEffect(() => {
    setFollowedUser(sending && !paused ? (followedUser ?? null) : null);
  }, [sending, paused, followedUser, setFollowedUser]);

  // Any pan or zoom the viewer makes themselves stops following: one code
  // made that wasn't a followed view, as it starts, or one with an input
  // behind it, once the board moves (a press or tap that doesn't move the
  // board starts a move too).
  useEffect(() => {
    movesRef.current = {
      start: (event) => {
        if (event) return;
        if (ownMoves.current > 0) {
          ownMoves.current -= 1;
          return;
        }
        if (follow.current && !paused) stopFollowing(followLocalMove().stopped);
      },
      move: (event) => {
        if (event && follow.current && !paused) {
          stopFollowing(followLocalMove().stopped);
        }
      },
    };
    return () => {
      movesRef.current = undefined;
    };
  }, [movesRef, paused, stopFollowing]);

  const startFollow = useCallback(
    (user: string) => {
      const docs = WhiteboardPresence.find(
        { board: boardId, user },
        { fields: { user: 1, cursor: 1, view: 1 } },
      ).fetch();
      const result = startFollowing(user, docs, Date.now());
      const name = nameOf(user);
      setStopped(undefined);
      if (!result.state) {
        setStopped({ id: Date.now(), name, reason: result.stopped ?? "left" });
        return;
      }
      follow.current = paused ? resumeFollowing(result.state) : result.state;
      followedRef.current = { user, name };
      setFollowed({ user, name });
      if (result.apply && !paused) applyView(result.apply);
    },
    [boardId, paused, applyView, nameOf],
  );

  // The face (or "+N") whose actions are open.
  const [picked, setPicked] = useState<Picked>();
  const closePicked = useCallback(() => setPicked(undefined), []);

  const jumpTo = useCallback(
    (user: string) => {
      closePicked();
      const at = lastCursors.current.get(user);
      if (!at) return;
      void flow.setCenter(at.x, at.y, {
        zoom: flow.getZoom(),
        duration: 400,
      });
    },
    [flow, closePicked],
  );
  const followFromPicker = useCallback(
    (user: string) => {
      closePicked();
      startFollow(user);
    },
    [closePicked, startFollow],
  );
  const stopFromPicker = useCallback(() => {
    closePicked();
    stopFollowing();
  }, [closePicked, stopFollowing]);
  const stop = useCallback(() => stopFollowing(), [stopFollowing]);
  const dismissStopped = useCallback(() => setStopped(undefined), []);

  // The top-right panels sit below the stack, however tall it is. The
  // stack sits at the bottom on a phone, clear of them.
  useEffect(() => {
    const corner = cornerRef.current;
    if (!corner || compact) {
      onHeight(0);
      return undefined;
    }
    const update = () =>
      onHeight(corner.offsetHeight ? corner.offsetHeight + 6 : 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(corner);
    return () => {
      observer.disconnect();
      onHeight(0);
    };
  }, [compact, onHeight]);

  const onPick = useCallback(
    (user: string, target: HTMLElement) =>
      setPicked((current) =>
        current?.target === target ? undefined : { user, target },
      ),
    [],
  );
  const onMore = useCallback(
    (target: HTMLElement) =>
      setPicked((current) =>
        current?.target === target ? undefined : { more: true, target },
      ),
    [],
  );
  const pickFromMore = useCallback(
    (user: string) =>
      setPicked((current) => current && { user, target: current.target }),
    [],
  );
  // Someone who leaves takes their open actions with them.
  const open =
    picked?.user && !others.includes(picked.user) ? undefined : picked;

  const color = useCallback((id: string) => userColors(id)[0], []);
  const canPick = useCallback((id: string) => id !== selfId, [selfId]);
  const pickLabel = useCallback(
    (user: { displayName: string }) =>
      t("whiteboard.presence.actions", "{{name}}: jump to or follow", {
        name: user.displayName,
        interpolation,
      }),
    [t],
  );

  const reasons: Record<FollowStopReason, string> = {
    moved: t(
      "whiteboard.follow.stopped.moved",
      "Stopped following {{name}}: you moved the board.",
      { name: stopped?.name, interpolation },
    ),
    left: t(
      "whiteboard.follow.stopped.left",
      "Stopped following {{name}}: they left the board.",
      { name: stopped?.name, interpolation },
    ),
    idle: t(
      "whiteboard.follow.stopped.idle",
      "Stopped following {{name}}: they haven't moved for a minute.",
      { name: stopped?.name, interpolation },
    ),
  };

  const headerId = `${idPrefix}-presence-header`;
  const popover = open && (
    <Popover
      id={`${idPrefix}-presence`}
      className="nokey jr-presence-popover"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a Popover is a div, positioned by its Overlay; it holds buttons, so it isn't a tooltip
      role="dialog"
      aria-labelledby={headerId}
    >
      <Popover.Header as="div" id={headerId}>
        {open.user
          ? nameOf(open.user)
          : t("whiteboard.presence.more", "Also here")}
      </Popover.Header>
      <Popover.Body>
        {open.user ? (
          <PersonActions
            user={open.user}
            following={followed?.user === open.user}
            hasCursor={withCursor.has(open.user)}
            compact={compact}
            onJump={jumpTo}
            onFollow={followFromPicker}
            onStop={stopFromPicker}
          />
        ) : (
          <MoreList>
            {users.slice(MAX_FACES).map((u) => (
              <MoreRow key={u._id} user={u} onPick={pickFromMore} />
            ))}
          </MoreList>
        )}
      </Popover.Body>
    </Popover>
  );

  const followedName = followed?.name;
  return (
    <>
      {followedUser && (
        <FollowTracker
          boardId={boardId}
          user={followedUser}
          paused={paused}
          followRef={follow}
          applyView={applyView}
          stopFollowing={stopFollowing}
        />
      )}
      <Corner
        ref={cornerRef}
        $compact={compact}
        className="jr-whos-here nodrag nowheel nopan"
      >
        {followed && (
          <Banner $compact={compact} className="jr-follow-banner">
            <span>
              {paused
                ? t(
                    "whiteboard.follow.paused",
                    "Following {{name}} is paused while you look at an earlier version.",
                    { name: followedName, interpolation },
                  )
                : t("whiteboard.follow.banner", "Following {{name}}", {
                    name: followedName,
                    interpolation,
                  })}
            </span>
            <Button size="sm" variant="outline-secondary" onClick={stop}>
              {t("whiteboard.follow.stop", "Stop")}
            </Button>
          </Banner>
        )}
        {!followed && stopped && (
          <Banner $compact={compact} className="jr-follow-banner">
            <span>{reasons[stopped.reason]}</span>
            <CloseButton
              aria-label={t("whiteboard.follow.dismiss", "Dismiss")}
              onClick={dismissStopped}
            />
          </Banner>
        )}
        {firstFollower && (
          <Chip
            className="jr-followers"
            title={[firstFollower, ...otherFollowers].map(nameOf).join(", ")}
          >
            {t(
              "whiteboard.follow.followingYou",
              "{{count}} people are following you",
              {
                count: otherFollowers.length + 1,
                name: nameOf(firstFollower),
                interpolation,
              },
            )}
          </Chip>
        )}
        {others.length > 0 && (
          <People aria-label={t("whiteboard.presence.label", "Who's here")}>
            <AvatarStack
              users={users}
              size={compact ? COMPACT_FACE_SIZE : FACE_SIZE}
              max={MAX_FACES}
              color={color}
              onPick={onPick}
              canPick={canPick}
              pickLabel={pickLabel}
              onMore={onMore}
            />
          </People>
        )}
        {popover && (
          <Overlay
            show
            target={open.target}
            placement={compact ? "top" : "bottom"}
            rootClose
            onHide={closePicked}
          >
            {popover}
          </Overlay>
        )}
      </Corner>
    </>
  );
};

export default WhosHere;
