import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import type { GdriveMimeTypesType } from "../../lib/GdriveMimeTypes";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { userMayConfigureGdrive } from "../../lib/permission_stubs";
import configureGdriveTemplates from "../../methods/configureGdriveTemplates";
import { dropCachedDocumentsOfType } from "../documentCache";
import defineMethod from "./defineMethod";

async function currentTemplate(type: GdriveMimeTypesType) {
  const setting = await Settings.findOneAsync({
    name: `gdrive.template.${type}`,
  });
  return setting?.name === `gdrive.template.${type}`
    ? setting.value.id
    : undefined;
}

// Saves a template setting (blank clears it) and says whether it changed.
async function setTemplate(
  type: GdriveMimeTypesType,
  id: string | undefined,
): Promise<boolean> {
  const previous = await currentTemplate(type);
  const next = id === "" ? undefined : id;
  if (next) {
    await Settings.upsertAsync(
      { name: `gdrive.template.${type}` },
      { $set: { value: { id: next } } },
    );
  } else {
    await Settings.removeAsync({ name: `gdrive.template.${type}` });
  }
  return next !== previous;
}

defineMethod(configureGdriveTemplates, {
  validate(arg) {
    check(arg, {
      spreadsheetTemplate: Match.Optional(String),
      documentTemplate: Match.Optional(String),
    });
    return arg;
  },

  async run({ spreadsheetTemplate, documentTemplate }) {
    check(this.userId, String);

    // Only let the same people that can credential gdrive configure templates,
    // which today is just admins
    if (!userMayConfigureGdrive(await MeteorUsers.findOneAsync(this.userId))) {
      throw new Meteor.Error(401, "Must be admin to configure gdrive");
    }

    // In an ideal world, maybe we'd verify that the document IDs we were given
    // are actually like valid documents that we can reach or something.
    const changed: GdriveMimeTypesType[] = [];
    if (await setTemplate("spreadsheet", spreadsheetTemplate)) {
      changed.push("spreadsheet");
    }
    if (await setTemplate("document", documentTemplate)) {
      changed.push("document");
    }

    // Cached documents were copied from the old template (or made blank), so
    // they go rather than end up as a new puzzle's document. The templates
    // are saved by now, so a failure here is logged rather than reported.
    for (const type of changed) {
      try {
        await dropCachedDocumentsOfType(type);
      } catch (error) {
        Logger.error(
          "Failed to drop cached documents after a template change",
          {
            type,
            error,
          },
        );
      }
    }
  },
});
