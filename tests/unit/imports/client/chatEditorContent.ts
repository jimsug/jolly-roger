import { assert } from "chai";
import type { Descendant } from "slate";
import {
  cleanEditorMessage,
  editorContentFromMessage,
  hasLoadingImage,
  hasSendableContent,
} from "../../../../imports/client/chatEditorContent";
import type { ImageStatus } from "../../../../imports/client/components/FancyEditor";

const message = (...children: unknown[]) =>
  [{ type: "message", children }] as Descendant[];
const image = (status: ImageStatus) => ({
  type: "image",
  url: status === "success" ? "https://images.example.com/a.png" : "",
  tempId: "temp",
  status,
  children: [{ text: "" }],
});

describe("chatEditorContent", function () {
  it("has nothing to send with only blank text", function () {
    assert.isFalse(hasSendableContent(message({ text: "" })));
    assert.isFalse(hasSendableContent(message({ text: "  " })));
    assert.isFalse(hasSendableContent([]));
    assert.isTrue(hasSendableContent(message({ text: "hi" })));
  });

  it("counts an uploaded or uploading image, but not a failed one", function () {
    assert.isTrue(hasSendableContent(message(image("success"))));
    assert.isTrue(hasSendableContent(message(image("loading"))));
    assert.isTrue(hasLoadingImage(message(image("loading"))));
    assert.isFalse(hasSendableContent(message(image("error"))));
    assert.isFalse(hasSendableContent(message({ text: "" }, image("error"))));
    assert.deepEqual(cleanEditorMessage(message(image("error"))).children, []);
  });

  describe("editorContentFromMessage", function () {
    it("puts empty text around and between inline elements", function () {
      const [block] = editorContentFromMessage({
        type: "message",
        children: [
          { type: "mention", userId: "u1" },
          { type: "puzzle", puzzleId: "p1" },
          { text: "hello" },
          { type: "image", url: "https://images.example.com/a.png" },
        ],
      }) as { children: Record<string, unknown>[] }[];
      assert.deepEqual(
        block!.children.map((child) =>
          "type" in child ? child.type : child.text,
        ),
        ["", "mention", "", "puzzle", "hello", "image", ""],
      );
      const image = block!.children[5]!;
      assert.equal(image.status, "success");
      assert.isString(image.tempId);
    });

    it("gives an empty message one empty text", function () {
      assert.deepEqual(
        editorContentFromMessage({ type: "message", children: [] }),
        message({ text: "" }),
      );
    });

    it("cleans back to the message it came from", function () {
      const sent = {
        type: "message" as const,
        children: [
          { text: "see " },
          { type: "puzzle" as const, puzzleId: "p1" },
          { text: " and ask " },
          { type: "role-mention" as const, roleId: "operator" as const },
          { type: "image" as const, url: "https://images.example.com/a.png" },
        ],
      };
      assert.deepEqual(
        cleanEditorMessage(editorContentFromMessage(sent)),
        sent,
      );
    });
  });
});
