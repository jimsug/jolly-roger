import { Meteor } from "meteor/meteor";
import type { drive_v3 as drive } from "@googleapis/drive";
import { GaxiosError } from "gaxios";
import Flags from "../Flags";
import Logger from "../Logger";
import type { GdriveMimeTypesType } from "../lib/GdriveMimeTypes";
import GdriveMimeTypes from "../lib/GdriveMimeTypes";
import type { DocumentType } from "../lib/models/Documents";
import Documents from "../lib/models/Documents";
import FolderPermissions from "../lib/models/FolderPermissions";
import Hunts from "../lib/models/Hunts";
import type { SettingType } from "../lib/models/Settings";
import Settings from "../lib/models/Settings";
import getTeamName from "./getTeamName";
import GoogleClient from "./googleClientRefresher";
import ignoringDuplicateKeyErrors from "./ignoringDuplicateKeyErrors";
import CachedDocuments from "./models/CachedDocuments";
import HuntFolders from "./models/HuntFolders";
import withLock from "./withLock";

export async function checkClientOk() {
  if (!GoogleClient.ready()) {
    throw new Meteor.Error(500, "Google Drive client is not configured.");
  }

  if (await Flags.activeAsync("disable.google")) {
    throw new Meteor.Error(500, "Google integration is disabled.");
  }
}

// checkClientOk as a boolean, for callers that skip their Drive work rather
// than fail without it
export async function isGoogleAvailable() {
  return GoogleClient.ready() && !(await Flags.activeAsync("disable.google"));
}

async function createFolder(name: string, parentId?: string) {
  await checkClientOk();
  if (!GoogleClient.drive)
    throw new Meteor.Error(500, "Google integration is disabled");

  const mimeType = "application/vnd.google-apps.folder";
  const parents = parentId ? [parentId] : undefined;

  const folder = await GoogleClient.drive.files.create({
    requestBody: {
      name,
      mimeType,
      parents,
    },
  });

  return folder.data.id!;
}

export async function createDocument(
  name: string,
  type: GdriveMimeTypesType,
  parentId?: string,
) {
  if (!Object.hasOwn(GdriveMimeTypes, type)) {
    throw new Meteor.Error(400, `Invalid document type ${type}`);
  }
  await checkClientOk();
  if (!GoogleClient.drive || !GoogleClient.sheets)
    throw new Meteor.Error(500, "Google integration is disabled");

  const template = (await Settings.findOneAsync({
    name: `gdrive.template.${type}` as any,
  })) as
    | undefined
    | (SettingType &
        (
          | { name: "gdrive.template.document" }
          | { name: "gdrive.template.spreadsheet" }
        ));
  const mimeType = GdriveMimeTypes[type];
  const parents = parentId ? [parentId] : undefined;

  const file = await (template
    ? GoogleClient.drive.files.copy({
        fileId: template.value.id,
        requestBody: { name, mimeType, parents },
      })
    : GoogleClient.drive.files.create({
        requestBody: { name, mimeType, parents },
      }));

  const fileId = file.data.id!;

  const operationPromises: Promise<any>[] = [];

  if (type === "spreadsheet") {
    // Allow external URL access from imported functions by default, so someone doesn't need to
    // hit the allow button on every new sheet. In general, we don't expect to be entering
    // sensitive information into puzzle sheets and are using these functions to load safe
    // external resources like images.
    operationPromises.push(
      GoogleClient.sheets.spreadsheets.batchUpdate({
        spreadsheetId: fileId,
        requestBody: {
          requests: [
            {
              updateSpreadsheetProperties: {
                properties: {
                  importFunctionsExternalUrlAccessAllowed: true,
                },
                fields: "importFunctionsExternalUrlAccessAllowed",
              },
            },
          ],
        },
      }),
    );
  }

  operationPromises.push(
    GoogleClient.drive.permissions.create({
      fileId,
      requestBody: { role: "writer", type: "anyone" },
    }),
  );

  const failure = (await Promise.allSettled(operationPromises)).find(
    (result) => result.status === "rejected",
  );
  if (failure) {
    // Nothing records the file yet, so leaving it behind would strand it in
    // Drive (possibly already shared with anyone who has the link).
    try {
      await GoogleClient.drive.files.delete({ fileId });
    } catch (error) {
      Logger.warn("Failed to delete half-configured document", {
        fileId,
        error,
      });
    }
    throw failure.reason;
  }

  return fileId;
}

export async function moveDocument(id: string, newParentId: string) {
  await checkClientOk();
  if (!GoogleClient.drive)
    throw new Meteor.Error(500, "Google integration is disabled");

  const parents =
    (
      await GoogleClient.drive.files.get({
        fileId: id,
        fields: "parents",
      })
    ).data.parents ?? [];

  await GoogleClient.drive.files.update({
    fileId: id,
    addParents: newParentId,
    removeParents: parents.join(","),
  });
}

