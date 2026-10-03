import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";

// Whether the signed-in user is hunting remotely, so that puzzles needing
// someone on site can sink for them
export default function useIsOffsite() {
  return useTracker(() => Meteor.user()?.isOffsite ?? false, []);
}
