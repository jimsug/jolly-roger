export {};

declare module "meteor/meteor" {
  namespace Meteor {
    // Tells the invalidation crossbar that a collection (or one document in
    // it) changed, so observers that poll rather than tail the oplog re-run.
    // Meteor's own collection writes call this after every write, and
    // Model.insertManyAsync uses it to mirror MongoConnection's insertAsync
    // in mongo@2.3.0 (Meteor 3.4.1). It isn't documented, so re-check this on
    // Meteor upgrades.
    function refresh(notification: {
      collection: string;
      id?: string;
    }): Promise<void>;
  }
}
