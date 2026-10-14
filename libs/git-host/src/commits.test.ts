import { describe, expect, it } from "vitest";
import { branchCommits, trailersOf } from "./commits";
import type { Commit } from "./host";

// main: m0 - m1 - m2
// cut from m0, then merged m2 in: b1 - b2 - merged(b2, m2) - b3
const parents: Record<string, string[]> = {
  m0: [],
  m1: ["m0"],
  m2: ["m1"],
  b1: ["m0"],
  b2: ["b1"],
  merged: ["b2", "m2"],
  b3: ["merged"],
};

const readCommits = async (ref: string, limit: number, offset: number) => {
  const line: Commit[] = [];
  for (let hash: string | undefined = ref; hash && parents[hash]; ) {
    line.push({
      hash,
      parents: parents[hash]!,
      message: hash,
      author: "A",
      committedAt: 0,
    });
    hash = parents[hash]![0];
  }
  return line.slice(offset, offset + limit);
};

describe("branchCommits", () => {
  it("lists the branch's own first-parent line, oldest first", async () => {
    const commits = await branchCommits(readCommits, "m0", "b3");
    expect(commits.map((c) => c.hash)).toEqual(["b1", "b2", "merged", "b3"]);
  });

  it("lists nothing for a branch at its base", async () => {
    expect(await branchCommits(readCommits, "m2", "m2")).toEqual([]);
  });

  it("lists every commit when there is no base", async () => {
    const commits = await branchCommits(readCommits, null, "m2");
    expect(commits.map((c) => c.hash)).toEqual(["m0", "m1", "m2"]);
  });
});

describe("trailersOf", () => {
  it("reads the trailers of the last paragraph", () => {
    const trailers = trailersOf(
      "Aggregate usage\n\nSums it per day.\n\nAgent-Transcript: TR_1\nCo-Authored-By: A <a@b>\n",
    );
    expect(trailers.get("agent-transcript")).toBe("TR_1");
    expect(trailers.get("co-authored-by")).toBe("A <a@b>");
  });

  it("ignores a subject line that looks like one", () => {
    expect(trailersOf("Fix: the build").size).toBe(0);
  });

  it("ignores a last paragraph that is prose", () => {
    expect(
      trailersOf("Title\n\nAgent-Transcript: x\nand some prose").size,
    ).toBe(0);
  });
});
