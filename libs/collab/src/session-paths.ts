// The most paths one activity report may name.
export const MAX_REPORTED_PATHS = 200;

const MAX_PATH_LENGTH = 1000;

// The distinct paths of a report, and the ones that are not repository paths.
export function normalizeSessionPaths(paths: string[]): {
  paths: string[];
  refused: string[];
} {
  const kept = new Set<string>();
  const refused: string[] = [];
  for (const path of paths) {
    const normalized = normalizeSessionPath(path);
    if (normalized) {
      kept.add(normalized);
    } else {
      refused.push(path);
    }
  }
  return { paths: [...kept], refused };
}

// A repository path as an agent may write it ("./src/a.ts", "/src//a.ts"),
// as the repository names it ("src/a.ts"); null when it is no path in the
// repository at all.
export function normalizeSessionPath(path: string): string | null {
  const segments = path.trim().split("/").filter(Boolean);
  const kept = segments[0] === "." ? segments.slice(1) : segments;
  if (
    kept.length === 0 ||
    kept.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  const normalized = kept.join("/");
  return normalized.length > MAX_PATH_LENGTH ? null : normalized;
}
