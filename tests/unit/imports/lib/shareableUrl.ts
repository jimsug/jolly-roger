import { assert } from "chai";
import shareableUrl from "../../../../imports/lib/shareableUrl";

describe("shareableUrl", function () {
  it("takes out the account a Google link was opened with", function () {
    assert.equal(
      shareableUrl(
        "https://docs.google.com/spreadsheets/d/abc/edit?authuser=me%40example.com&ui=2&rm=embedded&gid=0#gid=0",
      ),
      "https://docs.google.com/spreadsheets/d/abc/edit?ui=2&rm=embedded&gid=0#gid=0",
    );
    assert.equal(
      shareableUrl(
        "https://docs.google.com/document/d/abc/edit?usp=sharing&ouid=123&authuser=0",
      ),
      "https://docs.google.com/document/d/abc/edit?usp=sharing",
    );
  });

  it("drops the question mark when nothing else is left", function () {
    assert.equal(
      shareableUrl("https://docs.google.com/document/d/abc/edit?authuser=1"),
      "https://docs.google.com/document/d/abc/edit",
    );
  });

  it("leaves a link without account parameters exactly as it was", function () {
    for (const url of [
      "https://docs.google.com/spreadsheets/d/abc/edit?ui=2&rm=embedded&gid=0#gid=0",
      "https://example.com/a%20b?q=x+y",
      "https://example.com/",
      "not a url",
      "",
    ]) {
      assert.equal(shareableUrl(url), url);
    }
  });
});
