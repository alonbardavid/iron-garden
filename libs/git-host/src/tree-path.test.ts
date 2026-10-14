import { describe, expect, it } from "vitest";
import { readPath, walkFiles } from "./tree-path";
import type { TreeEntry } from "./tree-diff";

const trees: Record<string, TreeEntry[]> = {
  root: [
    { name: "src", hash: "src1", type: "tree" },
    { name: "README.md", hash: "r1", type: "blob" },
    { name: "vendor", hash: "v1", type: "gitlink" },
    { name: "bin", hash: "bin1", type: "tree" },
    { name: "link", hash: "l1", type: "symlink" },
  ],
  src1: [{ name: "a.ts", hash: "a1", type: "blob" }],
  bin1: [{ name: "run", hash: "x1", type: "exec" }],
};

function reader() {
  const read: string[] = [];
  return {
    read,
    readTree: async (hash: string) => {
      read.push(hash);
      return trees[hash]!;
    },
  };
}

describe("readPath", () => {
  it("lists the root, directories first", async () => {
    const { readTree } = reader();
    expect(await readPath(readTree, "root", "")).toEqual({
      kind: "directory",
      entries: [
        { name: "bin", type: "directory" },
        { name: "src", type: "directory" },
        { name: "README.md", type: "file" },
        { name: "link", type: "symlink" },
        { name: "vendor", type: "submodule" },
      ],
    });
  });

  it("finds a nested file, reading only the trees on its path", async () => {
    const { read, readTree } = reader();
    expect(await readPath(readTree, "root", "src/a.ts")).toEqual({
      kind: "file",
      hash: "a1",
    });
    expect(read).toEqual(["root", "src1"]);
  });

  it("treats an executable as a file and ignores stray slashes", async () => {
    const { readTree } = reader();
    expect(await readPath(readTree, "root", "/bin//run/")).toEqual({
      kind: "file",
      hash: "x1",
    });
  });

  it("finds nothing for a missing path, a path through a file or a submodule", async () => {
    const { readTree } = reader();
    expect(await readPath(readTree, "root", "src/b.ts")).toBeNull();
    expect(await readPath(readTree, "root", "README.md/x")).toBeNull();
    expect(await readPath(readTree, "root", "vendor")).toBeNull();
  });
});

describe("walkFiles", () => {
  it("lists every file under the root, leaving out submodules", async () => {
    const { readTree } = reader();
    expect(
      await walkFiles(readTree, "root", { maxTrees: 10, concurrency: 2 }),
    ).toEqual({
      paths: ["README.md", "bin/run", "link", "src/a.ts"],
      truncated: false,
    });
  });

  it("stops after reading as many trees as it may", async () => {
    const { read, readTree } = reader();
    expect(
      await walkFiles(readTree, "root", { maxTrees: 2, concurrency: 8 }),
    ).toEqual({ paths: ["README.md", "link", "src/a.ts"], truncated: true });
    expect(read).toEqual(["root", "src1"]);
  });
});
