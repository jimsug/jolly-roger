import type { Subscription } from "meteor/meteor";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";

// Stands in for a publication's `this` when a server test calls its handler
// directly: it records what the handler publishes and runs its stop hooks.
export default class StubSubscription implements Subscription {
  stopHooks: (() => unknown)[] = [];

  onStop(func: () => unknown): void {
    this.stopHooks.push(func);
  }

  data: Map<
    string /* collection */,
    Map<string /* id */, Record<string, any> /* fields */>
  > = new Map();

  added(collection: string, id: string, fields: Record<string, any>): void {
    let collectionMap = this.data.get(collection);
    if (!collectionMap) {
      collectionMap = new Map();
      this.data.set(collection, collectionMap);
    }
    collectionMap.set(id, fields);
  }

  changed(collection: string, id: string, fields: Record<string, any>): void {
    const collectionMap = this.data.get(collection);
    if (!collectionMap) {
      throw new Error(`Collection ${collection} not found`);
    }
    const doc = collectionMap.get(id);
    if (!doc) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }
    collectionMap.set(id, { ...doc, ...fields });
  }

  removed(collection: string, id: string): void {
    const collectionMap = this.data.get(collection);
    if (!collectionMap) {
      throw new Error(`Collection ${collection} not found`);
    }
    if (!collectionMap.delete(id)) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }
  }

  ready() {
    /* noop */
  }

  // Runs each stop hook once, without waiting for any it starts
  stop() {
    const hooks = this.stopHooks;
    this.stopHooks = [];
    hooks.forEach((hook) => {
      hook();
    });
  }

  // Runs each stop hook once, waiting for each in turn as Meteor does, so a
  // test can check what they wrote
  async stopAsync() {
    const hooks = this.stopHooks;
    this.stopHooks = [];
    for (const hook of hooks) {
      await hook();
    }
  }

  error(_error: Error) {
    /* noop */
  }

  unblock() {
    /* noop */
  }

  userId: string | null;

  readonly connection: Meteor.Connection;

  // A new connection unless it's given one, as a re-subscription from the same
  // tab would be. Handlers only read the connection's id.
  constructor(userId: string | null = null, connection?: Meteor.Connection) {
    this.userId = userId;
    this.connection = connection ?? ({ id: Random.id() } as Meteor.Connection);
  }

  // What the handler published to a collection, by id
  published(collection: string): Map<string, Record<string, any>> {
    return this.data.get(collection) ?? new Map();
  }
}

type PublishHandler = (this: Subscription, ...args: any[]) => Promise<any>;

// Meteor.server, the DDP server holding each publication's handler, isn't in
// Meteor's types; this is the one piece of it the tests need
type MeteorWithServer = typeof Meteor & {
  server: { publish_handlers: Record<string, PublishHandler | undefined> };
};

// Looks up a registered publication's handler so a test can call it with a
// StubSubscription as `this`.
export function publishHandler(name: string): PublishHandler {
  const handler = (Meteor as MeteorWithServer).server.publish_handlers[name];
  if (!handler) {
    throw new Error(`No publication named ${name}`);
  }
  return handler;
}
