import { splitRows, type DiffLine } from "./lines";

// One change a reviewer accepts: an added or a removed line, or a removed line
// and the added line that replaced it, which count once.
export interface Change {
  // Stable across revisions: it comes from the change's text and the unchanged
  // line above it, never from line numbers.
  key: string;
  // Indexes into the file's diff lines.
  lines: number[];
  // The line a bracket range finds the change by: its added line, or for a
  // removal the new line that follows it (the last one when it ends the
  // file). A file left with no lines counts its old lines instead.
  at: number;
}

// The key of the one change of a file that has no lines to show.
export const WHOLE_FILE = "file";

export function changesOf(lines: DiffLine[]): Change[] {
  const owners = newLineOwners(lines);
  const seen = new Map<string, number>();
  const changes: Change[] = [];
  let above = "";
  for (const { left, right } of splitRows(lines)) {
    if (left !== null && left === right) {
      above = lines[left]!.text;
      continue;
    }
    const base = hash(
      [
        left === null ? "" : `-${lines[left]!.text}`,
        right === null ? "" : `+${lines[right]!.text}`,
        above,
      ].join("\n"),
    );
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    const indexes = [left, right].filter((i): i is number => i !== null);
    changes.push({
      key: repeat ? `${base}.${repeat}` : base,
      lines: indexes,
      at: owners[right ?? left!]!,
    });
  }
  return changes;
}

// For each diff line, the line number ranges are counted in: an unchanged or
// added line's own new number, a removed line's next new line.
function newLineOwners(lines: DiffLine[]): number[] {
  let owner = 0;
  for (const line of lines) {
    if (line.kind !== "removed") {
      owner = line.new;
    }
  }
  if (owner === 0) {
    return lines.map((line) => (line.kind === "removed" ? line.old : 0));
  }
  const owners: number[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line.kind !== "removed") {
      owner = line.new;
    }
    owners[i] = owner;
  }
  return owners;
}

// cyrb53: a fast 53-bit string hash, short enough to store one per change.
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
