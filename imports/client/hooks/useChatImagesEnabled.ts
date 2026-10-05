import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import EnabledChatImage from "../EnabledChatImage";

// Whether the server has somewhere to store chat images.
export default function useChatImagesEnabled(): boolean {
  useSubscribe("enabledChatImage");
  return useTracker(
    () => EnabledChatImage.findOne("enabledChatImage")?.enabled ?? false,
    [],
  );
}
