import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import FixtureHunt from "../../../../imports/FixtureHunt";
import ChatMessages, {
  contentFromMessage,
} from "../../../../imports/lib/models/ChatMessages";
import Documents from "../../../../imports/lib/models/Documents";
import Guesses from "../../../../imports/lib/models/Guesses";
import MeteorUsers from "../../../../imports/lib/models/MeteorUsers";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import { PUZZLE_HISTORY_SUMMARIES } from "../../../../imports/lib/puzzleHistory";
import acceptHuntInvitationCode from "../../../../imports/methods/acceptHuntInvitationCode";
import acceptUserHuntTerms from "../../../../imports/methods/acceptUserHuntTerms";
import addHuntUser from "../../../../imports/methods/addHuntUser";
import addPuzzleAnswer from "../../../../imports/methods/addPuzzleAnswer";
import addPuzzleTag from "../../../../imports/methods/addPuzzleTag";
import addUserAccountEmail from "../../../../imports/methods/addUserAccountEmail";
import bookmarkPuzzle from "../../../../imports/methods/bookmarkPuzzle";
import bulkAddHuntUsers from "../../../../imports/methods/bulkAddHuntUsers";
import clearHuntInvitationCode from "../../../../imports/methods/clearHuntInvitationCode";
import configureClearGdriveCreds from "../../../../imports/methods/configureClearGdriveCreds";
import configureCollectGoogleAccountIds from "../../../../imports/methods/configureCollectGoogleAccountIds";
import configureDefaultHuntTags from "../../../../imports/methods/configureDefaultHuntTags";
import configureDiscordBot from "../../../../imports/methods/configureDiscordBot";
import configureDiscordBotGuild from "../../../../imports/methods/configureDiscordBotGuild";
import configureDiscordOAuthClient from "../../../../imports/methods/configureDiscordOAuthClient";
import configureEmailBranding from "../../../../imports/methods/configureEmailBranding";
import configureEnsureGoogleScript from "../../../../imports/methods/configureEnsureGoogleScript";
import configureGdriveCreds from "../../../../imports/methods/configureGdriveCreds";
import configureGdriveRoot from "../../../../imports/methods/configureGdriveRoot";
import configureGdriveTemplates from "../../../../imports/methods/configureGdriveTemplates";
import configureGoogleOAuthClient from "../../../../imports/methods/configureGoogleOAuthClient";
import configureGoogleScriptUrl from "../../../../imports/methods/configureGoogleScriptUrl";
import configureListS3Buckets from "../../../../imports/methods/configureListS3Buckets";
import configureOrganizeGoogleDrive from "../../../../imports/methods/configureOrganizeGoogleDrive";
import configureS3ImageBucket from "../../../../imports/methods/configureS3ImageBucket";
import configureServerLanguage from "../../../../imports/methods/configureServerLanguage";
import configureTeamName from "../../../../imports/methods/configureTeamName";
import confirmUserMerge from "../../../../imports/methods/confirmUserMerge";
import createAPIKey from "../../../../imports/methods/createAPIKey";
import createChatImageUpload from "../../../../imports/methods/createChatImageUpload";
import createDocumentImageUpload from "../../../../imports/methods/createDocumentImageUpload";
import createFixtureHunt from "../../../../imports/methods/createFixtureHunt";
import createGuess from "../../../../imports/methods/createGuess";
import createHunt from "../../../../imports/methods/createHunt";
import createPuzzle from "../../../../imports/methods/createPuzzle";
import createWhiteboard from "../../../../imports/methods/createWhiteboard";
import deleteWhiteboardComment from "../../../../imports/methods/deleteWhiteboardComment";
import deleteWhiteboardEdges from "../../../../imports/methods/deleteWhiteboardEdges";
import deleteWhiteboardNodes from "../../../../imports/methods/deleteWhiteboardNodes";
import demoteOperator from "../../../../imports/methods/demoteOperator";
import destroyAPIKey from "../../../../imports/methods/destroyAPIKey";
import destroyHunt from "../../../../imports/methods/destroyHunt";
import destroyPuzzle from "../../../../imports/methods/destroyPuzzle";
import dismissBookmarkNotification from "../../../../imports/methods/dismissBookmarkNotification";
import dismissChatNotification from "../../../../imports/methods/dismissChatNotification";
import dismissChatNotificationsForPuzzle from "../../../../imports/methods/dismissChatNotificationsForPuzzle";
import dismissPendingAnnouncement from "../../../../imports/methods/dismissPendingAnnouncement";
import dismissPuzzleNotification from "../../../../imports/methods/dismissPuzzleNotification";
import ensurePuzzleDocument from "../../../../imports/methods/ensurePuzzleDocument";
import fetchWhiteboardVersion from "../../../../imports/methods/fetchWhiteboardVersion";
import generateHuntInvitationCode from "../../../../imports/methods/generateHuntInvitationCode";
import generateUploadToken from "../../../../imports/methods/generateUploadToken";
import insertDocumentImage from "../../../../imports/methods/insertDocumentImage";
import linkUserDiscordAccount from "../../../../imports/methods/linkUserDiscordAccount";
import linkUserGoogleAccount from "../../../../imports/methods/linkUserGoogleAccount";
import listDocumentSheets from "../../../../imports/methods/listDocumentSheets";
import makeUserEmailPrimary from "../../../../imports/methods/makeUserEmailPrimary";
import mediasoupAckConsumer from "../../../../imports/methods/mediasoupAckConsumer";
import mediasoupAckPeerRemoteMute from "../../../../imports/methods/mediasoupAckPeerRemoteMute";
import mediasoupConnectTransport from "../../../../imports/methods/mediasoupConnectTransport";
import mediasoupRemoteMutePeer from "../../../../imports/methods/mediasoupRemoteMutePeer";
import mediasoupSetPeerState from "../../../../imports/methods/mediasoupSetPeerState";
import mediasoupSetProducerPaused from "../../../../imports/methods/mediasoupSetProducerPaused";
import postAnnouncement from "../../../../imports/methods/postAnnouncement";
import promoteOperator from "../../../../imports/methods/promoteOperator";
import provisionFirstUser from "../../../../imports/methods/provisionFirstUser";
import provisionScreenshotData from "../../../../imports/methods/provisionScreenshotData";
import purgeHunt from "../../../../imports/methods/purgeHunt";
import purgeHuntDocumentCache from "../../../../imports/methods/purgeHuntDocumentCache";
import registerPuzzleInterest from "../../../../imports/methods/registerPuzzleInterest";
import removeChatReaction from "../../../../imports/methods/removeChatReaction";
import removePuzzleAnswer from "../../../../imports/methods/removePuzzleAnswer";
import removePuzzleTag from "../../../../imports/methods/removePuzzleTag";
import removeUserAccountEmail from "../../../../imports/methods/removeUserAccountEmail";
import renameTag from "../../../../imports/methods/renameTag";
import restoreWhiteboardVersion from "../../../../imports/methods/restoreWhiteboardVersion";
import sendChatMessage from "../../../../imports/methods/sendChatMessage";
import sendUserVerificationEmail from "../../../../imports/methods/sendUserVerificationEmail";
import setChatMessagePin from "../../../../imports/methods/setChatMessagePin";
import setFeatureFlag from "../../../../imports/methods/setFeatureFlag";
import setGuessState from "../../../../imports/methods/setGuessState";
import setWhiteboardCommentResolved from "../../../../imports/methods/setWhiteboardCommentResolved";
import setWhiteboardEditPolicy from "../../../../imports/methods/setWhiteboardEditPolicy";
import setWhiteboardLive from "../../../../imports/methods/setWhiteboardLive";
import suppressDingwordsForPuzzle from "../../../../imports/methods/suppressDingwordsForPuzzle";
import syncHuntDiscordRole from "../../../../imports/methods/syncHuntDiscordRole";
import type TypedMethod from "../../../../imports/methods/TypedMethod";
import undestroyHunt from "../../../../imports/methods/undestroyHunt";
import undestroyPuzzle from "../../../../imports/methods/undestroyPuzzle";
import unlinkUserDiscordAccount from "../../../../imports/methods/unlinkUserDiscordAccount";
import unlinkUserGoogleAccount from "../../../../imports/methods/unlinkUserGoogleAccount";
import unlockPuzzle from "../../../../imports/methods/unlockPuzzle";
import updateHunt from "../../../../imports/methods/updateHunt";
import updateProfile from "../../../../imports/methods/updateProfile";
import updatePuzzle from "../../../../imports/methods/updatePuzzle";
import upsertWhiteboardEdges from "../../../../imports/methods/upsertWhiteboardEdges";
import upsertWhiteboardNodes from "../../../../imports/methods/upsertWhiteboardNodes";
import userLoginOptions from "../../../../imports/methods/userLoginOptions";
import withdrawPuzzleInterest from "../../../../imports/methods/withdrawPuzzleInterest";
import makeFixtureHunt from "../../../../imports/server/makeFixtureHunt";
import { ensureWhiteboard } from "../../../../imports/server/whiteboard";
import asUser from "../../../lib/asUser";
import resetDatabase from "../../../lib/resetDatabase";
import StubSubscription, {
  publishHandler,
} from "../../../lib/StubSubscription";

