import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import isReaction from "../../imports/lib/isReaction";
import ChatMessages from "../../imports/lib/models/ChatMessages";
import nodeIsText from "../../imports/lib/nodeIsText";
import chatMessagesForFirehose from "../../imports/lib/publications/chatMessagesForFirehose";
import chatMessagesForPuzzle from "../../imports/lib/publications/chatMessagesForPuzzle";
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import removeChatMessage from "../../imports/methods/removeChatMessage";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import setGuessState from "../../imports/methods/setGuessState";
import resetDatabase from "../lib/resetDatabase";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  describe("chat hooks", function () {
    describe("puzzle answer is marked correct", function () {
      it("sends a message to all linked metas", async function () {
        await resetDatabase("chat hooks puzzle answer is marked correct");

        await provisionFirstUser.callPromise({
          email: USER_EMAIL,
          password: USER_PASSWORD,
        });
        await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
        await createFixtureHunt.callPromise();

        const huntId = "S5BBzdFRnKSDktDwd";
        const guessId = "5bYkNpXBC2mAdZBDC";
        const puzzleId = "hiMpJHfWjotCGb9NT";
        const metaPuzzleIds = ["NeMxJZKPGqN7CcmcN", "3zTi6pDY9mHJSbLoS"];

        const before = new Date();
        await setGuessState.callPromise({ guessId, state: "correct" });

        await typedSubscribe.async(chatMessagesForFirehose, { huntId });
        const newMessages = await ChatMessages.find({
          createdAt: { $gt: before },
        }).fetchAsync();

        assert.sameMembers(
          newMessages.map((m) => m.puzzle),
          [...metaPuzzleIds, puzzleId],
          "New chat message should be sent to puzzle and all linked metas",
        );
      });
    });
  });

  describe("chat messages", function () {
    // A method's result can land before the subscription has caught up
    // with its writes, so give the data a moment
    const eventually = async (
      check: () => Promise<boolean>,
      description: string,
    ) => {
      const deadline = Date.now() + 2000;
      while (!(await check())) {
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for ${description}`);
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
      }
    };

    it("pins, reacts and unpins through the methods", async function () {
      this.timeout(10000);
      await resetDatabase("chat messages pin and react");

      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
      await createFixtureHunt.callPromise();

      const huntId = "S5BBzdFRnKSDktDwd";
      const puzzleId = "hiMpJHfWjotCGb9NT";
      await typedSubscribe.async(chatMessagesForPuzzle, { puzzleId, huntId });

      const content = (text: string) =>
        JSON.stringify({ type: "message", children: [{ text }] });
      const pinnedOnPuzzle = () =>
        ChatMessages.findOneAsync({ puzzle: puzzleId, pinTs: { $ne: null } });

      await sendChatMessage.callPromise({
        puzzleId,
        content: content("/pin Hold this thought"),
      });
      await eventually(async () => !!(await pinnedOnPuzzle()), "the pin");
      const pinned = (await pinnedOnPuzzle())!;
      const child = pinned.content.children[0]!;
      assert.isTrue(
        nodeIsText(child) && child.text === "Hold this thought",
        "The /pin prefix is stripped",
      );

      await sendChatMessage.callPromise({
        puzzleId,
        content: content("👍"),
        parentId: pinned._id,
      });
      await eventually(
        async () =>
          !!(await ChatMessages.findOneAsync({ parentId: pinned._id })),
        "the reaction",
      );
      const reaction = (await ChatMessages.findOneAsync({
        parentId: pinned._id,
      }))!;
      assert.isTrue(isReaction(reaction), "An emoji reply is a reaction");

      await removeChatMessage.callPromise({ messageId: reaction._id });
      await eventually(
        async () => !(await ChatMessages.findOneAsync(reaction._id)),
        "the reaction to be removed",
      );

      await sendChatMessage.callPromise({
        puzzleId,
        content: content("/unpin"),
      });
      await eventually(
        async () => !(await pinnedOnPuzzle()),
        "a bare /unpin to clear the pin",
      );
      assert.isDefined(
        await ChatMessages.findOneAsync(pinned._id),
        "but the message itself stays",
      );
    });
  });
}
