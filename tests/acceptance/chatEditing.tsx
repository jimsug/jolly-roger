import { promisify } from "node:util";
import { Accounts } from "meteor/accounts-base";
import { DDP } from "meteor/ddp";
import { Meteor } from "meteor/meteor";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { assert } from "chai";
import { MemoryRouter } from "react-router";
import FixtureHunt from "../../imports/FixtureHunt";
import ChatMessages from "../../imports/lib/models/ChatMessages";
import Whiteboards from "../../imports/lib/models/Whiteboards";
import whiteboardForHunt from "../../imports/lib/publications/whiteboardForHunt";
import addHuntUser from "../../imports/methods/addHuntUser";
import createFixtureHunt from "../../imports/methods/createFixtureHunt";
import createWhiteboard from "../../imports/methods/createWhiteboard";
import promoteOperator from "../../imports/methods/promoteOperator";
import provisionFirstUser from "../../imports/methods/provisionFirstUser";
import sendChatMessage from "../../imports/methods/sendChatMessage";
import resetDatabase from "../lib/resetDatabase";
import createTestUser from "./createTestUser";
import { stabilize, USER_EMAIL, USER_PASSWORD } from "./lib";

if (Meteor.isClient) {
  const Routes: typeof import("../../imports/client/components/Routes").default =
    require("../../imports/client/components/Routes").default;
  const typedSubscribe = require("../../imports/client/typedSubscribe")
    .default as typeof import("../../imports/client/typedSubscribe").default;

  const huntId = FixtureHunt._id;
  const puzzleId = FixtureHunt.puzzles[0]!._id;
  const OTHER_EMAIL = "chat-editing-other@example.com";
  const OTHER_PASSWORD = "password";

  const content = (text: string) =>
    JSON.stringify({ type: "message", children: [{ text }] });

  // The row of the chat history holding some text: the nearest element
  // around it with a Reply button, as long as it has only one (so not the
  // whole page around a toast that shows the same text).
  const rowOf = (text: string) => {
    const replyButtons = (el: HTMLElement) =>
      within(el).queryAllByRole("button", { name: "Reply" }).length;
    const rows = screen.queryAllByText(text).flatMap((match) => {
      let el: HTMLElement | null = match;
      while (el && replyButtons(el) === 0) {
        el = el.parentElement;
      }
      return el && replyButtons(el) === 1 ? [el] : [];
    });
    assert.lengthOf(rows, 1, `one chat row holds "${text}"`);
    return rows[0]!;
  };

  // Types at the end of a Slate editor, which takes text from beforeinput at
  // its selection.
  const typeInto = async (editor: HTMLElement, text: string) => {
    await act(async () => {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: text,
          bubbles: true,
          cancelable: true,
        }),
      );
      await stabilize();
    });
  };

  describe("editing and deleting chat messages", function () {
    let other: ReturnType<typeof DDP.connect> | undefined;
    const subs: Meteor.SubscriptionHandle[] = [];

    afterEach(function () {
      cleanup();
      other?.disconnect();
      other = undefined;
      subs.splice(0).forEach((sub) => sub.stop());
    });

    // A fresh hunt with the user and Other Hunter in it, Other Hunter on a
    // connection of their own
    const setUp = async (name: string) => {
      await resetDatabase(name);
      await provisionFirstUser.callPromise({
        email: USER_EMAIL,
        password: USER_PASSWORD,
      });
      await promisify(Meteor.loginWithPassword)(USER_EMAIL, USER_PASSWORD);
      await createFixtureHunt.callPromise();
      await addHuntUser.callPromise({ huntId, email: USER_EMAIL });
      await createTestUser.callPromise({
        email: OTHER_EMAIL,
        password: OTHER_PASSWORD,
        displayName: "Other Hunter",
      });
      await addHuntUser.callPromise({ huntId, email: OTHER_EMAIL });
      const connection = DDP.connect(Meteor.absoluteUrl());
      other = connection;
      await connection.callAsync("login", {
        user: { email: OTHER_EMAIL },
        password: (
          Accounts as unknown as {
            _hashPassword: (password: string) => unknown;
          }
        )._hashPassword(OTHER_PASSWORD),
      });
      return connection;
    };

    it("edits in place, deletes to a placeholder and leaves others' messages alone", async function () {
      this.timeout(60000);
      other = await setUp("chat editing");

      await sendChatMessage.callPromise({
        puzzleId,
        content: content("Original message"),
      });
      render(
        <MemoryRouter initialEntries={[`/hunts/${huntId}/puzzles/${puzzleId}`]}>
          <Routes />
        </MemoryRouter>,
      );
      await act(async () => {
        await stabilize();
      });
      await screen.findByText("Original message", undefined, {
        timeout: 20000,
      });
      const mineId = (await ChatMessages.findOneAsync({
        puzzle: puzzleId,
        sender: Meteor.userId()!,
      }))!._id;
      await other.callAsync(sendChatMessage.name, {
        puzzleId,
        content: content("A reply from Other"),
        parentId: mineId,
      });
      // Someone else's message has no Edit or Delete
      const theirs = await waitFor(() => rowOf("A reply from Other"), {
        timeout: 10000,
      });
      assert.isNull(
        within(theirs).queryByRole("button", { name: "Edit message" }),
      );
      assert.isNull(
        within(theirs).queryByRole("button", { name: "Delete message" }),
      );

      // Escape gives up an edit
      const editor = () => {
        fireEvent.click(
          within(rowOf("Original message")).getByRole("button", {
            name: "Edit message",
          }),
        );
        return waitFor(() => {
          const found = screen
            .getByRole("button", { name: "Save" })
            .closest("div")
            ?.parentElement?.querySelector<HTMLElement>("[data-slate-editor]");
          assert.exists(found);
          return found;
        });
      };
      fireEvent.keyDown(await editor(), { key: "Escape" });
      await waitFor(() =>
        assert.isNull(screen.queryByRole("button", { name: "Save" })),
      );

      // Enter saves, and the message is marked as edited
      const editing = await editor();
      await typeInto(editing, " (fixed)");
      fireEvent.keyDown(editing, { key: "Enter" });
      // The editor shows the new text too, so wait for it to go first
      await waitFor(
        () => assert.isNull(screen.queryByRole("button", { name: "Save" })),
        { timeout: 10000 },
      );
      const saved = await ChatMessages.findOneAsync(mineId);
      assert.deepEqual(saved?.content, {
        type: "message",
        children: [{ text: "Original message (fixed)" }],
      });
      assert.instanceOf(saved?.editedAt, Date);
      assert.exists(
        within(rowOf("Original message (fixed)")).getByText("(edited)"),
      );

      // Delete asks first, then leaves a placeholder; the reply stays
      fireEvent.click(
        within(rowOf("Original message (fixed)")).getByRole("button", {
          name: "Delete message",
        }),
      );
      const dialog = await screen.findByRole("dialog");
      within(dialog).getByText(/replies to it stay/);
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      await screen.findByText("Message deleted", undefined, {
        timeout: 10000,
      });
      // Gone from the history, and from the dialog once it has faded out
      await waitFor(() => {
        assert.isNull(screen.queryByRole("dialog"));
        assert.isNull(screen.queryByText("Original message (fixed)"));
      });
      assert.exists(rowOf("A reply from Other"));
      const deleted = await ChatMessages.findOneAsync(mineId);
      assert.instanceOf(deleted?.deletedAt, Date);
      assert.deepEqual(deleted?.content.children, []);
      const reply = await ChatMessages.findOneAsync({ parentId: mineId });
      assert.exists(reply, "the reply still points at it");
    });

    it("deletes a board comment from chat with its thread, while nobody else has replied", async function () {
      this.timeout(60000);
      const otherHunter = await setUp("chat editing on the board");
      await promoteOperator.callPromise({
        targetUserId: Meteor.userId()!,
        huntId,
      });
      await createWhiteboard.callPromise({ huntId });
      subs.push(await typedSubscribe.async(whiteboardForHunt, { huntId }));
      const board = (await Whiteboards.findOneAsync({ hunt: huntId }))!;
      const comment = (text: string, y: number) =>
        sendChatMessage.callPromise({
          puzzleId: board.puzzle,
          content: content(text),
          comment: { x: 40, y },
        });
      await comment("A comment Other answers", -200);
      await comment("A comment left alone", -100);

      render(
        <MemoryRouter initialEntries={[`/hunts/${huntId}/whiteboard`]}>
          <Routes />
        </MemoryRouter>,
      );
      await act(async () => {
        await stabilize();
      });
      await screen.findByText("A comment left alone", undefined, {
        timeout: 20000,
      });
      const answered = (await ChatMessages.findOneAsync({
        "content.children.text": "A comment Other answers",
      }))!;
      const deleteButton = (text: string) =>
        within(rowOf(text)).queryByRole("button", { name: "Delete message" });
      assert.exists(deleteButton("A comment Other answers"));

      // Someone else's reply makes the thread the board's to delete
      await otherHunter.callAsync(sendChatMessage.name, {
        puzzleId: board.puzzle,
        content: content("Other's answer"),
        parentId: answered._id,
      });
      await waitFor(() => rowOf("Other's answer"), { timeout: 10000 });
      await waitFor(() =>
        assert.isNull(deleteButton("A comment Other answers")),
      );

      // Delete on a comment with no other replies asks with the board's
      // wording, then removes the whole thread rather than leaving
      // "Message deleted"
      fireEvent.click(deleteButton("A comment left alone")!);
      const dialog = await screen.findByRole("dialog");
      within(dialog).getByText("Delete comment");
      within(dialog).getByText(/every reply to it/);
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      await waitFor(
        () => {
          assert.isNull(screen.queryByRole("dialog"));
          assert.isNull(screen.queryByText("A comment left alone"));
        },
        { timeout: 10000 },
      );
      assert.isNull(screen.queryByText("Message deleted"));
      assert.isUndefined(
        await ChatMessages.findOneAsync({
          "content.children.text": "A comment left alone",
        }),
        "the comment is gone, not emptied",
      );
    });
  });
}
