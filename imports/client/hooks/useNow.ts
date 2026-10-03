import { Meteor } from "meteor/meteor";
import { useEffect, useState } from "react";

// The current time, refreshed every intervalMs, for derived state that ages
// (presence that goes idle, "last seen" labels) without any other trigger.
export default function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const handle = Meteor.setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      Meteor.clearInterval(handle);
    };
  }, [intervalMs]);
  return now;
}
