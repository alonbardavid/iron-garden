import { describe, expect, it } from "vitest";
import { mergeBase, type LogCommit } from "./merge-base";

// main: m0 - m1 - m2 - m3
// cut from m0, then merged m2 in: b1 - b2 - merged(b2, m2)
const parents: Record<string, string[]> = {
  m0: [],
  m1: ["m0"],
  m2: ["m1"],
  m3: ["m2"],
  b1: ["m0"],
  b2: ["b1"],
  merged: ["b2", "m2"],
  ahead: ["m3"],
  behind: ["m1"],
  orphan: [],
};

function history(extra: Record<string, string[]> = {}) {
  const graph = { ...parents, ...extra };
  const reads: string[] = [];
  const readLog = async (ref: string, limit: number, offset: number) => {
    reads.push(ref);
    const line: LogCommit[] = [];
    for (let hash: string | undefined = ref; hash; ) {
      const commitParents = graph[hash];
      if (!commitParents) {
        break;
      }
      line.push({ hash, tree: `tree-${hash}`, parents: commitParents });
      hash = commitParents[0];
    }
    return line.slice(offset, offset + limit);
  };
  return { readLog, reads };
}

describe("mergeBase", () => {
  it.each([
    ["a branch on top of the target", "ahead", "m3"],
    ["a branch cut from an older commit", "behind", "m1"],
    ["a branch that merged the target in", "merged", "m2"],
    ["the target itself", "m3", "m3"],
  ])("finds where %s leaves it", async (_, head, base) => {
    const { readLog } = history();
    expect(await mergeBase(readLog, "m3", head)).toEqual({
      hash: base,
      tree: `tree-${base}`,
      parents: parents[base],
    });
  });

  it("reads the target's line once and the branch's line until they meet", async () => {
    const { readLog, reads } = history();
    await mergeBase(readLog, "m3", "ahead");
    expect(reads).toEqual(["m3", "ahead"]);
  });

  it("is null for a branch with no history in common", async () => {
    const { readLog } = history();
    expect(await mergeBase(readLog, "m3", "orphan")).toBeNull();
  });

  it("gives up on a branch too long to walk", async () => {
    const long: Record<string, string[]> = { c0: ["m3"] };
    for (let i = 1; i <= 2500; i++) {
      long[`c${i}`] = [`c${i - 1}`];
    }
    const { readLog } = history(long);
    expect(await mergeBase(readLog, "m3", "c2500")).toBeNull();
  });
});
