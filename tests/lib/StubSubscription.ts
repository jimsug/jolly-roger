import type { Meteor, Subscription } from "meteor/meteor";
import { Random } from "meteor/random";

// A fake publication context for driving a Meteor.publish handler directly
// in server tests. Records what the handler publishes with added/changed/
// removed, and runs the handler's stop hooks on stop().
export default class StubSubscription implements Subscription {
  stopHooks: (() => void)[] = [];

  data: Map<
    string /* collection */,
    Map<string /* id */, Record<string, any> /* fields */>
  > = new Map();

  userId: string | null;

  readonly connection: Meteor.Connection;

  constructor(userId: string | null = null) {
    this.userId = userId;
    this.connection = { id: Random.id() } as Meteor.Connection;
  }

  onStop(func: () => void): void {
    this.stopHooks.push(func);
  }

  added(collection: string, id: string, fields: Record<string, any>): void {
    let collectionMap = this.data.get(collection);
    if (!collectionMap) {
      collectionMap = new Map();
      this.data.set(collection, collectionMap);
    }
    collectionMap.set(id, fields);
  }

  changed(collection: string, id: string, fields: Record<string, any>): void {
    const doc = this.data.get(collection)?.get(id);
    if (!doc) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }
    this.data.get(collection)!.set(id, { ...doc, ...fields });
  }

  removed(collection: string, id: string): void {
    if (!this.data.get(collection)?.delete(id)) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }
  }

  ready() {
    /* noop */
  }

  stop() {
    this.stopHooks.forEach((hook) => hook());
    this.stopHooks = [];
  }

  error(_error: Error) {
    /* noop */
  }

  unblock() {
    /* noop */
  }

  // What the handler published to a collection, by id
  published(collection: string): Map<string, Record<string, any>> {
    return this.data.get(collection) ?? new Map();
  }
}

// Looks up a registered Meteor.publish handler so a test can call it with a
// StubSubscription as `this`.
export function publishHandler(
  name: string,
): (this: Subscription, ...args: any[]) => Promise<any> {
  const { Meteor: MeteorServer } = require("meteor/meteor") as {
    Meteor: { server: { publish_handlers: Record<string, any> } };
  };
  const handler = MeteorServer.server.publish_handlers[name];
  if (!handler) {
    throw new Error(`No publication named ${name}`);
  }
  return handler;
}
