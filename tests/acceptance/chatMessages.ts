import { promisify } from "node:util";
import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import isReaction from "../../imports/lib/isReaction";
import ChatMessages from "../../imports/lib/models/ChatMessages";
import nodeIsText from "../../imports/lib/nodeIsText";
import chatMessagesForPuzzle from "../../imports/lib/publications/chatMessagesForPuzzle";
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import removeChatReaction from "../../imports/methods/removeChatReaction";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import resetDatabase from "../lib/resetDatabase";
import { USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  describe("chat messages", function () {
    let subscription: Meteor.SubscriptionHandle | undefined;
    afterEach(function () {
      subscription?.stop();
      subscription = undefined;
    });

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
      subscription = await typedSubscribe.async(chatMessagesForPuzzle, {
        puzzleId,
        huntId,
      });

      const content = (text: string) =>
        JSON.stringify({ type: "message", children: [{ text }] });
      const pinnedOnPuzzle = () =>
        ChatMessages.findOneAsync({
          puzzle: puzzleId,
          pinTs: { $exists: true },
        });

      // A method's promise resolves once its writes have reached the
      // subscription, so each result can be checked straight away
      await sendChatMessage.callPromise({
        puzzleId,
        content: content("/pin Hold this thought"),
      });
      const pinned = await pinnedOnPuzzle();
      assert.isDefined(pinned, "/pin pins the message");
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
      const reaction = await ChatMessages.findOneAsync({
        parentId: pinned._id,
      });
      assert.isDefined(reaction, "The emoji reply is stored");
      assert.isTrue(isReaction(reaction), "An emoji reply is a reaction");

      await removeChatReaction.callPromise({ messageId: reaction._id });
      assert.isUndefined(
        await ChatMessages.findOneAsync(reaction._id),
        "The reaction is removed",
      );

      await sendChatMessage.callPromise({
        puzzleId,
        content: content("/unpin"),
      });
      assert.isUndefined(
        await pinnedOnPuzzle(),
        "A bare /unpin clears the pin",
      );
      assert.isDefined(
        await ChatMessages.findOneAsync(pinned._id),
        "but the message itself stays",
      );
    });
  });
}
