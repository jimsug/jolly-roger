export {};

declare module "meteor/meteor" {
  namespace Meteor {
    // Tells the invalidation crossbar that a collection (or one document in
    // it) changed, so observers that poll rather than tail the oplog re-run.
    // Meteor's own collection writes call this after every write.
    function refresh(notification: {
      collection: string;
      id?: string;
    }): Promise<void>;
  }
}
