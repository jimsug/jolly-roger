import { promisify } from "node:util";
import { Accounts } from "meteor/accounts-base";
import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import { SUPPRESS_ALL_DINGWORDS } from "../../imports/lib/dingwordLogic";
import type { ChatMessageContentType } from "../../imports/lib/models/ChatMessages";
import ChatMessages from "../../imports/lib/models/ChatMessages";
import type { ChatNotificationType } from "../../imports/lib/models/ChatNotifications";
import ChatNotifications from "../../imports/lib/models/ChatNotifications";
import Guesses from "../../imports/lib/models/Guesses";
import type { EditableHuntType } from "../../imports/lib/models/Hunts";
import MeteorUsers from "../../imports/lib/models/MeteorUsers";
import Puzzles from "../../imports/lib/models/Puzzles";
import nodeIsText from "../../imports/lib/nodeIsText";
import chatMessagesForPuzzle from "../../imports/lib/publications/chatMessagesForPuzzle";
import puzzleForPuzzlePage from "../../imports/lib/publications/puzzleForPuzzlePage";
import addHuntUser from "../../imports/methods/addHuntUser";
import createGuess from "../../imports/methods/createGuess";
import createHunt from "../../imports/methods/createHunt";
import createPuzzle from "../../imports/methods/createPuzzle";
import dismissChatNotificationsForPuzzle from "../../imports/methods/dismissChatNotificationsForPuzzle";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import setGuessState from "../../imports/methods/setGuessState";
import suppressDingwordsForPuzzle from "../../imports/methods/suppressDingwordsForPuzzle";
import TypedMethod from "../../imports/methods/TypedMethod";
import updateProfile from "../../imports/methods/updateProfile";
import resetDatabase from "../lib/resetDatabase";
import createUser from "./createTestUser";
import { subscribeAsync, USER_EMAIL, USER_PASSWORD } from "./lib";

// Test-only helpers for states the app's own methods can't reach
const forgetMentions = new TypedMethod<{ userId: string }, void>(
  "test.methods.dingwords.forgetMentions",
);
const createEnrollee = new TypedMethod<{ email: string; token: string }, void>(
  "test.methods.dingwords.createEnrollee",
);

if (Meteor.isServer) {
  const defineMethod: typeof import("../../imports/server/methods/defineMethod").default =
    require("../../imports/server/methods/defineMethod").default;

  // Leaves a user's notifications like the rows written before the
  // notification hook recorded whether a mention dinged them
  defineMethod(forgetMentions, {
    validate(arg: unknown) {
      check(arg, { userId: String });
      return arg;
    },

    async run({ userId }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      await ChatNotifications.updateAsync(
        { user: userId },
        { $unset: { mentioned: 1 } },
        { multi: true },
      );
    },
  });

  // An invited user part way through enrolment, with a known token
  defineMethod(createEnrollee, {
    validate(arg: unknown) {
      check(arg, { email: String, token: String });
      return arg;
    },

    async run({ email, token }) {
      if (!Meteor.isAppTest) {
        throw new Meteor.Error(500, "This code must not run in production");
      }

      const userId = await Accounts.createUserAsync({
        email,
        password: "password",
      });
      await MeteorUsers.updateAsync(userId, {
        $set: {
          "services.password.enroll": {
            token,
            email,
            when: new Date(),
            reason: "enroll",
          },
        },
      });
    },
  });
}

