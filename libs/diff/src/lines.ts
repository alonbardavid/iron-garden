import { diffLines as diffChanges } from "diff";

export type DiffLine =
  | { kind: "same"; text: string; old: number; new: number }
  | { kind: "removed"; text: string; old: number }
  | { kind: "added"; text: string; new: number };

// Past this many edits a pair of files counts as wholly replaced. The bound is
// on edits, not time, so the server and every browser get the same diff, and
// with it the same changes to accept.
const MAX_EDIT_LENGTH = 1000;

export function splitLines(text: string): string[] {
  if (text === "") {
    return [];
  }
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const replaced = [
    { value: before, added: false, removed: true },
    { value: after, added: true, removed: false },
  ];
  const changes =
    before === "" || after === ""
      ? replaced
      : (diffChanges(before, after, { maxEditLength: MAX_EDIT_LENGTH }) ??
        replaced);
  const lines: DiffLine[] = [];
  let old = 1;
  let next = 1;
  for (const change of changes) {
    for (const text of splitLines(change.value)) {
      if (change.added) {
        lines.push({ kind: "added", text, new: next++ });
      } else if (change.removed) {
        lines.push({ kind: "removed", text, old: old++ });
      } else {
        lines.push({ kind: "same", text, old: old++, new: next++ });
      }
    }
  }
  return lines;
}

export interface SplitRow {
  left: number | null;
  right: number | null;
}

// Side-by-side rows as indexes into the lines: an unchanged line on both
// sides, and each run of removed lines paired with the added lines after it.
export function splitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let removed: number[] = [];
  let added: number[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++) {
      rows.push({ left: removed[i] ?? null, right: added[i] ?? null });
    }
    removed = [];
    added = [];
  };
  lines.forEach((line, i) => {
    if (line.kind === "same") {
      flush();
      rows.push({ left: i, right: i });
    } else if (line.kind === "removed") {
      if (added.length > 0) {
        flush();
      }
      removed.push(i);
    } else {
      added.push(i);
    }
  });
  flush();
  return rows;
}
