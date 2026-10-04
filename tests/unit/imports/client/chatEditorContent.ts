import { assert } from "chai";
import type { Descendant } from "slate";
import {
  cleanEditorMessage,
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
});
