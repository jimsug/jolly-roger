import { assert } from "chai";
import sinon from "sinon";
import {
  convertImageToPng,
  InvalidImage,
  isDirectlySupported,
} from "../../../../imports/client/components/InsertImage";
import {
  brokenFile,
  gifFile,
  svgFile,
  webpFile,
} from "../../../lib/imageFiles";

describe("InsertImage conversion", function () {
  afterEach(function () {
    sinon.restore();
  });

  it("uploads PNG, JPEG and GIF as they are", function () {
    assert.isTrue(isDirectlySupported(gifFile()));
    assert.isTrue(
      isDirectlySupported(new File([""], "a.jpg", { type: "image/jpeg" })),
    );
    // Going by the name when the browser gives no type
    assert.isTrue(isDirectlySupported(new File([""], "a.PNG")));
    assert.isFalse(isDirectlySupported(svgFile()));
    assert.isFalse(isDirectlySupported(brokenFile()));
  });

  it("draws a WebP to a canvas and saves it as a PNG", async function () {
    const webp = await webpFile();
    const drawImage = sinon.spy(
      CanvasRenderingContext2D.prototype,
      "drawImage",
    );
    const toBlob = sinon
      .stub(HTMLCanvasElement.prototype, "toBlob")
      .callsFake(function (this: HTMLCanvasElement, callback) {
        callback(new Blob([`${this.width}x${this.height}`]));
      });

    const png = await convertImageToPng(webp);

    assert.equal(png.name, "screenshot.png");
    assert.equal(png.type, "image/png");
    assert.equal(await png.text(), "3x2");
    assert.isTrue(drawImage.calledOnce);
    assert.equal(toBlob.firstCall.args[1], "image/png");
  });

  it("rasterises an SVG", async function () {
    const png = await convertImageToPng(svgFile());
    assert.equal(png.name, "drawing.png");
    assert.equal(png.type, "image/png");
    const header = new Uint8Array(await png.slice(0, 4).arrayBuffer());
    assert.deepEqual([...header], [0x89, 0x50, 0x4e, 0x47]);
  });

  it("refuses an image the browser can't decode", async function () {
    await assert.isRejected(convertImageToPng(brokenFile()), InvalidImage);
  });

  it("refuses when the canvas can't make a PNG", async function () {
    sinon
      .stub(HTMLCanvasElement.prototype, "toBlob")
      .callsFake((callback) => callback(null));
    await assert.isRejected(convertImageToPng(svgFile()), InvalidImage);
  });
});