const huntId = FixtureHunt._id;

// Every method the app defines, so the type checker can see what each one
// takes. A test below fails when a registered method is missing here.
const METHODS = {
  acceptHuntInvitationCode,
  acceptUserHuntTerms,
  addHuntUser,
  addPuzzleAnswer,
  addPuzzleTag,
  addUserAccountEmail,
  bookmarkPuzzle,
  bulkAddHuntUsers,
  clearHuntInvitationCode,
  configureClearGdriveCreds,
  configureCollectGoogleAccountIds,
  configureDefaultHuntTags,
  configureDiscordBot,
  configureDiscordBotGuild,
  configureDiscordOAuthClient,
  configureEmailBranding,
  configureEnsureGoogleScript,
  configureGdriveCreds,
  configureGdriveRoot,
  configureGdriveTemplates,
  configureGoogleOAuthClient,
  configureGoogleScriptUrl,
  configureListS3Buckets,
  configureOrganizeGoogleDrive,
  configureS3ImageBucket,
  configureServerLanguage,
  configureTeamName,
  confirmUserMerge,
  createAPIKey,
  createChatImageUpload,
  createDocumentImageUpload,
  createFixtureHunt,
  createGuess,
  createHunt,
  createPuzzle,
  createWhiteboard,
  deleteWhiteboardComment,
  deleteWhiteboardEdges,
  deleteWhiteboardNodes,
  demoteOperator,
  destroyAPIKey,
  destroyHunt,
  destroyPuzzle,
  dismissBookmarkNotification,
  dismissChatNotification,
  dismissChatNotificationsForPuzzle,
  dismissPendingAnnouncement,
  dismissPuzzleNotification,
  ensurePuzzleDocument,
  fetchWhiteboardVersion,
  generateHuntInvitationCode,
  generateUploadToken,
  insertDocumentImage,
  linkUserDiscordAccount,
  linkUserGoogleAccount,
  listDocumentSheets,
  makeUserEmailPrimary,
  mediasoupAckConsumer,
  mediasoupAckPeerRemoteMute,
  mediasoupConnectTransport,
  mediasoupRemoteMutePeer,
  mediasoupSetPeerState,
  mediasoupSetProducerPaused,
  postAnnouncement,
  promoteOperator,
  provisionFirstUser,
  provisionScreenshotData,
  purgeHunt,
  purgeHuntDocumentCache,
  registerPuzzleInterest,
  removeChatReaction,
  removePuzzleAnswer,
  removePuzzleTag,
  removeUserAccountEmail,
  renameTag,
  restoreWhiteboardVersion,
  sendChatMessage,
  sendUserVerificationEmail,
  setChatMessagePin,
  setFeatureFlag,
  setGuessState,
  setWhiteboardCommentResolved,
  setWhiteboardEditPolicy,
  setWhiteboardLive,
  suppressDingwordsForPuzzle,
  syncHuntDiscordRole,
  undestroyHunt,
  undestroyPuzzle,
  unlinkUserDiscordAccount,
  unlinkUserGoogleAccount,
  unlockPuzzle,
  updateHunt,
  updateProfile,
  updatePuzzle,
  upsertWhiteboardEdges,
  upsertWhiteboardNodes,
  userLoginOptions,
  withdrawPuzzleInterest,
};

