import { assert } from "chai";
import {
  scrubSecretUrls,
  scrubTelemetry,
} from "../../../../imports/lib/scrubTelemetry";

const documentId = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ_0123456789-ab";

describe("scrubSecretUrls", function () {
  it("filters the token out of account and invitation links", function () {
    assert.equal(scrubSecretUrls("/enroll/abc123"), "/enroll/[Filtered]");
    assert.equal(
      scrubSecretUrls("https://jr.example.com/reset-password/a-b_c?x=1#top"),
      "https://jr.example.com/reset-password/[Filtered]?x=1#top",
    );
    assert.equal(
      scrubSecretUrls("GET /verify-email/tok"),
      "GET /verify-email/[Filtered]",
    );
    assert.equal(
      scrubSecretUrls("from /join/CODE to /join/OTHER"),
      "from /join/[Filtered] to /join/[Filtered]",
    );
  });

  it("filters document ids", function () {
    assert.equal(
      scrubSecretUrls(
        `https://docs.google.com/spreadsheets/d/${documentId}/edit?ui=2#gid=0`,
      ),
      "https://docs.google.com/spreadsheets/d/[Filtered]/edit?ui=2#gid=0",
    );
    assert.equal(
      scrubSecretUrls(
        `https://www.googleapis.com/drive/v3/files/${documentId}/permissions`,
      ),
      "https://www.googleapis.com/drive/v3/files/[Filtered]/permissions",
    );
    assert.equal(
      scrubSecretUrls(
        `https://sheets.googleapis.com/v4/spreadsheets/${documentId}:batchUpdate`,
      ),
      "https://sheets.googleapis.com/v4/spreadsheets/[Filtered]:batchUpdate",
    );
    assert.equal(
      scrubSecretUrls("POST /api/updatePuzzleNote/hunt1/doc1"),
      "POST /api/updatePuzzleNote/hunt1/[Filtered]",
    );
  });

  it("filters the page URL the extension and bookmarklet send", function () {
    assert.equal(
      scrubSecretUrls(
        "/api/hunts/h/puzzles?url=https%3A%2F%2Fexample.com%2Fpuzzle",
      ),
      "/api/hunts/h/puzzles?url=[Filtered]",
    );
    assert.equal(
      scrubSecretUrls(
        "/hunts/h/puzzles?title=Puzzle&url=https%3A%2F%2Fexample.com&x=1#top",
      ),
      "/hunts/h/puzzles?title=Puzzle&url=[Filtered]&x=1#top",
    );
    // A query string on its own, as in a request's query_string
    assert.equal(
      scrubSecretUrls("url=https%3A%2F%2Fexample.com"),
      "url=[Filtered]",
    );
  });

  it("leaves everything else alone", function () {
    for (const text of [
      "",
      "/hunts/abc/puzzles/def",
      "/join",
      "/join/",
      "/rejoin/abc",
      "/enrollment/abc",
      "/d/tooShortForADocument",
      "/api/hunts/abc/tags",
      "/x?curl=1&hurl=2",
      "POST /updatePuzzleNote/:huntId/:documentId",
    ]) {
      assert.equal(scrubSecretUrls(text), text);
    }
  });
});

describe("scrubTelemetry", function () {
  it("scrubs every string in an event and leaves the event as it was", function () {
    const event = {
      transaction: "/enroll/tok",
      request: {
        url: "https://jr.example.com/join/CODE",
        headers: { Referer: "https://jr.example.com/verify-email/tok" },
      },
      contexts: {
        trace: {
          data: {
            "url.path": "/reset-password/tok",
            "http.response.status_code": 200,
          },
        },
      },
      spans: [
        {
          description: `GET https://www.googleapis.com/drive/v3/files/${documentId}`,
          data: { "http.query": "url=https%3A%2F%2Fexample.com" },
        },
      ],
      breadcrumbs: [
        { category: "navigation", data: { from: "/enroll/tok", to: "/" } },
      ],
    };
    const original = structuredClone(event);

    assert.deepEqual(scrubTelemetry(event), {
      transaction: "/enroll/[Filtered]",
      request: {
        url: "https://jr.example.com/join/[Filtered]",
        headers: { Referer: "https://jr.example.com/verify-email/[Filtered]" },
      },
      contexts: {
        trace: {
          data: {
            "url.path": "/reset-password/[Filtered]",
            "http.response.status_code": 200,
          },
        },
      },
      spans: [
        {
          description:
            "GET https://www.googleapis.com/drive/v3/files/[Filtered]",
          data: { "http.query": "url=[Filtered]" },
        },
      ],
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/enroll/[Filtered]", to: "/" },
        },
      ],
    });
    assert.deepEqual(event, original);
  });

  it("drops client addresses wherever they appear", function () {
    const scrubbed: unknown = scrubTelemetry({
      contexts: {
        trace: {
          data: { "http.client_ip": "203.0.113.7", "http.flavor": "1.1" },
        },
      },
      spans: [{ data: { "http.client_ip": "203.0.113.7" } }],
    });
    assert.deepEqual(scrubbed, {
      contexts: { trace: { data: { "http.flavor": "1.1" } } },
      spans: [{ data: {} }],
    });
  });

  it("passes through values that aren't plain objects or strings", function () {
    const date = new Date(0);
    const url = new URL("https://jr.example.com/enroll/tok");
    const scrubbed = scrubTelemetry({
      date,
      url,
      count: 0,
      flag: false,
      empty: null,
      missing: undefined,
    });
    assert.strictEqual(scrubbed.date, date);
    assert.strictEqual(scrubbed.url, url);
    assert.deepEqual(scrubbed, {
      date,
      url,
      count: 0,
      flag: false,
      empty: null,
      missing: undefined,
    });
    assert.strictEqual(scrubTelemetry(7), 7);
    assert.isNull(scrubTelemetry(null));
  });

  it("copes with empty, shared and cyclic structures", function () {
    assert.equal(scrubTelemetry(""), "");
    assert.deepEqual(scrubTelemetry({}), {});
    assert.deepEqual(scrubTelemetry([]), []);

    const shared = { url: "/join/CODE" };
    assert.deepEqual(scrubTelemetry({ first: shared, second: [shared] }), {
      first: { url: "/join/[Filtered]" },
      second: [{ url: "/join/[Filtered]" }],
    });

    const cyclic: Record<string, unknown> = { url: "/join/CODE" };
    cyclic.self = cyclic;
    assert.deepEqual(scrubTelemetry(cyclic), {
      url: "/join/[Filtered]",
      self: "[Circular]",
    });
  });
});
