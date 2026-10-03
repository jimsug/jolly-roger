import { assert } from "chai";
import safeHref from "../../../../imports/lib/safeHref";

describe("safeHref", function () {
  it("allows http and https", function () {
    assert.equal(safeHref("http://example.com"), "http://example.com");
    assert.equal(
      safeHref("https://example.com/a?b=c#d"),
      "https://example.com/a?b=c#d",
    );
  });

  it("allows mailto", function () {
    assert.equal(
      safeHref("mailto:someone@example.com"),
      "mailto:someone@example.com",
    );
  });

  it("ignores case in the scheme", function () {
    assert.equal(safeHref("HTTPS://Example.com"), "HTTPS://Example.com");
    assert.equal(safeHref("MailTo:a@b.com"), "MailTo:a@b.com");
  });

  it("allows same-site absolute paths", function () {
    assert.equal(safeHref("/hunts/abc/puzzles/def"), "/hunts/abc/puzzles/def");
    assert.equal(safeHref("/"), "/");
  });

  it("refuses protocol-relative URLs", function () {
    assert.isUndefined(safeHref("//evil.example"));
    assert.isUndefined(safeHref("/\\evil.example"));
    assert.isUndefined(safeHref("\\\\evil.example"));
    assert.isUndefined(safeHref("/\t/evil.example"));
  });

  it("refuses javascript in any case", function () {
    assert.isUndefined(safeHref("javascript:alert(1)"));
    assert.isUndefined(safeHref("JaVaScRiPt:alert(1)"));
  });

  it("refuses data and vbscript", function () {
    assert.isUndefined(safeHref("data:text/html,<script>alert(1)</script>"));
    assert.isUndefined(safeHref("vbscript:msgbox(1)"));
  });

  it("refuses other schemes and schemeless hosts", function () {
    assert.isUndefined(safeHref("ftp://example.com"));
    assert.isUndefined(safeHref("example.com"));
    assert.isUndefined(safeHref("puzzles/abc"));
    assert.isUndefined(safeHref("#top"));
    assert.isUndefined(safeHref("javascript&colon;alert(1)"));
  });

  it("refuses schemes split up with tabs or newlines", function () {
    assert.isUndefined(safeHref("java\tscript:alert(1)"));
    assert.isUndefined(safeHref("java\nscript:alert(1)"));
    assert.isUndefined(safeHref("java\r\nscript:alert(1)"));
  });

  it("refuses javascript behind leading spaces and control characters", function () {
    assert.isUndefined(safeHref("  javascript:alert(1)"));
    assert.isUndefined(safeHref("\t javascript:alert(1)"));
    assert.isUndefined(safeHref("\u0000javascript:alert(1)"));
    assert.isUndefined(safeHref("\u0001 JAVASCRIPT:alert(1)"));
  });

  it("trims leading and trailing spaces and tabs off safe links", function () {
    assert.equal(safeHref("  https://example.com  "), "https://example.com");
    assert.equal(safeHref("\thttps://example.com\n"), "https://example.com");
    assert.equal(safeHref(" /hunts/abc "), "/hunts/abc");
  });

  it("refuses empty and blank hrefs", function () {
    assert.isUndefined(safeHref(""));
    assert.isUndefined(safeHref("   "));
    assert.isUndefined(safeHref("\t\n"));
  });
});
