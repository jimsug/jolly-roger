import PendingAnnouncementSchema, { PendingAnnouncementType } from '../schemas/pending_announcement';
import Base from './base';

const PendingAnnouncements = new Base<PendingAnnouncementType>('pending_announcements');
PendingAnnouncements.attachSchema(PendingAnnouncementSchema);
PendingAnnouncements.publish(function (q) {
  // It's sufficient to use the user property for filtering here; we
  // don't need to pay attention to the hunt ID
  return { ...q, user: this.userId };
});

export default PendingAnnouncements;
