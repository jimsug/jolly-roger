import sinon from "sinon";
import GoogleClient from "../../imports/server/googleClientRefresher";

// Ids stay unique across installs, so a test that reinstalls the fake can't
// confuse a new file with one from before.
let fileCount = 0;

// Stands in for the Drive and Sheets API clients so server tests can exercise
// document creation without a Google account or the network. Every API call
// is a sinon stub, so a test can assert on what was requested; file creation
// hands out sequential ids.
export default function installFakeGoogleClient() {
  const nextFile = () => {
    fileCount += 1;
    return Promise.resolve({ data: { id: `fake-file-${fileCount}` } });
  };

  const drive = {
    files: {
      create: sinon.stub().callsFake(nextFile),
      copy: sinon.stub().callsFake(nextFile),
      update: sinon.stub().resolves({ data: {} }),
      delete: sinon.stub().resolves({ data: {} }),
      get: sinon.stub().resolves({ data: { parents: [] } }),
    },
    permissions: {
      create: sinon.stub().resolves({ data: {} }),
      list: sinon.stub().resolves({ data: { permissions: [] } }),
      delete: sinon.stub().resolves({ data: {} }),
    },
  };
  const sheets = {
    spreadsheets: {
      batchUpdate: sinon.stub().resolves({ data: {} }),
      get: sinon.stub().resolves({ data: { sheets: [] } }),
      sheets: {
        copyTo: sinon.stub().resolves({ data: {} }),
      },
    },
  };

  const previous = { drive: GoogleClient.drive, sheets: GoogleClient.sheets };
  GoogleClient.drive = drive as unknown as typeof GoogleClient.drive;
  GoogleClient.sheets = sheets as unknown as typeof GoogleClient.sheets;

  return {
    drive,
    sheets,
    uninstall() {
      GoogleClient.drive = previous.drive;
      GoogleClient.sheets = previous.sheets;
    },
  };
}
