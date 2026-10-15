import { describe, expect, it } from "vitest";
import { concat, FLUSH, pktLine } from "./pkt-line";
import { pushedBranches } from "./receive-pack";

const A = "a".repeat(40);
const B = "b".repeat(40);
const ZERO = "0".repeat(40);

function body(...parts: Uint8Array[]): ReadableStream<Uint8Array> {
  const bytes = concat(parts);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("pushedBranches", () => {
  it("reads the branch updates in front of the pack", async () => {
    const pushed = await pushedBranches(
      body(
        pktLine(`${A} ${B} refs/heads/header\0report-status side-band-64k\n`),
        pktLine(`${B} ${ZERO} refs/heads/old\n`),
        pktLine(`${ZERO} ${A} refs/tags/v1\n`),
        FLUSH,
        new TextEncoder().encode("PACK…"),
      ),
    );
    expect(pushed).toEqual([
      { branch: "header", deleted: false },
      { branch: "old", deleted: true },
    ]);
  });

  it("is nothing for an empty request", async () => {
    expect(await pushedBranches(body(FLUSH))).toEqual([]);
  });
});
