import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import sinon from "sinon";
import typedSubscribe from "../../../../imports/client/typedSubscribe";
import TypedPublication from "../../../../imports/lib/publications/TypedPublication";

describe("typedSubscribe.async", function () {
  const publication = new TypedPublication<{ id: string }>("test.publication");
  const handle: Meteor.SubscriptionHandle = {
    stop: () => undefined,
    ready: () => true,
  };
  type Callbacks = {
    onReady: () => void;
    onStop: (error?: Meteor.Error) => void;
  };
  const callbacksOf = (args: unknown[]) => args.at(-1) as Callbacks;

  afterEach(function () {
    sinon.restore();
  });

  it("gives the handle once the subscription is ready", async function () {
    let callbacks: Callbacks | undefined;
    sinon.stub(Meteor, "subscribe").callsFake((...args: unknown[]) => {
      callbacks = callbacksOf(args);
      return handle;
    });
    const subscribed = typedSubscribe.async(publication, { id: "a" });
    callbacks!.onReady();
    assert.strictEqual(await subscribed, handle);
  });

  it("gives the handle when the subscription is ready before subscribe returns", async function () {
    // As Meteor does when it reuses a ready subscription a rerunning
    // computation is letting go of
    sinon.stub(Meteor, "subscribe").callsFake((...args: unknown[]) => {
      callbacksOf(args).onReady();
      return handle;
    });
    assert.strictEqual(
      await typedSubscribe.async(publication, { id: "a" }),
      handle,
    );
  });

  it("fails when the subscription stops with an error", async function () {
    sinon.stub(Meteor, "subscribe").callsFake((...args: unknown[]) => {
      callbacksOf(args).onStop(new Meteor.Error(403, "Refused"));
      return handle;
    });
    await assert.isRejected(
      typedSubscribe.async(publication, { id: "a" }),
      /Refused/,
    );
  });
});
