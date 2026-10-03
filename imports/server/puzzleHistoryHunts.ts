import isAdmin from "../lib/isAdmin";
import MeteorUsers from "../lib/models/MeteorUsers";

// The hunts a viewer may see userId's puzzle history for: a user may look at
// their own history and admins may look at anyone's, in each case limited to
// the hunts that user is a member of. Returns undefined when the viewer isn't
// allowed to look at all.
export default async function huntsForPuzzleHistory(
  viewerId: string,
  userId: string,
): Promise<string[] | undefined> {
  const viewer = await MeteorUsers.findOneAsync(viewerId);
  if (!viewer) {
    return undefined;
  }
  if (viewerId === userId) {
    return viewer.hunts ?? [];
  }
  if (!isAdmin(viewer)) {
    return undefined;
  }
  const user = await MeteorUsers.findOneAsync(userId);
  return user?.hunts ?? [];
}
