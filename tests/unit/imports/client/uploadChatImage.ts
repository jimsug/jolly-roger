import { assert } from "chai";
import sinon from "sinon";
import i18n from "../../../../imports/client/i18n";
import type { ChatImageUploadFailure } from "../../../../imports/client/uploadChatImage";
import uploadChatImage, {
  chatImageFailureReason,
} from "../../../../imports/client/uploadChatImage";
import { MAX_UPLOAD_BYTES } from "../../../../imports/lib/imageUploads";
import createChatImageUpload from "../../../../imports/methods/createChatImageUpload";
import {
  brokenFile,
  gifFile,
  svgFile,
  webpFile,
} from "../../../lib/imageFiles";

type Outcome = { uploaded: string } | { failed: ChatImageUploadFailure };

describe("uploadChatImage", function () {
  let request: sinon.SinonStub;
  let fetch: sinon.SinonStub;

  beforeEach(function () {
    request = sinon
      .stub(createChatImageUpload, "call")
      .callsFake((...args: unknown[]) => {
        const callback = args.at(-1) as (
          error: undefined,
          upload: {
            publicUrl: string;
            uploadUrl: string;
            fields: Record<string, string>;
          },
        ) => void;
        callback(undefined, {
          publicUrl: "https://bucket.example.com/image",
          uploadUrl: "https://bucket.example.com/",
          fields: { key: "image" },
        });
      });
    fetch = sinon.stub(window, "fetch").resolves(new Response());
  });

  afterEach(function () {
    sinon.restore();
  });

  const upload = (file: File) =>
    new Promise<Outcome>((resolve) => {
      uploadChatImage(
        "puzzle",
        file,
        (url) => resolve({ uploaded: url }),
        (failure) => resolve({ failed: failure }),
      );
    });

  // The file the upload sent to the bucket
  const sentFile = () => {
    const body = fetch.firstCall.args[1].body as FormData;
    return body.get("file") as File;
  };

  it("uploads a WebP as a PNG", async function () {
    const webp = await webpFile();
    const toBlob = sinon
      .stub(HTMLCanvasElement.prototype, "toBlob")
      .callsFake((callback) => callback(new Blob(["png"])));

    const outcome = await upload(webp);

    assert.deepEqual(outcome, { uploaded: "https://bucket.example.com/image" });
    assert.equal(toBlob.firstCall.args[1], "image/png");
    assert.deepEqual(request.firstCall.args[0], {
      puzzleId: "puzzle",
      mimeType: "image/png",
    });
    assert.equal(sentFile().name, "screenshot.png");
    assert.equal(sentFile().type, "image/png");
  });

  it("never sends an SVG to the bucket", async function () {
    await upload(svgFile());
    assert.equal(request.firstCall.args[0].mimeType, "image/png");
    assert.equal(sentFile().type, "image/png");
    assert.notInclude(await sentFile().text(), "<script>");
  });

  it("uploads a GIF untouched, so it stays animated", async function () {
    const toBlob = sinon.spy(HTMLCanvasElement.prototype, "toBlob");
    const gif = gifFile();

    await upload(gif);

    assert.isTrue(toBlob.notCalled);
    assert.equal(request.firstCall.args[0].mimeType, "image/gif");
    assert.equal(await sentFile().text(), "GIF89a");
    assert.equal(sentFile().name, "animated.gif");
  });

  it("refuses an image the browser can't decode, before asking the server", async function () {
    const outcome = await upload(brokenFile());

    assert.property(outcome, "failed");
    const { failed } = outcome as { failed: ChatImageUploadFailure };
    assert.equal(failed.stage, "convert");
    assert.match(chatImageFailureReason(failed, i18n.t)!, /can't convert/);
    assert.isTrue(request.notCalled);
    assert.isTrue(fetch.notCalled);
  });

  it("refuses an image over the upload limit, before asking the server", async function () {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.png", {
      type: "image/png",
    });

    const outcome = await upload(big);

    assert.deepEqual(outcome, { failed: { stage: "tooBig" } });
    assert.equal(
      chatImageFailureReason({ stage: "tooBig" }, i18n.t),
      "Images can be at most 10 MB.",
    );
    assert.isTrue(request.notCalled);
    assert.isTrue(fetch.notCalled);

    // One at the limit goes up
    const atLimit = new File([new Uint8Array(MAX_UPLOAD_BYTES)], "ok.png", {
      type: "image/png",
    });
    assert.deepEqual(await upload(atLimit), {
      uploaded: "https://bucket.example.com/image",
    });
  });
});