type ArgsOf<M> =
  M extends TypedMethod<infer Args, any> ? Exclude<Args, void> : never;
// Argument names that point at a puzzle, directly or through a guess or a
// chat message on one
type PuzzleKey = "puzzleId" | "puzzle" | "guessId" | "messageId";
type PuzzleMethod = {
  [K in keyof typeof METHODS]: [
    Extract<keyof ArgsOf<(typeof METHODS)[K]>, PuzzleKey>,
  ] extends [never]
    ? never
    : K;
}[keyof typeof METHODS];

type BackingIds = { puzzle: string; guess: string };

// Every method that takes a puzzle either refuses the whiteboard's hidden
// puzzle (given arguments that get it as far as that check) or is allowed on
// it on purpose: the board has its own chat, pins, reactions, bookmark and
// dingword mutes, and comments are chat messages. The type checker insists
// each such method is listed here.
const PUZZLE_METHODS: Record<
  PuzzleMethod,
  ((ids: BackingIds) => Record<string, unknown>) | "allowed"
> = {
  addPuzzleAnswer: ({ puzzle }) => ({ puzzleId: puzzle, answer: "X" }),
  addPuzzleTag: ({ puzzle }) => ({ puzzleId: puzzle, tagName: "x" }),
  bookmarkPuzzle: "allowed",
  createChatImageUpload: "allowed",
  createGuess: ({ puzzle }) => ({
    puzzleId: puzzle,
    guess: "X",
    direction: 0,
    confidence: 50,
  }),
  deleteWhiteboardComment: "allowed",
  destroyPuzzle: ({ puzzle }) => ({
    puzzleId: puzzle,
    copySheetsToReplacement: false,
  }),
  dismissChatNotificationsForPuzzle: "allowed",
  ensurePuzzleDocument: ({ puzzle }) => ({ puzzleId: puzzle }),
  registerPuzzleInterest: ({ puzzle }) => ({ puzzleId: puzzle, score: 1 }),
  removeChatReaction: "allowed",
  removePuzzleAnswer: ({ puzzle }) => ({
    puzzleId: puzzle,
    guessId: Random.id(),
  }),
  removePuzzleTag: ({ puzzle }) => ({ puzzleId: puzzle, tagId: Random.id() }),
  sendChatMessage: "allowed",
  setChatMessagePin: "allowed",
  setGuessState: ({ guess }) => ({ guessId: guess, state: "correct" }),
  setWhiteboardCommentResolved: "allowed",
  suppressDingwordsForPuzzle: "allowed",
  undestroyPuzzle: ({ puzzle }) => ({ puzzleId: puzzle }),
  unlockPuzzle: ({ puzzle }) => ({ puzzleId: puzzle }),
  updatePuzzle: ({ puzzle }) => ({
    puzzleId: puzzle,
    title: "X",
    tags: [],
    expectedAnswerCount: 1,
  }),
  withdrawPuzzleInterest: ({ puzzle }) => ({ puzzleId: puzzle }),
};

