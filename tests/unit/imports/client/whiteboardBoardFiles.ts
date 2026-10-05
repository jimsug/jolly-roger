import { assert } from "chai";
import sinon from "sinon";
import {
  BoardChangedError,
  fetchBoardJson,
  gunzipChunks,
} from "../../../../imports/client/components/whiteboard/boardFiles";
import exportWhiteboard from "../../../../imports/methods/exportWhiteboard";

const gzip = async (text: string) =>
  new Uint8Array(
    await new Response(
      new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );

// text gzipped and cut into parts chunks, as the server sends a big board.
const gzipChunks = async (text: string, parts: number) => {
  const zipped = await gzip(text);
  const size = Math.ceil(zipped.length / parts);
  return Array.from({ length: parts }, (_, i) =>
    zipped.slice(i * size, (i + 1) * size),
  );
};

describe("whiteboard boardFiles", function () {
  const text = JSON.stringify({
    format: 1,
    nodes: Array.from({ length: 200 }, (_, i) => ({ _id: `n${i}`, x: i })),
    edges: [],
  });

  afterEach(function () {
    sinon.restore();
  });

  it("joins gzipped chunks in order", async function () {
    assert.equal(await gunzipChunks(await gzipChunks(text, 3)), text);
    assert.equal(await gunzipChunks(await gzipChunks("", 1)), "");
  });

  it("fetches every chunk of one export and joins them", async function () {
    const chunks = await gzipChunks(text, 3);
    const call = sinon
      .stub(exportWhiteboard, "callPromise")
      .callsFake(({ index }) =>
        Promise.resolve({
          data: chunks[index]!,
          chunkCount: chunks.length,
          hash: "same",
        }),
      );
    assert.equal(await fetchBoardJson("board"), text);
    assert.deepEqual(
      call.getCalls().map((c) => c.args[0]),
      [
        { boardId: "board", index: 0 },
        { boardId: "board", index: 1, hash: "same" },
        { boardId: "board", index: 2, hash: "same" },
      ],
    );
  });

  it("refuses chunks from two different boards", async function () {
    const chunks = await gzipChunks(text, 2);
    sinon.stub(exportWhiteboard, "callPromise").callsFake(({ index }) =>
      Promise.resolve({
        data: chunks[index]!,
        chunkCount: chunks.length,
        hash: index === 0 ? "before" : "after",
      }),
    );
    await assert.isRejected(fetchBoardJson("board"), BoardChangedError);
  });
});
