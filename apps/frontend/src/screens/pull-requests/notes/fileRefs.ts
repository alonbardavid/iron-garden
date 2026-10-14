import { resolvePath } from "../../repository/code/paths";

// The repository file a reference names, and whether the pull request
// changed it.
export interface FileRef {
  path: string;
  changed: boolean;
}

// A line or a range after a path: ":12", ":12-20", ":12:5", "#L4-L9".
const LOCATION = /(?::\d+(?:[-:]\d+)*|#L\d+(?:-L?\d+)?)$/;

// A path with a folder that ends in a file name with an extension.
const FILE_PATH = /^(?:[\w.@+-]+\/)+[\w@+-][\w.@+-]*\.\w+$/;

// The file a reference such as "src/a.ts", "./src/a.ts:12" or
// "src/a.ts#L4-L9" names: a file the pull request changed, which an
// absolute path may also end in, or another file in the repository. Null
// for a URL, a command or anything else.
export function fileRefOf(
  text: string,
  changed: ReadonlySet<string>,
): FileRef | null {
  const ref = text.trim().replace(LOCATION, "");
  if (!ref || /\s/.test(ref)) {
    return null;
  }
  const path = resolvePath("", ref);
  if (!path) {
    return null;
  }
  if (changed.has(path)) {
    return { path, changed: true };
  }
  if (ref.startsWith("/")) {
    const end = [...changed].find((p) => path.endsWith(`/${p}`));
    return end ? { path: end, changed: true } : null;
  }
  return FILE_PATH.test(path) ? { path, changed: false } : null;
}

// What finds the changed files text names, with any folders before them
// and a line after them, or null when nothing changed.
export function changedPathPattern(
  changed: ReadonlySet<string>,
): RegExp | null {
  if (changed.size === 0) {
    return null;
  }
  const paths = [...changed]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(
    `(?<![\\w./@+-])(?:\\.?(?:/[\\w.@+-]+)*/)?(?:${paths.join("|")})` +
      `(?::\\d+(?:-\\d+)?|#L\\d+(?:-L?\\d+)?)?(?![\\w/@+-]|\\.\\w)`,
    "g",
  );
}

export type TextPiece = string | { text: string; path: string };

// Text split into plain runs and the changed files it names.
export function splitChangedPaths(
  text: string,
  pattern: RegExp | null,
  changed: ReadonlySet<string>,
): TextPiece[] {
  if (!pattern) {
    return [text];
  }
  const pieces: TextPiece[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const ref = fileRefOf(match[0], changed);
    if (!ref) {
      continue;
    }
    if (match.index > at) {
      pieces.push(text.slice(at, match.index));
    }
    pieces.push({ text: match[0], path: ref.path });
    at = match.index + match[0].length;
  }
  if (at < text.length) {
    pieces.push(text.slice(at));
  }
  return pieces;
}