describe("whiteboard guards", function () {
  this.timeout(30000);

  let operator: string;
  let member: string;
  let backingId: string;
  let guessId: string;

  before(async function () {
    await resetDatabase("whiteboard guards");
    operator = await Accounts.createUserAsync({
      email: "operator@example.com",
      password: "password",
    });
    member = await Accounts.createUserAsync({
      email: "member@example.com",
      password: "password",
    });
    await MeteorUsers.updateAsync(operator, {
      $set: { hunts: [huntId], roles: { [huntId]: ["operator"] } },
    });
    await MeteorUsers.updateAsync(member, { $set: { hunts: [huntId] } });
    await makeFixtureHunt(operator);
    const boardId = await ensureWhiteboard(operator, huntId);
    backingId = (await Whiteboards.findOneAsync(boardId))!.puzzle;
    // createGuess refuses the board, so a guess on it can only be put there
    // by hand
    guessId = await Guesses.insertAsync({
      hunt: huntId,
      puzzle: backingId,
      guess: "X",
      state: "pending",
      createdBy: operator,
    });
  });

  // What a refusal must leave as it was, checked in each test so it doesn't
  // matter which of them run or in what order
  const assertBoardUntouched = async () => {
    const backing = (await Puzzles.findOneAllowingDeletedAsync(backingId))!;
    assert.isFalse(backing.deleted);
    assert.deepEqual(backing.tags, []);
    assert.deepEqual(backing.answers, []);
    assert.equal(backing.title, "Whiteboard");
    assert.equal(await Documents.find({ puzzle: backingId }).countAsync(), 0);
  };

  Object.entries(PUZZLE_METHODS).forEach(([name, args]) => {
    if (args === "allowed") return;
    it(`${name} refuses the whiteboard and leaves it untouched`, async function () {
      const method: TypedMethod<any, any> = METHODS[name as PuzzleMethod];
      await assert.isRejected(
        asUser(operator, () =>
          Meteor.callAsync(
            method.name,
            args({ puzzle: backingId, guess: guessId }),
          ),
        ),
        /isn't a puzzle/,
      );
      await assertBoardUntouched();
    });
  });

  it("knows every method", function () {
    const registered = Object.keys(
      (
        Meteor as unknown as {
          server: { method_handlers: Record<string, unknown> };
        }
      ).server.method_handlers,
    ).filter((name) => /\.methods?\./.test(name) && !name.startsWith("test."));
    assert.sameMembers(
      registered,
      Object.values(METHODS).map((method) => method.name),
      "Add new methods to METHODS (and to PUZZLE_METHODS if they take a puzzle)",
    );
  });

  it("won't replace a puzzle with the whiteboard", async function () {
    const puzzle = (await Puzzles.findOneAsync({
      hunt: huntId,
      kind: { $ne: "whiteboard" },
    }))!;
    await assert.isRejected(
      asUser(operator, () =>
        destroyPuzzle.callPromise({
          puzzleId: puzzle._id,
          replacedBy: backingId,
          copySheetsToReplacement: false,
        }),
      ),
      /Invalid replacement/,
    );
    assert.isFalse(
      (await Puzzles.findOneAllowingDeletedAsync(puzzle._id))!.deleted,
    );
  });

  it("marks the whiteboard in puzzle history", async function () {
    await asUser(member, () =>
      sendChatMessage.callPromise({
        puzzleId: backingId,
        content: JSON.stringify(contentFromMessage("on the board")),
      }),
    );
    const puzzle = (await Puzzles.findOneAsync({
      hunt: huntId,
      kind: { $ne: "whiteboard" },
    }))!;
    await asUser(member, () =>
      sendChatMessage.callPromise({
        puzzleId: puzzle._id,
        content: JSON.stringify(contentFromMessage("on a puzzle")),
      }),
    );
    assert.equal(await ChatMessages.find({ sender: member }).countAsync(), 2);

    const sub = new StubSubscription(member);
    try {
      await publishHandler("PuzzleHistorySummary.publications.forUser").call(
        sub,
      );
      const summaries = sub.published(PUZZLE_HISTORY_SUMMARIES);
      assert.isTrue(summaries.get(backingId)?.whiteboard);
      assert.equal(summaries.get(backingId)?.name, "Whiteboard");
      assert.isUndefined(summaries.get(puzzle._id)?.whiteboard);
      assert.ok(summaries.get(puzzle._id));
    } finally {
      sub.stop();
    }
  });
});
