import { assert } from "chai";
import guessShownInQueue, {
  GUESS_QUEUE_FILTERABLE_STATES,
} from "../../../../imports/lib/guessQueueFilter";

describe("guessShownInQueue", function () {
  it("always shows pending guesses", function () {
    assert.isTrue(guessShownInQueue({ state: "pending" }, []));
    assert.isTrue(
      guessShownInQueue({ state: "pending" }, GUESS_QUEUE_FILTERABLE_STATES),
    );
  });

  it("hides every other state when nothing is selected", function () {
    GUESS_QUEUE_FILTERABLE_STATES.forEach((state) => {
      assert.isFalse(guessShownInQueue({ state }, []), state);
    });
  });

  it("shows a state only while it is selected", function () {
    assert.isTrue(guessShownInQueue({ state: "correct" }, ["correct"]));
    assert.isTrue(
      guessShownInQueue({ state: "incorrect" }, ["correct", "incorrect"]),
    );
    assert.isFalse(
      guessShownInQueue({ state: "rejected" }, ["correct", "incorrect"]),
    );
    assert.isFalse(guessShownInQueue({ state: "intermediate" }, ["correct"]));
  });

  it("shows everything when every state is selected", function () {
    GUESS_QUEUE_FILTERABLE_STATES.forEach((state) => {
      assert.isTrue(
        guessShownInQueue({ state }, GUESS_QUEUE_FILTERABLE_STATES),
        state,
      );
    });
  });

  it("offers the four non-pending states", function () {
    assert.deepEqual(
      [...GUESS_QUEUE_FILTERABLE_STATES],
      ["correct", "intermediate", "incorrect", "rejected"],
    );
  });
});
