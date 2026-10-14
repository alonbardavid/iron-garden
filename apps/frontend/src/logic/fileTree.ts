export interface FileTree {
  folders: FileFolder[];
  files: { path: string; name: string }[];
}

export interface FileFolder extends FileTree {
  // Relative to the parent folder; a run of folders that change no file
  // directly reads as one ("apps/backend/src").
  name: string;
  path: string;
}

interface Node {
  folders: Map<string, Node>;
  files: string[];
}

// Paths as a folder tree, folders before files, each sorted by name.
export function fileTree(paths: string[]): FileTree {
  const root: Node = { folders: new Map(), files: [] };
  for (const path of paths) {
    const dirs = path.split("/").slice(0, -1);
    let node = root;
    for (const dir of dirs) {
      let child = node.folders.get(dir);
      if (!child) {
        child = { folders: new Map(), files: [] };
        node.folders.set(dir, child);
      }
      node = child;
    }
    node.files.push(path);
  }
  return toTree(root, "");
}

function toTree(node: Node, prefix: string): FileTree {
  return {
    folders: [...node.folders]
      .sort(([a], [b]) => compare(a, b))
      .map(([dir, child]) => {
        let name = dir;
        let only = child;
        while (only.files.length === 0 && only.folders.size === 1) {
          const [[next, grandchild]] = only.folders;
          name += `/${next}`;
          only = grandchild;
        }
        const path = prefix + name;
        return { name, path, ...toTree(only, `${path}/`) };
      }),
    files: node.files
      .map((path) => ({ path, name: path.slice(prefix.length) }))
      .sort((a, b) => compare(a.name, b.name)),
  };
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The tree's files in the order it lists them.
export function treeFiles(tree: FileTree): string[] {
  return [
    ...tree.folders.flatMap(treeFiles),
    ...tree.files.map((file) => file.path),
  ];
}