export async function deleteDocument(id: string) {
  await checkClientOk();
  if (!GoogleClient.drive) {
    throw new Meteor.Error(500, "Google integration is disabled");
  }

  await GoogleClient.drive.files.delete({
    fileId: id,
  });
}

export async function huntFolderName(huntName: string) {
  return `${huntName}: ${await getTeamName()}`;
}

// Prefixed so puzzle files are easy to pick out in Drive's recents list. Used
// on creation and on rename.
export function puzzleDocumentName(puzzleTitle: string) {
  return `↔️ ${puzzleTitle}`;
}

export async function renameDocument(id: string, name: string) {
  await checkClientOk();
  if (!GoogleClient.drive) return;
  // files.update rejects with a 404 for a missing file, and
  // renameClaimedDocument relies on that to skip cached documents that are
  // gone from Drive
  await GoogleClient.drive.files.update({
    fileId: id,
    requestBody: { name },
  });
}

export async function grantPermission(
  id: string,
  email: string,
  permission: string,
) {
  await checkClientOk();
  if (!GoogleClient.drive) return;
  await GoogleClient.drive.permissions.create({
    fileId: id,
    sendNotificationEmail: false,
    requestBody: {
      type: "user",
      emailAddress: email,
      role: permission,
    },
  });
}

export async function copySheets(fromDocumentId: string, toDocumentId: string) {
  if (!GoogleClient.sheets) {
    throw new Meteor.Error(500, `Google integration is disabled`);
  }

  const fromDocument = await Documents.findOneAsync(fromDocumentId);
  const toDocument = await Documents.findOneAsync(toDocumentId);
  if (!fromDocument) {
    throw new Meteor.Error(404, `Cannot find document ${fromDocumentId}`);
  }
  if (!toDocument) {
    throw new Meteor.Error(404, `Cannot find document ${toDocumentId}`);
  }
  if (
    fromDocument.provider !== "google" ||
    toDocument.provider !== "google" ||
    fromDocument.value.type !== "spreadsheet" ||
    toDocument.value.type !== "spreadsheet"
  ) {
    throw new Meteor.Error(
      400,
      `Cannot copy sheets between non-spreadsheet docs`,
    );
  }

  const sheetInfo = await GoogleClient.sheets.spreadsheets.get({
    spreadsheetId: fromDocument.value.id,
  });
  const sheetsToCopy = sheetInfo.data.sheets;
  if (!sheetsToCopy) {
    throw new Meteor.Error(
      400,
      `Could not get sheet information from sheet ${fromDocument.value.id}`,
    );
  }

  for (const sheet of sheetsToCopy) {
    if (sheet.properties?.sheetId != null) {
      await GoogleClient.sheets.spreadsheets.sheets.copyTo({
        sheetId: sheet.properties?.sheetId,
        spreadsheetId: fromDocument.value.id,
        requestBody: {
          destinationSpreadsheetId: toDocument.value.id,
        },
      });
    }
  }
}

export async function makeReadOnly(fileId: string) {
  await checkClientOk();
  const client = GoogleClient.drive;
  if (!client) return;

  // Fetch all permissions so we can delete them
  const permissions = [] as NonNullable<
    drive.Schema$PermissionList["permissions"]
  >;
  let token: string | undefined;
  for (;;) {
    const response = await client.permissions.list({
      fileId,
      pageToken: token,
    });
    const page = response.data;
    if (page.permissions) {
      permissions.push(...page.permissions);
    }
    const nextToken = response.data.nextPageToken;
    if (!nextToken) break;
    token = nextToken;
  }

  // Leave everyone with read-only access
  await client.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  // Delete any editor permissions. Normally, this will just be the writer
  // permission for "anyone", but in the distant past we would grant individual
  // users write access to files; we want to make sure those get deleted, too.
  for (const permission of permissions) {
    if (permission.id && permission.role === "writer") {
      await client.permissions.delete({
        fileId,
        permissionId: permission.id,
      });
    }
  }
}

export async function makeReadWrite(fileId: string) {
  await checkClientOk();
  if (!GoogleClient.drive) return;

  await GoogleClient.drive.permissions.create({
    fileId,
    requestBody: { role: "writer", type: "anyone" },
  });
}

export async function ensureHuntFolder(hunt: { _id: string; name: string }) {
  let folder = await HuntFolders.findOneAsync(hunt._id);
  if (!folder) {
    await checkClientOk();

    folder = await withLock(`hunt:${hunt._id}:folder`, async () => {
      let lockedFolder = await HuntFolders.findOneAsync(hunt._id);
      if (!lockedFolder) {
        Logger.info("Creating missing folder for hunt", {
          huntId: hunt._id,
        });

        const root = (await Settings.findOneAsync({ name: "gdrive.root" })) as
          | undefined
          | (SettingType & { name: "gdrive.root" });
        const folderId = await createFolder(
          await huntFolderName(hunt.name),
          root?.value.id,
        );
        const huntFolderId = await HuntFolders.insertAsync({
          _id: hunt._id,
          folder: folderId,
        });
        lockedFolder = (await HuntFolders.findOneAsync(huntFolderId))!;
      }
      return lockedFolder;
    });
  }

  return folder.folder;
}

