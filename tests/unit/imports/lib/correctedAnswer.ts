import { assert } from "chai";
import correctedAnswer from "../../../../imports/lib/correctedAnswer";

describe("correctedAnswer", function () {
  it("sends nothing for a blank edit", function () {
    assert.isUndefined(correctedAnswer("", "ANSWER"));
    assert.isUndefined(correctedAnswer("  \n ", "ANSWER"));
  });

  it("sends nothing for an edit that only changes letter case", function () {
    assert.isUndefined(correctedAnswer("answer", "ANSWER"));
    assert.isUndefined(correctedAnswer(" Answer ", "ANSWER"));
  });

  it("sends a spacing-only edit without asking for confirmation", function () {
    assert.deepEqual(correctedAnswer("AN SWER", "ANSWER"), {
      answer: "AN SWER",
      changesMoreThanSpacing: false,
    });
    assert.deepEqual(correctedAnswer(" an swer ", "ANSWER"), {
      answer: "an swer",
      changesMoreThanSpacing: false,
    });
    assert.deepEqual(correctedAnswer("TWOWORDS", "TWO WORDS"), {
      answer: "TWOWORDS",
      changesMoreThanSpacing: false,
    });
  });

  it("flags an edit that changes the answer itself", function () {
    assert.deepEqual(correctedAnswer(" answer two ", "ANSWER"), {
      answer: "answer two",
      changesMoreThanSpacing: true,
    });
    assert.deepEqual(correctedAnswer("ANSWRE", "ANSWER"), {
      answer: "ANSWRE",
      changesMoreThanSpacing: true,
    });
  });
});
