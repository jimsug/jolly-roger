import { assert } from "chai";
import {
  CallJoinState,
  INITIAL_STATE,
  reducer,
} from "../../../../imports/client/hooks/useCallState";
import type { PeerType } from "../../../../imports/lib/models/mediasoup/Peers";

const peer = (
  id: string,
  initialPeerState: PeerType["initialPeerState"],
): PeerType => ({
  _id: id,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user",
  createdServer: "server",
  hunt: "hunt",
  call: "puzzle",
  tab: "tab",
  initialPeerState,
  muted: initialPeerState !== "active",
  deafened: initialPeerState === "deafened",
  deleted: false,
});

const audioState = { audioContext: undefined, mediaSource: undefined };
const join = (muted?: boolean) =>
  reducer(INITIAL_STATE, {
    type: "join-call",
    audioState,
    initialMuted: muted,
  });

describe("useCallState reducer", function () {
  describe("join-call", function () {
    it("joins unmuted by default", function () {
      const state = join();
      assert.equal(state.callState, CallJoinState.IN_CALL);
      assert.isFalse(state.audioControls.muted);
      assert.isFalse(state.initialMuted);
      assert.isTrue(state.allowInitialPeerStateNotification);
    });

    it("starts the call muted when asked and remembers the choice", function () {
      const state = join(true);
      assert.equal(state.callState, CallJoinState.IN_CALL);
      assert.isTrue(state.audioControls.muted);
      assert.isFalse(state.audioControls.deafened);
      assert.isTrue(state.initialMuted);
    });
  });

  describe("set-peers", function () {
    it("applies an active initial peer state to a normal join", function () {
      const state = reducer(join(), {
        type: "set-peers",
        selfPeer: peer("self", "active"),
        otherPeers: [],
      });
      assert.isFalse(state.audioControls.muted);
    });

    it("does not unmute a muted join when the server says active", function () {
      const state = reducer(join(true), {
        type: "set-peers",
        selfPeer: peer("self", "active"),
        otherPeers: [],
      });
      assert.isTrue(state.audioControls.muted);
      assert.isTrue(state.initialMuted);
    });

    it("still honours a server-imposed mute on a normal join", function () {
      const state = reducer(join(), {
        type: "set-peers",
        selfPeer: peer("self", "muted"),
        otherPeers: [],
      });
      assert.isTrue(state.audioControls.muted);
      assert.isFalse(state.initialMuted);
    });
  });

  describe("toggle-mute", function () {
    it("forgets the muted join once the user unmutes", function () {
      const joined = reducer(join(true), {
        type: "set-peers",
        selfPeer: peer("self", "active"),
        otherPeers: [],
      });
      const unmuted = reducer(joined, { type: "toggle-mute" });
      assert.isFalse(unmuted.audioControls.muted);
      assert.isFalse(unmuted.initialMuted);

      // A reconnect that hands back an active peer state must not re-mute
      const reconnected = reducer(unmuted, {
        type: "set-peers",
        selfPeer: peer("self-again", "active"),
        otherPeers: [],
      });
      assert.isFalse(reconnected.audioControls.muted);
    });

    it("can re-mute afterwards without reviving the join choice", function () {
      const unmuted = reducer(join(true), { type: "toggle-mute" });
      const remuted = reducer(unmuted, { type: "toggle-mute" });
      assert.isTrue(remuted.audioControls.muted);
      assert.isFalse(remuted.initialMuted);
    });
  });

  describe("set-muted", function () {
    it("unmutes a muted join and forgets the join choice", function () {
      const state = reducer(join(true), { type: "set-muted", muted: false });
      assert.isFalse(state.audioControls.muted);
      assert.isFalse(state.audioControls.deafened);
      assert.isFalse(state.initialMuted);
      assert.isFalse(state.allowInitialPeerStateNotification);
    });

    it("re-mutes afterwards", function () {
      const unmuted = reducer(join(true), {
        type: "set-muted",
        muted: false,
      });
      const remuted = reducer(unmuted, { type: "set-muted", muted: true });
      assert.isTrue(remuted.audioControls.muted);
      assert.isFalse(remuted.initialMuted);
    });

    it("is a no-op when already in the requested state", function () {
      const joined = join(true);
      assert.strictEqual(
        reducer(joined, { type: "set-muted", muted: true }),
        joined,
      );
      const unmuted = join();
      assert.strictEqual(
        reducer(unmuted, { type: "set-muted", muted: false }),
        unmuted,
      );
    });

    it("is a no-op outside a call, unlike toggle-mute", function () {
      // A push-to-talk keyup can land after a navigation has reset the call
      const reset = reducer(join(true), { type: "reset" });
      assert.strictEqual(
        reducer(reset, { type: "set-muted", muted: true }),
        reset,
      );
      assert.strictEqual(
        reducer(INITIAL_STATE, { type: "set-muted", muted: false }),
        INITIAL_STATE,
      );
      assert.throws(() => reducer(reset, { type: "toggle-mute" }));
    });

    it("keeps a deafen in place when muting", function () {
      const deafened = reducer(join(), { type: "toggle-deafen" });
      const muted = reducer(deafened, { type: "set-muted", muted: true });
      assert.isTrue(muted.audioControls.muted);
      assert.isTrue(muted.audioControls.deafened);
      // Undeafening afterwards must not open the mic
      const undeafened = reducer(muted, { type: "toggle-deafen" });
      assert.isTrue(undeafened.audioControls.muted);
      assert.isFalse(undeafened.audioControls.deafened);
    });

    it("undeafens when unmuting, as toggle-mute does", function () {
      const deafened = reducer(join(true), { type: "toggle-deafen" });
      const unmuted = reducer(deafened, { type: "set-muted", muted: false });
      assert.isFalse(unmuted.audioControls.muted);
      assert.isFalse(unmuted.audioControls.deafened);
    });

    it("keeps a remote mute's notice when the re-mute is redundant", function () {
      const remoteMuted = reducer(
        reducer(join(true), { type: "set-muted", muted: false }),
        { type: "set-remote-muted", remoteMutedBy: "operator" },
      );
      const released = reducer(remoteMuted, {
        type: "set-muted",
        muted: true,
      });
      assert.strictEqual(released, remoteMuted);
      assert.equal(released.remoteMutedBy, "operator");
    });
  });

  it("clears the choice on leaving the call", function () {
    const state = reducer(join(true), { type: "leave-call" });
    assert.equal(state.callState, CallJoinState.CHAT_ONLY);
    assert.isFalse(state.initialMuted);
    assert.isFalse(state.audioControls.muted);
  });
});
