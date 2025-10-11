import { Accounts } from "meteor/accounts-base";
import { Email } from "meteor/email";
import { Meteor } from "meteor/meteor";
import Mustache from "mustache";
import type { User } from "meteor/meteor";
import Flags from "../Flags";
import Logger from "../Logger";
import type { HuntType } from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Settings from "../lib/models/Settings";
import List from "./List";
import addUsersToDiscordRole from "./addUsersToDiscordRole";
import { ensureHuntFolderPermission } from "./gdrive";
import { trace } from "console";

const DEFAULT_EXISTING_JOIN_SUBJECT =
  "[jolly-roger] Added to {{huntName}} on {{siteName}}";

function renderExistingJoinEmailSubject(
  template: string | undefined,
  hunt: HuntType,
) {
  const view = {
    siteName: Accounts.emailTemplates.siteName,
    huntName: hunt.name,
  };

  if (template) {
    return Mustache.render(template, view);
  }

  return Mustache.render(DEFAULT_EXISTING_JOIN_SUBJECT, view);
}

const DEFAULT_EXISTING_JOIN_TEMPLATE =
  "Hiya!\n" +
  "\n" +
  "You've been added to to a new hunt on Death and Mayhem's virtual headquarters " +
  "{{siteName}}{{#joinerName}} by {{joinerName}}{{/joinerName}}, so that you can join" +
  "us for the MIT Mystery Hunt.\n" +
  "\n" +
  "You've been added to this hunt: {{huntName}}\n" +
  "\n" +
  "{{#mailingListsCount}}" +
  "You've also been put onto a handful of mailing lists for communications " +
  "about these and future hunts:\n" +
  "\n" +
  "{{mailingListsCommaSeparated}}\n" +
  "\n" +
  "{{/mailingListsCount}}" +
  "Let us know if you run into any issues at dfa-web@mit.edu.\n" +
  "\n" +
  "Happy Puzzling,\n" +
  "- The Jolly Roger Web Team\n" +
  "\n" +
  "This message was sent to {{email}}";

function renderExistingJoinEmail(
  template: string | undefined,
  user: Meteor.User | null,
  hunt: HuntType,
  joinerName: string | undefined,
) {
  const email = user?.emails?.[0]?.address;
  const view = {
    siteName: Accounts.emailTemplates.siteName,
    joinerName,
    huntName: hunt.name,
    mailingListsCount: hunt.mailingLists.length,
    mailingListsCommaSeparated: hunt.mailingLists.join(", "),
    email,
  };

  if (template) {
    return Mustache.render(template, view);
  }

  return Mustache.render(DEFAULT_EXISTING_JOIN_TEMPLATE, view);
}

export default async function addUserToHunt({
  hunt,
  email,
  invitedBy,
}: {
  hunt: HuntType;
  email: string;
  invitedBy: string;
}) {
  const huntId = hunt._id;
  Logger.info("Adding user to hunt", { invitedBy, email, huntId });
  let joineeUser: User | undefined | null =
    await Accounts.findUserByEmail(email);
  Logger.info("joineeUser", { joineeUser });

  const newUser = joineeUser === undefined;
  if (!joineeUser) {
    Logger.info("Creating new user for invitation", { email });
    const joineeUserId = await Accounts.createUserAsync({ email });
    joineeUser = await MeteorUsers.findOneAsync(joineeUserId);
  }
  if (!joineeUser?._id) {
    Logger.info(email);
    Logger.info(JSON.stringify(joineeUser));
    Logger.error("We somehow still don't have a user");
    throw new Meteor.Error(500, "Something has gone terribly wrong", email);
  }

  if (joineeUser.hunts?.includes(huntId)) {
    Logger.info("Tried to add user to hunt but they were already a member", {
      joiner: invitedBy,
      joinee: joineeUser._id,
      hunt: huntId,
    });
    return;
  }

  Logger.info("Adding user to hunt", {
    joiner: invitedBy,
    joinee: joineeUser._id,
    hunt: huntId,
  });
  await MeteorUsers.updateAsync(joineeUser._id, {
    $addToSet: { hunts: { $each: [huntId] } },
  });

  const joineeEmails = (joineeUser.emails ?? []).map((e) => e.address);

  hunt.mailingLists.forEach((listName) => {
    const list = new List(listName);
    joineeEmails.forEach((joineeEmail) => {
      if (!list.add(joineeEmail)) {
        Logger.info("Unable to add user to list", {
          joineeEmail,
          list: listName,
        });
      }
    });
  });

  await addUsersToDiscordRole([joineeUser._id], huntId);

  if (newUser) {
    Accounts.sendEnrollmentEmail(joineeUser._id);
    Logger.info("Sent invitation email to new user", { invitedBy, email });
  } else {
    if (joineeUser._id !== invitedBy) {
      const joinerUser = await MeteorUsers.findOneAsync(invitedBy);
      const joinerName = joinerUser!.displayName;
      const settingsDoc = await Settings.findOneAsync({
        name: "email.branding",
      });
      const subject = renderExistingJoinEmailSubject(
        settingsDoc?.value.existingJoinMessageSubjectTemplate,
        hunt,
      );
      const text = renderExistingJoinEmail(
        settingsDoc?.value.existingJoinMessageTemplate,
        joineeUser,
        hunt,
        joinerName,
      );
      await Email.sendAsync({
        from: Accounts.emailTemplates.from,
        to: email,
        subject,
        text,
      });
    }

    if (
      !(await Flags.activeAsync("disable.google")) &&
      !(await Flags.activeAsync("disable.gdrive_permissions")) &&
      joineeUser.googleAccount
    ) {
      await ensureHuntFolderPermission(
        hunt._id,
        joineeUser._id,
        joineeUser.googleAccount,
      );
    }
  }
}
