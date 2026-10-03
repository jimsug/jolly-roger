/* @ts-expect-error I don't understand why, but this fixes the weird
   MongoInternals export in @types/mongo */
import { MongoInternals } from "meteor/mongo";

declare module "meteor/mongo" {
  namespace Mongo {
    interface Collection<T> {
      _makeNewID(): T extends { _id: infer ID } ? ID : string;
      // We can get this property from tableName on our models, but we need this
      // for models that don't descend from Base, like Meteor.users
      _name: string;
    }
  }

  namespace MongoInternals {
    interface MongoConnection {
      // Starts a write on the current DDP write fence, if there is one, the
      // way every write made through a Mongo.Collection does. Call committed()
      // once the write is done and observers have been told about it.
      _maybeBeginWrite(): { committed(): Promise<void> | void };
    }
  }
}
