import { describe, expect, it } from "vitest";
import { countLines, diffTrees, type TreeEntry } from "./tree-diff";

const trees: Record<string, TreeEntry[]> = {
  base: [
    { name: "README.md", hash: "r1", type: "blob" },
    { name: "src", hash: "src1", type: "tree" },
    { name: "docs", hash: "docs1", type: "tree" },
  ],
  src1: [
    { name: "a.ts", hash: "a1", type: "blob" },
    { name: "b.ts", hash: "b1", type: "blob" },
  ],
  docs1: [{ name: "guide.md", hash: "g1", type: "blob" }],
  head: [
    { name: "README.md", hash: "r1", type: "blob" },
    { name: "src", hash: "src2", type: "tree" },
    { name: "docs", hash: "docs-file", type: "blob" },
  ],
  readmeOnly: [
    { name: "README.md", hash: "r2", type: "blob" },
    { name: "src", hash: "src1", type: "tree" },
    { name: "docs", hash: "docs1", type: "tree" },
  ],
  src2: [
    { name: "a.ts", hash: "a2", type: "blob" },
    { name: "c.ts", hash: "c1", type: "blob" },
  ],
};

function reader() {
  const read: string[] = [];
  return {
    read,
    readTree: async (hash: string) => {
      read.push(hash);
      const entries = trees[hash];
      if (!entries) {
        throw new Error(`No tree ${hash}`);
      }
      return entries;
    },
  };
}

describe("diffTrees", () => {
  it("lists added, modified and deleted files, and a tree replaced by a file", async () => {
    const { readTree } = reader();
    expect(await diffTrees(readTree, "base", "head")).toEqual([
      { path: "docs", change: "added", oldHash: null, newHash: "docs-file" },
      {
        path: "docs/guide.md",
        change: "deleted",
        oldHash: "g1",
        newHash: null,
      },
      { path: "src/a.ts", change: "modified", oldHash: "a1", newHash: "a2" },
      { path: "src/b.ts", change: "deleted", oldHash: "b1", newHash: null },
      { path: "src/c.ts", change: "added", oldHash: null, newHash: "c1" },
    ]);
  });

  it("treats a missing base as an empty repository", async () => {
    const { readTree } = reader();
    const changes = await diffTrees(readTree, null, "src1");
    expect(changes.map((c) => [c.path, c.change])).toEqual([
      ["a.ts", "added"],
      ["b.ts", "added"],
    ]);
  });

  it("never reads a subtree whose hash did not change", async () => {
    const { readTree, read } = reader();
    const changes = await diffTrees(readTree, "base", "readmeOnly");
    expect(changes.map((c) => c.path)).toEqual(["README.md"]);
    expect(read.sort()).toEqual(["base", "readmeOnly"]);
  });
});

describe("countLines", () => {
  it.each([
    ["", 0],
    ["one", 1],
    ["one\n", 1],
    ["one\ntwo", 2],
    ["one\ntwo\n", 2],
  ])("counts %j as %i lines", (text, lines) => {
    expect(countLines(text)).toBe(lines);
  });
});
