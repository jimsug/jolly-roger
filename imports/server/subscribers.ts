// Used to track subscribers to the subscribers.counts record set
//
// So long as the server continues running, it can clean up after
// itself (and does so). But if the server process is killed (or dies
// of more natural causes), its server record will stick around, so we
// garbage collect subscriber records based on the updatedAt of the
// server record.

import { check, Match } from "meteor/check";
import type { Subscription } from "meteor/meteor";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import MeteorUsers from "../lib/models/MeteorUsers";
import { Id } from "../lib/typedModel/regexes";
import { registerPeriodicCleanupHook } from "./garbage-collection";
import type { SubscriberType } from "./models/Subscribers";
import Subscribers from "./models/Subscribers";
import serverId from "./serverId";

// Clean up leaked subscribers from dead servers periodically.
async function cleanupHook(deadServer: string) {
  await Subscribers.removeAsync({ server: deadServer });
}
registerPeriodicCleanupHook(cleanupHook);

// A puzzle page's topic, "puzzle:<id>" (Id's pattern without its leading ^).
// Names are whatever the subscriber sends, and the puzzle list reads puzzle
// ids back out of them, so a puzzle topic has to name one.
const PUZZLE_TOPIC = new RegExp(`^puzzle:${Id.source.slice(1)}`);

const contextMatcher = Match.Where(
  (val: unknown): val is Record<string, string | boolean> => {
    if (!Match.test(val, Object)) {
      return false;
    }

    return Object.values(val).every(
      (v) => Match.test(v, String) || Match.test(v, Boolean),
    );
  },
);

Meteor.publish("subscribers.inc", async function (name, context) {
  check(name, String);
  check(context, contextMatcher);

  if (!this.userId) {
    return [];
  }
  if (name.startsWith("puzzle:") && !PUZZLE_TOPIC.test(name)) {
    return [];
  }

  const doc = await Subscribers.insertAsync(<any>{
    server: serverId,
    connection: this.connection.id,
    user: this.userId,
    name,
    context,
  });
  this.onStop(() => Subscribers.removeAsync(doc));

  return [];
});

// Ugh I tried to build something generic and it means our
// permissioning totally breaks down. For now, we'll let anyone
// (logged in) subscribe to any counter because Hunt is tomorrow and I
// don't think counts are thaaat sensitive, especially if you can't
// even look up the puzzle ids
Meteor.publish("subscribers.counts", async function (q: Record<string, any>) {
  check(q, Object);

  if (!this.userId) {
    return [];
  }

  const query: Record<string, any> = {};
  Object.entries(q).forEach(([k, v]) => {
    if (k.startsWith("$")) {
      throw new Meteor.Error(400, "Special query terms are not allowed");
    }

    query[`context.${k}`] = v;
  });

  let initialized = false;
  // Connections per user per name. Maps, since a name can be any string
  // ("__proto__" included).
  const counters = new Map<string, Map<string, number>>();

  const cursor = Subscribers.find(query);
  const handle = await cursor.observeAsync({
    added: (doc) => {
      const { name, user } = doc;
      let users = counters.get(name);
      if (!users) {
        users = new Map();
        counters.set(name, users);

        if (initialized) {
          this.added("subscribers.counts", name, { value: 0 });
        }
      }

      users.set(user, (users.get(user) ?? 0) + 1);
      if (initialized) {
        this.changed("subscribers.counts", name, { value: users.size });
      }
    },

    removed: (doc) => {
      const { name, user } = doc;
      const users = counters.get(name);
      if (!users) {
        return;
      }

      const remaining = (users.get(user) ?? 0) - 1;
      if (remaining > 0) {
        users.set(user, remaining);
      } else {
        users.delete(user);
      }

      if (initialized) {
        this.changed("subscribers.counts", name, { value: users.size });
      }
    },
  });
  this.onStop(() => handle.stop());

  counters.forEach((users, name) => {
    this.added("subscribers.counts", name, { value: users.size });
  });
  initialized = true;
  this.ready();
  return undefined;
});

type ConnectionPresence = { visible: boolean; updatedAt: Date };

// Whether the subscriber's tab was visible. The client sends a boolean;
// "visible" is what clients from before the port sent, and that form can go
// once no pre-port client can still be connected.
function isVisible(context: SubscriberType["context"]): boolean {
  const { visible } = context;
  return visible === true || visible === "visible";
}

// Publishes one "subscribers" record per user for the matching Subscriber
// rows, folding a user's connections (tabs) together: the user is visible if
// any tab is, and updatedAt is the newest tab's.
async function publishAggregatedSubscribers(
  sub: Subscription,
  selector: Mongo.Selector<SubscriberType>,
  keyFor: (doc: SubscriberType) => string,
) {
  const groups = new Map<
    string,
    {
      name: string;
      user: string;
      connections: Map<string, ConnectionPresence>;
      published: boolean;
    }
  >();

  const publish = (key: string) => {
    const group = groups.get(key);
    if (!group) {
      return;
    }
    if (group.connections.size === 0) {
      groups.delete(key);
      if (group.published) {
        sub.removed("subscribers", key);
      }
      return;
    }

    let visible = false;
    let updatedAt = 0;
    for (const connection of group.connections.values()) {
      visible ||= connection.visible;
      updatedAt = Math.max(updatedAt, connection.updatedAt.getTime());
    }
    const payload = {
      name: group.name,
      user: group.user,
      visible,
      updatedAt: new Date(updatedAt),
    };
    if (group.published) {
      sub.changed("subscribers", key, payload);
    } else {
      sub.added("subscribers", key, payload);
      group.published = true;
    }
  };

  const record = (doc: SubscriberType) => {
    const key = keyFor(doc);
    let group = groups.get(key);
    if (!group) {
      group = {
        name: doc.name,
        user: doc.user,
        connections: new Map(),
        published: false,
      };
      groups.set(key, group);
    }
    group.connections.set(doc._id, {
      visible: isVisible(doc.context),
      updatedAt: doc.updatedAt,
    });
    publish(key);
  };

  const handle = await Subscribers.find(selector).observeAsync({
    added: record,
    changed: record,
    removed: (doc) => {
      const key = keyFor(doc);
      groups.get(key)?.connections.delete(doc._id);
      publish(key);
    },
  });
  sub.onStop(() => handle.stop());
  sub.ready();
}

// Unlike subscribers.counts, which takes a query string against the
// context, we require you to specify the name of a subscription here
// to avoid fanout.
Meteor.publish("subscribers.fetch", async function (name) {
  check(name, String);

  if (!this.userId) {
    return [];
  }

  await publishAggregatedSubscribers(
    this,
    { name },
    (doc) => `${name}:${doc.user}`,
  );
  return undefined;
});

// Every subscriber in a hunt at once, so the puzzle list doesn't need a
// subscribers.fetch per puzzle. Records are keyed the same way as
// subscribers.fetch's, so the two can be mixed on the client.
Meteor.publish("subscribers.fetchAll", async function (hunt) {
  check(hunt, String);

  if (!this.userId) {
    return [];
  }

  const user = await MeteorUsers.findOneAsync(this.userId);
  if (!user?.hunts?.includes(hunt)) {
    return [];
  }

  // Only well-formed puzzle topics, which are all the puzzle list and the
  // board read. A row's name and context are whatever its subscriber sent.
  await publishAggregatedSubscribers(
    this,
    { "context.hunt": hunt, name: PUZZLE_TOPIC },
    (doc) => `${doc.name}:${doc.user}`,
  );
  return undefined;
});
