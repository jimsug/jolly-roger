import { DDP } from "meteor/ddp";
import type { Meteor } from "meteor/meteor";

// Runs fn as if userId had called it from a method, so Meteor.userId(),
// this.userId in a called method and the createdBy and updatedBy fields all see
// that user. Pass a connection for code that reads the caller's connection
// (Meteor hands the calling invocation's connection on to the method).
export default function asUser<T>(
  userId: string,
  fn: () => Promise<T>,
  connection?: Meteor.Connection,
): Promise<T> {
  const invocation = { userId, connection };
  return DDP._CurrentMethodInvocation.withValue(invocation, fn);
}