if (Meteor.isClient) {
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const huntFields: EditableHuntType = {
    name: "Dingword hunt",
    mailingLists: [],
    openSignups: false,
    hasGuessQueue: true,
    defaultRoles: [],
    allowUnlockablePuzzles: false,
    isArchived: false,
    customLinkEmbed: false,
  };

  const SENDER_EMAIL = "sender@example.com";
  const DINGED_EMAIL = "dinged@example.com";
  const MENTIONED_EMAIL = "mentioned@example.com";
  const OUTSIDER_EMAIL = "outsider@example.com";
  const MEMBER_EMAIL = "member@example.com";

  const loginAs = async (email: string) => {
    if (Meteor.userId()) {
      await promisify(Meteor.logout)();
    }
    await promisify(Meteor.loginWithPassword)(email, USER_PASSWORD);
  };

  const newUser = (email: string) =>
    createUser.callPromise({
      email,
      password: USER_PASSWORD,
      displayName: email,
    });

  const newPuzzle = (huntId: string, title: string) =>
    createPuzzle.callPromise({
      huntId,
      title,
      tags: [],
      expectedAnswerCount: 1,
      docType: "spreadsheet",
    });

  // Provisions the admin, who creates a hunt (making them its operator),
  // joins it and adds a puzzle
  const setUpHunt = async (
    testName: string,
    defaultRoles: EditableHuntType["defaultRoles"] = [],
  ) => {
    await resetDatabase(testName);
    await provisionFirstUser.callPromise({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });
    await loginAs(USER_EMAIL);
    const huntId = await createHunt.callPromise({
      ...huntFields,
      defaultRoles,
    });
    await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
    const puzzleId = await newPuzzle(huntId, "Dinged puzzle");
    return { huntId, puzzleId };
  };

  // On top of setUpHunt: a second puzzle, another hunt with a puzzle of its
  // own, the sender, the dinged member (dingwords "foo" and "bar") and the
  // mentioned member in the first hunt, and the outsider in the other
  const setUpDings = async (
    testName: string,
    defaultRoles: EditableHuntType["defaultRoles"] = [],
  ) => {
    const { huntId, puzzleId } = await setUpHunt(testName, defaultRoles);
    const otherPuzzleId = await newPuzzle(huntId, "Other puzzle");
    const otherHuntId = await createHunt.callPromise({
      ...huntFields,
      name: "Other hunt",
    });
    const otherHuntPuzzleId = await newPuzzle(otherHuntId, "Elsewhere");

    const dingedId = await newUser(DINGED_EMAIL);
    const mentionedId = await newUser(MENTIONED_EMAIL);
    await newUser(OUTSIDER_EMAIL);
    await newUser(SENDER_EMAIL);
    for (const email of [SENDER_EMAIL, DINGED_EMAIL, MENTIONED_EMAIL]) {
      await addHuntUser.callPromise({ huntId, email });
    }
    await addHuntUser.callPromise({
      huntId: otherHuntId,
      email: OUTSIDER_EMAIL,
    });

    await loginAs(DINGED_EMAIL);
    await updateProfile.callPromise({
      displayName: DINGED_EMAIL,
      dingwords: ["foo", "bar"],
    });

    return {
      huntId,
      puzzleId,
      otherPuzzleId,
      otherHuntId,
      otherHuntPuzzleId,
      dingedId,
      mentionedId,
    };
  };

  const text = (body: string): ChatMessageContentType => ({
    type: "message",
    children: [{ text: body }],
  });

  const mentionOf = (userId: string): ChatMessageContentType => ({
    type: "message",
    children: [{ text: "hey " }, { type: "mention", userId }],
  });

  const send = (puzzleId: string, content: ChatMessageContentType) =>
    sendChatMessage.callPromise({
      puzzleId,
      content: JSON.stringify(content),
    });

  // The logged-in user's chat notifications, through a fresh subscription
  const myNotifications = async () => {
    const sub = await subscribeAsync("chatNotifications");
    const notifications = await ChatNotifications.find({}).fetchAsync();
    sub.stop();
    return notifications;
  };

  // Each notification as "puzzle:dingwords", for comparing as a set
  const summaries = (notifications: ChatNotificationType[]) =>
    notifications.map((cn) => `${cn.puzzle}:${cn.dingwords?.join(",") ?? ""}`);

  const mutedOn = async (huntId: string, puzzleId: string) =>
    (await Meteor.userAsync())?.suppressedDingwords?.[huntId]?.[puzzleId];

  describe("dingwords", function () {
    this.timeout(20000);

    const subscriptions: Meteor.SubscriptionHandle[] = [];
    afterEach(function () {
      subscriptions.splice(0).forEach((sub) => sub.stop());
    });

    describe("suppressDingwordsForPuzzle", function () {
      it("mutes the word and clears the notifications it alone caused", async function () {
        const { huntId, puzzleId, otherPuzzleId, dingedId } = await setUpDings(
          "dingwords mute a word",
        );
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, text("foo"));
        await send(puzzleId, text("foo and bar"));
        await send(puzzleId, mentionOf(dingedId));
        await send(otherPuzzleId, text("foo"));

        await loginAs(DINGED_EMAIL);
        assert.lengthOf(await myNotifications(), 4);
        await suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dingword: "foo",
          dismissUntil: new Date(),
        });
        assert.deepEqual((await Meteor.userAsync())?.suppressedDingwords, {
          [huntId]: { [puzzleId]: ["foo"] },
        });
        assert.sameMembers(
          summaries(await myNotifications()),
          [`${puzzleId}:foo,bar`, `${puzzleId}:`, `${otherPuzzleId}:foo`],
          "Only the notification where every matched word is muted goes",
        );

        await suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dingword: "bar",
          dismissUntil: new Date(),
        });
        assert.sameMembers(summaries(await myNotifications()), [
          `${puzzleId}:`,
          `${otherPuzzleId}:foo`,
        ]);
        assert.sameMembers((await mutedOn(huntId, puzzleId)) ?? [], [
          "foo",
          "bar",
        ]);
      });

      it("mutes everything with no word but keeps notifications from mentions", async function () {
        const { huntId, puzzleId, otherPuzzleId, dingedId } =
          await setUpDings("dingwords mute all");
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, text("foo"));
        await send(puzzleId, text("bar"));
        await send(puzzleId, mentionOf(dingedId));
        await send(otherPuzzleId, text("foo"));

        await loginAs(DINGED_EMAIL);
        await suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dismissUntil: new Date(),
        });
        assert.deepEqual(await mutedOn(huntId, puzzleId), [
          SUPPRESS_ALL_DINGWORDS,
        ]);
        assert.sameMembers(summaries(await myNotifications()), [
          `${puzzleId}:`,
          `${otherPuzzleId}:foo`,
        ]);
      });

      it("clears a dingword notification on a message that mentioned a role the user only holds by default", async function () {
        // With "operator" as a default role, the hook still only
        // role-notifies explicit operators, so this notification exists for
        // the dingword alone and the mute must clear it
        const { huntId, puzzleId } = await setUpDings(
          "dingwords mute with a default role",
          ["operator"],
        );
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, {
          type: "message",
          children: [
            { type: "role-mention", roleId: "operator" },
            { text: " foo" },
          ],
        });

        await loginAs(DINGED_EMAIL);
        const notifications = await myNotifications();
        assert.lengthOf(notifications, 1);
        assert.deepEqual(notifications[0]?.dingwords, ["foo"]);
        assert.isFalse(notifications[0]?.mentioned);

        await suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dingword: "foo",
          dismissUntil: new Date(),
        });
        assert.isEmpty(await myNotifications());
      });

      it("keeps a notification from before the hook recorded mentions if its content mentions the user", async function () {
        const { huntId, puzzleId, dingedId } = await setUpDings(
          "dingwords mute keeps old mentions",
        );
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, mentionOf(dingedId));
        await send(puzzleId, text("foo"));
        await forgetMentions.callPromise({ userId: dingedId });

        await loginAs(DINGED_EMAIL);
        await suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dismissUntil: new Date(),
        });
        const remaining = await myNotifications();
        assert.lengthOf(remaining, 1);
        assert.notProperty(remaining[0] ?? {}, "dingwords");
      });

      it("only clears notifications from before dismissUntil", async function () {
        const { huntId, puzzleId } = await setUpDings(
          "dingwords mute up to dismissUntil",
        );
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, text("foo"));

        await loginAs(DINGED_EMAIL);
        await suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dingword: "foo",
          dismissUntil: new Date(Date.now() - 60 * 1000),
        });
        assert.lengthOf(await myNotifications(), 1);
        assert.deepEqual(await mutedOn(huntId, puzzleId), ["foo"]);
      });

      it("rejects callers who aren't logged in or aren't members", async function () {
        const { huntId, puzzleId } = await setUpDings(
          "dingwords mute permissions",
        );
        const mute = () =>
          suppressDingwordsForPuzzle.callPromise({
            hunt: huntId,
            puzzle: puzzleId,
            dingword: "foo",
            dismissUntil: new Date(),
          });

        await promisify(Meteor.logout)();
        await assert.isRejected(mute(), /Match failed/);

        await loginAs(OUTSIDER_EMAIL);
        await assert.isRejected(mute(), /not a member/);
        assert.isUndefined((await Meteor.userAsync())?.suppressedDingwords);
      });

      it("rejects ids that don't exist or don't belong together", async function () {
        const { huntId, puzzleId, otherHuntPuzzleId } = await setUpDings(
          "dingwords mute bad ids",
        );
        await loginAs(DINGED_EMAIL);
        await assert.isRejected(
          suppressDingwordsForPuzzle.callPromise({
            hunt: huntId,
            puzzle: otherHuntPuzzleId,
            dismissUntil: new Date(),
          }),
          /Unknown puzzle/,
        );
        await assert.isRejected(
          suppressDingwordsForPuzzle.callPromise({
            hunt: "not-a-hunt",
            puzzle: puzzleId,
            dismissUntil: new Date(),
          }),
          /Unknown hunt/,
        );
        await assert.isRejected(
          suppressDingwordsForPuzzle.callPromise({
            hunt: huntId,
            puzzle: puzzleId,
            dingword: "   ",
            dismissUntil: new Date(),
          }),
          /blank/,
        );
        assert.isUndefined((await Meteor.userAsync())?.suppressedDingwords);
      });
    });

    describe("dismissChatNotificationsForPuzzle", function () {
      it("clears the caller's notifications for the puzzle and nothing else", async function () {
        const { huntId, puzzleId, otherPuzzleId, dingedId, mentionedId } =
          await setUpDings("dingwords dismiss all");
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, text("foo"));
        await send(puzzleId, mentionOf(dingedId));
        await send(otherPuzzleId, text("bar"));
        await send(puzzleId, mentionOf(mentionedId));

        await loginAs(DINGED_EMAIL);
        await dismissChatNotificationsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dismissUntil: new Date(),
        });
        const remaining = await myNotifications();
        assert.lengthOf(remaining, 1);
        assert.equal(remaining[0]?.puzzle, otherPuzzleId);

        await loginAs(MENTIONED_EMAIL);
        assert.lengthOf(
          await myNotifications(),
          1,
          "Other users' notifications stay",
        );
      });

      it("rejects callers who aren't logged in or aren't members, and mismatched ids", async function () {
        const { huntId, otherHuntId, puzzleId } = await setUpDings(
          "dingwords dismiss all permissions",
        );
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, text("foo"));
        const dismiss = (hunt: string) =>
          dismissChatNotificationsForPuzzle.callPromise({
            hunt,
            puzzle: puzzleId,
            dismissUntil: new Date(),
          });

        await promisify(Meteor.logout)();
        await assert.isRejected(dismiss(huntId), /Match failed/);

        await loginAs(OUTSIDER_EMAIL);
        await assert.isRejected(dismiss(huntId), /not a member/);

        await loginAs(DINGED_EMAIL);
        await assert.isRejected(dismiss(otherHuntId), /Unknown puzzle/);
        assert.lengthOf(await myNotifications(), 1);
      });
    });

    describe("chatNotifications", function () {
      it("publishes the puzzles a ding links to", async function () {
        const { puzzleId, otherPuzzleId } = await setUpDings(
          "dingwords linked puzzles",
        );
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, {
          type: "message",
          children: [
            { text: "foo, see " },
            { type: "puzzle", puzzleId: otherPuzzleId },
          ],
        });

        await loginAs(DINGED_EMAIL);
        subscriptions.push(await subscribeAsync("chatNotifications"));
        const notifications = await ChatNotifications.find({}).fetchAsync();
        assert.lengthOf(notifications, 1);
        assert.deepEqual(notifications[0]?.mentionedPuzzles, [otherPuzzleId]);
        assert.equal(
          (await Puzzles.findOneAsync(otherPuzzleId))?.title,
          "Other puzzle",
          "The linked puzzle comes with the notification",
        );
      });
    });

    describe("profile publications", function () {
      it("don't show other members someone's dingword settings", async function () {
        const { huntId, puzzleId, dingedId } = await setUpDings(
          "dingwords settings stay private",
        );
        await loginAs(SENDER_EMAIL);
        await send(puzzleId, text("foo"));

        await loginAs(DINGED_EMAIL);
        await updateProfile.callPromise({
          displayName: DINGED_EMAIL,
          dingwords: ["foo", "bar"],
          dingwordsOpenMatch: true,
        });
        await suppressDingwordsForPuzzle.callPromise({
          hunt: huntId,
          puzzle: puzzleId,
          dingword: "foo",
          dismissUntil: new Date(),
        });
        assert.isTrue((await Meteor.userAsync())?.dingwordsOpenMatch);
        assert.deepEqual(await mutedOn(huntId, puzzleId), ["foo"]);

        await loginAs(SENDER_EMAIL);
        for (const [name, arg] of [
          ["profile", dingedId],
          ["huntProfiles", huntId],
        ] as const) {
          const sub = await subscribeAsync(name, arg);
          const seen = await MeteorUsers.findOneAsync(dingedId);
          sub.stop();
          assert.equal(
            seen?.displayName,
            DINGED_EMAIL,
            `${name} publishes the profile`,
          );
          assert.notProperty(seen ?? {}, "dingwordsOpenMatch", name);
          assert.notProperty(seen ?? {}, "suppressedDingwords", name);
        }
      });
    });

    describe("updateProfile", function () {
      it("saves the dingword matching mode for the logged-in user", async function () {
        await resetDatabase("dingwords updateProfile matching mode");
        await newUser(DINGED_EMAIL);
        await loginAs(DINGED_EMAIL);

        await updateProfile.callPromise({
          displayName: "Dinger",
          dingwords: ["logic"],
          dingwordsOpenMatch: true,
        });
        assert.isTrue((await Meteor.userAsync())?.dingwordsOpenMatch);

        await updateProfile.callPromise({
          displayName: "Dinger",
          dingwords: ["logic"],
          dingwordsOpenMatch: false,
        });
        assert.isFalse((await Meteor.userAsync())?.dingwordsOpenMatch);

        // Leaving it out leaves it alone
        await updateProfile.callPromise({
          displayName: "Dinger",
          dingwords: [],
        });
        assert.isFalse((await Meteor.userAsync())?.dingwordsOpenMatch);
      });

      it("doesn't take the dingword matching mode on the enrolment path", async function () {
        await resetDatabase("dingwords updateProfile enrolment");
        await createEnrollee.callPromise({
          email: "enrollee@example.com",
          token: "enroll-token",
        });

        await assert.isRejected(
          updateProfile.callPromise({
            displayName: "Enrollee",
            dingwords: [],
            enrollmentToken: "enroll-token",
            dingwordsOpenMatch: true,
          }),
          /enrolling/,
        );
      });
    });

    describe("setGuessState with a corrected answer", function () {
      // Sets up a hunt and subscribes the admin, its operator, to its
      // puzzle's guesses and chat
      const setUpGuesses = async (testName: string) => {
        const { huntId, puzzleId } = await setUpHunt(testName);
        subscriptions.push(
          await typedSubscribe.async(puzzleForPuzzlePage, { puzzleId, huntId }),
          await typedSubscribe.async(chatMessagesForPuzzle, {
            puzzleId,
            huntId,
          }),
        );
        return { huntId, puzzleId };
      };

      const newGuess = (puzzleId: string, guess: string) =>
        createGuess.callPromise({
          puzzleId,
          guess,
          direction: 0,
          confidence: 50,
        });

      // The newest "Guess ... was marked ..." line in the puzzle's chat
      const latestStateChange = async (puzzleId: string) => {
        const lines = (
          await ChatMessages.find(
            { puzzle: puzzleId },
            { sort: { timestamp: -1 } },
          ).fetchAsync()
        )
          .filter((message) => !message.sender)
          .map((message) => message.content.children[0])
          .map((child) => (child && nodeIsText(child) ? child.text : ""));
        return lines.find((line) => line.includes("was marked"));
      };

      it("records the corrected answer on the guess and the puzzle", async function () {
        const { puzzleId } = await setUpGuesses("guess corrected answer");
        const guessId = await newGuess(puzzleId, "ANSWER");

        await setGuessState.callPromise({
          guessId,
          state: "correct",
          correctAnswer: " answer two ",
        });

        const guess = await Guesses.findOneAsync(guessId);
        assert.equal(guess?.state, "correct");
        assert.equal(guess?.guess, "ANSWER TWO");
        assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, [
          "ANSWER TWO",
        ]);
        const line = await latestStateChange(puzzleId);
        assert.include(line, "`ANSWER TWO`");
        assert.include(line, "with changes");
        assert.include(line, "submitted as `ANSWER`");
      });

      it("treats a correction that only differs by case as the same answer", async function () {
        const { puzzleId } = await setUpGuesses("guess correction by case");
        const guessId = await newGuess(puzzleId, "ANSWER");

        await setGuessState.callPromise({
          guessId,
          state: "correct",
          correctAnswer: "answer",
        });

        assert.equal((await Guesses.findOneAsync(guessId))?.guess, "ANSWER");
        assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, [
          "ANSWER",
        ]);
        assert.notInclude(await latestStateChange(puzzleId), "with changes");
      });

      it("renders the submitted answer the same way as the guess", async function () {
        // The system message escapes the guess once; the submitted text used
        // to go through that escaping twice
        const { puzzleId } = await setUpGuesses("guess correction escaping");
        const plainId = await newGuess(puzzleId, "AT&T <B>");
        await setGuessState.callPromise({ guessId: plainId, state: "correct" });
        const rendered = /^Guess `(.*)` was marked/.exec(
          (await latestStateChange(puzzleId)) ?? "",
        )?.[1];
        assert.isString(rendered);

        const correctedId = await newGuess(puzzleId, "AT&T <B>");
        await setGuessState.callPromise({
          guessId: correctedId,
          state: "correct",
          correctAnswer: "ATT B",
        });
        assert.include(
          await latestStateChange(puzzleId),
          `(submitted as \`${rendered}\`)`,
        );
      });

      it("unwinds the corrected answer when the guess stops being correct", async function () {
        const { puzzleId } = await setUpGuesses("guess correction unwound");
        const guessId = await newGuess(puzzleId, "ANSWER");
        await setGuessState.callPromise({
          guessId,
          state: "correct",
          correctAnswer: "better",
        });
        assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, [
          "BETTER",
        ]);

        await setGuessState.callPromise({ guessId, state: "incorrect" });

        assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, []);
        assert.equal((await Guesses.findOneAsync(guessId))?.guess, "BETTER");
      });

      it("is only for operators", async function () {
        const { huntId, puzzleId } = await setUpHunt(
          "guess correction permissions",
        );
        await newUser(MEMBER_EMAIL);
        await addHuntUser.callPromise({ huntId, email: MEMBER_EMAIL });

        await loginAs(MEMBER_EMAIL);
        subscriptions.push(
          await typedSubscribe.async(puzzleForPuzzlePage, { puzzleId, huntId }),
        );
        const guessId = await newGuess(puzzleId, "ANSWER");
        await assert.isRejected(
          setGuessState.callPromise({
            guessId,
            state: "correct",
            correctAnswer: "other",
          }),
          /permitted/,
        );
        assert.equal((await Guesses.findOneAsync(guessId))?.state, "pending");
        assert.deepEqual((await Puzzles.findOneAsync(puzzleId))?.answers, []);
      });

      it("rejects a correction for any other state, and a blank one", async function () {
        const { puzzleId } = await setUpGuesses("guess correction bad input");
        const guessId = await newGuess(puzzleId, "ANSWER");

        await assert.isRejected(
          setGuessState.callPromise({
            guessId,
            state: "incorrect",
            correctAnswer: "other",
          }),
          /only goes with/,
        );
        await assert.isRejected(
          setGuessState.callPromise({
            guessId,
            state: "correct",
            correctAnswer: "   ",
          }),
          /blank/,
        );
        assert.equal((await Guesses.findOneAsync(guessId))?.state, "pending");
      });
    });
  });
}
