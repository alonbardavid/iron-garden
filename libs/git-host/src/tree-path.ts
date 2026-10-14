import type { ReadTree, TreeEntry } from "./tree-diff";

export type PathEntryType = "directory" | "file" | "symlink" | "submodule";

export interface PathEntry {
  name: string;
  type: PathEntryType;
}

// What a path names in a root tree: a directory's entries, or the hash of
// the file to read. Null when the tree has no such path, or it is a submodule.
export type PathTarget =
  | { kind: "directory"; entries: PathEntry[] }
  | { kind: "file"; hash: string };

// Walks one tree per path segment, so the cost follows the path's depth, not
// the repository. An empty path is the root.
export async function readPath(
  readTree: ReadTree,
  rootTree: string,
  path: string,
): Promise<PathTarget | null> {
  let entry: Pick<TreeEntry, "hash" | "type"> = {
    hash: rootTree,
    type: "tree",
  };
  for (const segment of path.split("/").filter(Boolean)) {
    if (entry.type !== "tree") {
      return null;
    }
    const child = (await readTree(entry.hash)).find((e) => e.name === segment);
    if (!child) {
      return null;
    }
    entry = child;
  }
  if (entry.type === "gitlink") {
    return null;
  }
  if (entry.type !== "tree") {
    return { kind: "file", hash: entry.hash };
  }
  const entries = (await readTree(entry.hash)).map((e) => ({
    name: e.name,
    type: entryType(e.type),
  }));
  return { kind: "directory", entries: entries.sort(directoriesFirst) };
}

function entryType(type: TreeEntry["type"]): PathEntryType {
  switch (type) {
    case "tree":
      return "directory";
    case "symlink":
      return "symlink";
    case "gitlink":
      return "submodule";
    default:
      return "file";
  }
}

function directoriesFirst(a: PathEntry, b: PathEntry): number {
  const dirA = a.type === "directory";
  const dirB = b.type === "directory";
  if (dirA !== dirB) {
    return dirA ? -1 : 1;
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

// Every file path under a root tree, sorted, reading the tree a level at a
// time with up to `concurrency` reads in flight. It stops once it has read
// `maxTrees` trees, and says so with `truncated`. Submodules are left out.
export async function walkFiles(
  readTree: ReadTree,
  rootTree: string,
  { maxTrees, concurrency }: { maxTrees: number; concurrency: number },
): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  let level = [{ hash: rootTree, prefix: "" }];
  let read = 0;
  while (level.length > 0) {
    const batch = level.slice(0, Math.max(0, maxTrees - read));
    const next: typeof level = [];
    for (let i = 0; i < batch.length; i += concurrency) {
      const trees = batch.slice(i, i + concurrency);
      const entries = await Promise.all(trees.map((t) => readTree(t.hash)));
      trees.forEach(({ prefix }, t) => {
        for (const entry of entries[t]!) {
          const path = prefix + entry.name;
          if (entry.type === "tree") {
            next.push({ hash: entry.hash, prefix: `${path}/` });
          } else if (entry.type !== "gitlink") {
            paths.push(path);
          }
        }
      });
    }
    read += batch.length;
    if (batch.length < level.length) {
      return { paths: paths.sort(), truncated: true };
    }
    level = next;
  }
  return { paths: paths.sort(), truncated: false };
}