export async function ensureHuntFolderPermission(
  huntId: string,
  userId: string,
  googleAccount: string,
) {
  const hunt = await Hunts.findOneAllowingDeletedAsync(huntId);
  if (!hunt) return;

  const folder = await ensureHuntFolder(hunt);

  const perm = {
    folder,
    user: userId,
    googleAccount,
    permissionLevel: "commenter" as const,
  };
  if (await FolderPermissions.findOneAsync(perm)) {
    return;
  }

  Logger.info("Granting permissions to folder", perm);
  await grantPermission(folder, googleAccount, "commenter");
  await ignoringDuplicateKeyErrors(async () => {
    await FolderPermissions.insertAsync(perm);
  });
}

export async function ensureDocument(
  puzzle: {
    _id: string;
    title: string;
    hunt: string;
  },
  type: GdriveMimeTypesType = "spreadsheet",
) {
  const hunt = await Hunts.findOneAllowingDeletedAsync(puzzle.hunt);
  const folderId = hunt ? await ensureHuntFolder(hunt) : undefined;

  const google = { puzzle: puzzle._id, provider: "google" } as const;
  let doc = await Documents.findOneAsync(google);
  if (!doc) {
    await checkClientOk();

    await withLock(`puzzle:${puzzle._id}:documents`, async () => {
      doc = await Documents.findOneAsync(google);
      if (!doc) {
        const name = puzzleDocumentName(puzzle.title);

        // A cached document from the hunt's document cache saves the Drive
        // round trips (and the wait) that creating a file costs. With the
        // cache switched off, the file is created on the spot instead.
        const cacheDisabled = await Flags.activeAsync(
          "disable.gdrive_document_cache",
        );
        const cached = cacheDisabled
          ? undefined
          : await claimCachedDocument(puzzle.hunt, type);
        let value: DocumentType["value"];
        if (
          cached &&
          (await renameClaimedDocument(cached.value.id, name, puzzle._id))
        ) {
          value = {
            type: cached.value.type,
            id: cached.value.id,
            folder: cached.value.folder,
          };
        } else {
          Logger.info("Creating missing document for puzzle", {
            puzzle: puzzle._id,
          });
          const googleDocId = await createDocument(name, type, folderId);
          value = { type, id: googleDocId, folder: folderId };
        }

        const newDoc = {
          hunt: puzzle.hunt,
          puzzle: puzzle._id,
          provider: "google" as const,
          value,
        };
        const docId = await Documents.insertAsync(newDoc);
        doc = (await Documents.findOneAsync({ _id: docId, ...google }))!;
      }
    });
  }

  if (doc && folderId && doc.value.folder !== folderId) {
    await moveDocument(doc.value.id, folderId);
    await Documents.updateAsync(doc._id, {
      $set: { "value.folder": folderId },
    });
    doc = (await Documents.findOneAsync({ _id: doc._id, ...google }))!;
  }

  return doc!;
}

// Takes the oldest available cached document of the requested type out of the
// hunt's document cache. Deleting the row is atomic, so two puzzles can't
// claim the same file, and from then on the file belongs to the puzzle.
async function claimCachedDocument(huntId: string, type: GdriveMimeTypesType) {
  const claimed = await CachedDocuments.collection
    .rawCollection()
    .findOneAndDelete(
      { hunt: huntId, "value.type": type, status: "available" },
      { sort: { createdAt: 1 } },
    );
  return claimed ?? undefined;
}

// Renames a freshly claimed cached document for its puzzle. The rename
// doubles as a check that the file still exists: a cached document deleted in
// Drive behind the cache's back (despite its name) must not be attached to the
// puzzle, since nothing would repair that later. Other failures leave the file
// attached under its cached name, which the next rename puts right.
async function renameClaimedDocument(
  fileId: string,
  name: string,
  puzzleId: string,
) {
  Logger.info("Claiming cached document for puzzle", {
    puzzle: puzzleId,
    fileId,
  });
  try {
    await renameDocument(fileId, name);
    return true;
  } catch (error) {
    if (error instanceof GaxiosError && error.status === 404) {
      Logger.error("Cached document no longer exists in Drive; skipping it", {
        puzzle: puzzleId,
        fileId,
        error,
      });
      return false;
    }
    Logger.warn("Failed to rename cached document", {
      puzzle: puzzleId,
      fileId,
      error,
    });
    return true;
  }
}

// Removes the document attached to a puzzle that never made it into the
// database, so a failed creation doesn't leave a stray file in Drive.
export async function deleteUnusedDocument(puzzle: { _id: string }) {
  await withLock(`puzzle:${puzzle._id}:documents`, async () => {
    const doc = await Documents.findOneAsync({
      puzzle: puzzle._id,
      provider: "google",
    });
    if (!doc) {
      return;
    }
    await deleteDocument(doc.value.id);
    await Documents.removeAsync(doc._id);
  });
}
