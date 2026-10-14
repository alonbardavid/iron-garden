import { withQuery } from "../../../logic/url";

// Where a path in a repository's code is shown, at ref (a branch or commit;
// the default branch when left out). Its root when path is empty.
export function codePath(
  repository: string,
  path: string,
  ref?: string,
): string {
  return withQuery(`/r/${repository}`, { ref, path });
}

// Where ref's history is listed.
export function historyPath(
  repository: string,
  ref?: string,
  page?: number,
): string {
  return withQuery(`/r/${repository}/commits`, {
    ref,
    page: page ? String(page + 1) : null,
  });
}

// Where a commit's changes are shown, with `file` open.
export function commitPath(
  repository: string,
  hash: string,
  file?: string,
): string {
  return withQuery(`/r/${repository}/commits/${hash}`, { file });
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function parentOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

// "src/app/main.ts" without stray slashes.
export function normalizePath(path: string): string {
  return path.split("/").filter(Boolean).join("/");
}

// Each folder above path and path itself: "a", "a/b", "a/b/c.ts".
export function pathPrefixes(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

// The repository path a link in a file in folder `from` leads to, or null
// for a link out of the repository or to a place in the same page. A link
// starting with / is from the repository's root.
export function resolvePath(from: string, href: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) {
    return null;
  }
  const target = href.replace(/[?#].*$/, "");
  const segments = target.startsWith("/") ? [] : from.split("/");
  for (const segment of target.split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment && segment !== ".") {
      segments.push(segment);
    }
  }
  return segments.filter(Boolean).join("/");
}

// A full commit hash, as opposed to a branch name.
export const isCommitHash = (ref: string) => /^[0-9a-f]{40}$/.test(ref);
