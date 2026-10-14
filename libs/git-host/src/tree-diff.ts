export type TreeEntryType = "tree" | "blob" | "symlink" | "gitlink" | "exec";

export interface TreeEntry {
  name: string;
  hash: string;
  type: TreeEntryType;
}

export type ReadTree = (hash: string) => Promise<TreeEntry[]>;

export interface TreeChange {
  path: string;
  change: "added" | "modified" | "deleted";
  oldHash: string | null;
  newHash: string | null;
}

// Every file whose content differs between two root trees, by path. A null
// tree is an empty one (a repository with no commits yet). Equal subtree
// hashes are skipped without being read, so the cost follows the change, not
// the repository.
export async function diffTrees(
  readTree: ReadTree,
  oldTree: string | null,
  newTree: string | null,
  prefix = "",
): Promise<TreeChange[]> {
  if (oldTree === newTree) {
    return [];
  }
  const [before, after] = await Promise.all([
    entriesOf(readTree, oldTree),
    entriesOf(readTree, newTree),
  ]);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = await Promise.all(
    names.map((name) =>
      diffEntry(
        readTree,
        `${prefix}${name}`,
        before.get(name),
        after.get(name),
      ),
    ),
  );
  return changes.flat();
}

async function diffEntry(
  readTree: ReadTree,
  path: string,
  before: TreeEntry | undefined,
  after: TreeEntry | undefined,
): Promise<TreeChange[]> {
  if (before?.hash === after?.hash && before?.type === after?.type) {
    return [];
  }
  const oldTree = before?.type === "tree" ? before.hash : null;
  const newTree = after?.type === "tree" ? after.hash : null;
  const subtree =
    oldTree || newTree
      ? await diffTrees(readTree, oldTree, newTree, `${path}/`)
      : [];
  const oldFile = before && before.type !== "tree" ? before.hash : null;
  const newFile = after && after.type !== "tree" ? after.hash : null;
  if (!oldFile && !newFile) {
    return subtree;
  }
  const file: TreeChange = {
    path,
    change: !oldFile ? "added" : !newFile ? "deleted" : "modified",
    oldHash: oldFile,
    newHash: newFile,
  };
  return [...subtree, file].sort((a, b) => a.path.localeCompare(b.path));
}

async function entriesOf(
  readTree: ReadTree,
  hash: string | null,
): Promise<Map<string, TreeEntry>> {
  if (!hash) {
    return new Map();
  }
  const entries = await readTree(hash);
  return new Map(entries.map((entry) => [entry.name, entry]));
}

export function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}
