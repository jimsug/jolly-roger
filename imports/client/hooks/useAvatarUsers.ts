import { useTracker } from "meteor/react-meteor-data";
import { useTranslation } from "react-i18next";
import MeteorUsers from "../../lib/models/MeteorUsers";

// Who each user is, for an AvatarStack. Anyone passive is drawn faded.
export default function useAvatarUsers(ids: string[], passive?: Set<string>) {
  const { t } = useTranslation();
  return useTracker(
    () =>
      ids.map((id) => {
        const user = MeteorUsers.findOne(id);
        return {
          _id: id,
          displayName:
            user?.displayName ?? t("whiteboard.avatar.unknownUser", "Unknown"),
          discordAccount: user?.discordAccount,
          isPassive: passive?.has(id),
        };
      }),
    [ids, passive, t],
  );
}
