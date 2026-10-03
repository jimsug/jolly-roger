// Pseudo-collection used by subscriber tracking
import { Mongo } from "meteor/mongo";

export type SubscriberCounterType = {
  _id: string;
  value: number;
};

export type SubscriberType = {
  _id: string;
  name: string;
  user: string;
  // Whether any of the user's tabs on this subscription is visible, and when
  // the newest of them subscribed (subscribers.fetch and subscribers.fetchAll)
  visible?: boolean;
  updatedAt?: Date;
};

export const SubscriberCounters = new Mongo.Collection<SubscriberCounterType>(
  "subscribers.counts",
);
export const Subscribers = new Mongo.Collection<SubscriberType>("subscribers");
