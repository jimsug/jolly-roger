import { check } from 'meteor/check';
import { Google } from 'meteor/google-oauth';
import { Meteor } from 'meteor/meteor';
import Ansible from '../../Ansible';
import Flags from '../../Flags';
import MeteorUsers from '../../lib/models/MeteorUsers';
import linkUserGoogleAccount from '../../methods/linkUserGoogleAccount';
import { ensureHuntFolderPermission } from '../gdrive';

linkUserGoogleAccount.define({
  validate(arg) {
    check(arg, {
      key: String,
      secret: String,
    });
    return arg;
  },

  run({ key, secret }) {
    check(this.userId, String);

    // We don't care about actually capturing the credential - we're
    // not going to do anything with it (and with only identity
    // scopes, I don't think you can do anything with it), but we do
    // want to validate it.
    const credential = Google.retrieveCredential(key, secret);
    const email = credential.serviceData.email;
    Ansible.log('Linking user to Google account', {
      user: this.userId,
      email,
    });

    MeteorUsers.update(this.userId, { $set: { googleAccount: email } });

    if (!Flags.active('disable.google') && !Flags.active('disable.gdrive_permissions')) {
      const hunts = Meteor.user()!.hunts;
      hunts?.forEach((huntId) => {
        ensureHuntFolderPermission(huntId, this.userId!, email);
      });
    }
  },
});