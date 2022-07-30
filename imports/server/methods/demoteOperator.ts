import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import Ansible from '../../Ansible';
import MeteorUsers from '../../lib/models/MeteorUsers';
import { removeUserFromRole, userMayMakeOperatorForHunt } from '../../lib/permission_stubs';
import demoteOperator from '../../methods/demoteOperator';

demoteOperator.define({
  validate(arg) {
    check(arg, {
      targetUserId: String,
      huntId: String,
    });
    return arg;
  },

  run({ targetUserId, huntId }) {
    check(this.userId, String);

    if (!userMayMakeOperatorForHunt(this.userId, huntId)) {
      throw new Meteor.Error(401, 'Must be operator or inactive operator to demote operator');
    }

    const targetUser = MeteorUsers.findOne(targetUserId);
    if (!targetUser) {
      throw new Meteor.Error(404, 'User not found');
    }

    if (this.userId === targetUserId) {
      throw new Meteor.Error(400, 'Cannot demote yourself');
    }

    Ansible.log('Demoting user from operator', { user: targetUserId, demoter: this.userId });
    removeUserFromRole(targetUserId, huntId, 'operator');
  },
});