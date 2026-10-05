import { assert } from "chai";
import {
  EXPORT_PADDING,
  EXPORT_PIXEL_RATIO,
  exportFileName,
  exportImageSize,
  MAX_EXPORT_PIXELS,
} from "../../../../imports/lib/whiteboard/exportFiles";

describe("whiteboard exportFiles", function () {
  describe("exportFileName", function () {
    const day = new Date(2026, 2, 7, 23, 30);

    it("names the file after the hunt and the local date, padded", function () {
      assert.equal(
        exportFileName("Mystery Hunt 2018", day, "png"),
        "Mystery Hunt 2018-whiteboard-2026-03-07.png",
      );
      assert.equal(
        exportFileName("Hunt", new Date(2026, 10, 12), "json"),
        "Hunt-whiteboard-2026-11-12.json",
      );
    });

    it('calls a hunt with no usable name "hunt"', function () {
      for (const name of [undefined, "", "   ", "///", ' :*?"<> ']) {
        assert.equal(
          exportFileName(name, day, "json"),
          "hunt-whiteboard-2026-03-07.json",
          JSON.stringify(name),
        );
      }
    });

    it("replaces each run of characters a file name can't hold with one hyphen", function () {
      assert.equal(
        exportFileName("A/B\\C: D?*|E", day, "png"),
        "A-B-C- D-E-whiteboard-2026-03-07.png",
      );
      assert.equal(
        exportFileName("Tab\there\nnew\u007Fline", day, "png"),
        "Tab-here-new-line-whiteboard-2026-03-07.png",
      );
      assert.equal(
        exportFileName("  50% off  ", day, "png"),
        "50- off-whiteboard-2026-03-07.png",
      );
    });
  });

  describe("exportImageSize", function () {
    const cap = MAX_EXPORT_PIXELS / EXPORT_PIXEL_RATIO;

    it("draws a board that fits at full size, with padding round it", function () {
      assert.deepEqual(exportImageSize({ width: 1000, height: 400 }), {
        zoom: 1,
        width: 1000 + 2 * EXPORT_PADDING,
        height: 400 + 2 * EXPORT_PADDING,
      });
    });

    it("keeps a board exactly at the cap at full size", function () {
      const size = exportImageSize({
        width: cap - 2 * EXPORT_PADDING,
        height: 10,
      });
      assert.equal(size.zoom, 1);
      assert.equal(size.width * EXPORT_PIXEL_RATIO, MAX_EXPORT_PIXELS);
    });

    it("scales a bigger board down so its long side is the cap", function () {
      for (const bounds of [
        { width: cap - 2 * EXPORT_PADDING + 1, height: 300 },
        { width: 20_000, height: 5_000 },
        { width: 300, height: 99_999.9 },
        { width: 12_345.67, height: 12_345.67 },
      ]) {
        const size = exportImageSize(bounds);
        assert.isBelow(size.zoom, 1);
        assert.equal(
          Math.max(size.width, size.height) * EXPORT_PIXEL_RATIO,
          MAX_EXPORT_PIXELS,
          JSON.stringify(bounds),
        );
      }
      const wide = exportImageSize({ width: 20_000, height: 5_000 });
      assert.closeTo(wide.height / wide.width, 5080 / 20080, 0.001);
    });

    it("never makes a side less than a pixel", function () {
      const size = exportImageSize({ width: 1_000_000, height: 0 });
      assert.equal(size.width, cap);
      assert.equal(size.height, 1);
      assert.deepEqual(exportImageSize({ width: 0, height: 0 }), {
        zoom: 1,
        width: 2 * EXPORT_PADDING,
        height: 2 * EXPORT_PADDING,
      });
    });
  });
});
