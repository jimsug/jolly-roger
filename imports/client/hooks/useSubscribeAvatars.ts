import { useSubscribe } from "meteor/react-meteor-data";

export default function useSubscribeAvatars(huntId: string | undefined) {
  return useSubscribe(huntId === undefined ? undefined : "avatars", huntId);
}
