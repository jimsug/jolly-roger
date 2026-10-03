import { useSubscribe } from "meteor/react-meteor-data";

export default function useSubscribeDisplayNames(huntId: string | undefined) {
  return useSubscribe(
    huntId === undefined ? undefined : "displayNames",
    huntId,
  );
}
