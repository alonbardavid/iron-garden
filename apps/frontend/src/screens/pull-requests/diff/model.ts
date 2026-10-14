import type { PathFile } from "@lib/contract";
import { splitRows, type Change, type DiffLine } from "@lib/diff";
import { formatBytes } from "../../../logic/bytes";

export type { Change, DiffLine };

// [from, to) over a file's diff lines.
export interface Span {
  from: number;
  to: number;
}

export interface Range {
  start: number;
  end: number;
}

// Unchanged lines kept around each change, and how many more one click on a
// gap reveals.
export const CONTEXT_LINES = 3;
export const EXPAND_STEP = 20;

// The text of each side, or why it cannot be shown.
export function textOf(
  version: PathFile | null,
): { text: string } | { reason: string } {
  if (!version) {
    return { text: "" };
  }
  if (version.kind === "binary" || version.kind === "image") {
    return { reason: "Binary file. Its diff is not shown." };
  }
  if (version.kind === "too-large") {
    return {
      reason: `Too large to show (${formatBytes(version.bytes)}).`,
    };
  }
  return { text: version.text };
}

export function counts(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "added") {
      added++;
    } else if (line.kind === "removed") {
      removed++;
    }
  }
  return { added, removed };
}

// Every change and CONTEXT_LINES unchanged lines on either side of it.
export function initiallyShown(lines: DiffLine[]): boolean[] {
  const shown = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.kind === "same") {
      return;
    }
    const from = Math.max(0, i - CONTEXT_LINES);
    const to = Math.min(lines.length, i + CONTEXT_LINES + 1);
    shown.fill(true, from, to);
  });
  return shown;
}

export type Segment = Span & { kind: "lines" | "fold" };

// Runs of shown lines and of folded ones, in order.
export function segments(shown: boolean[]): Segment[] {
  const result: Segment[] = [];
  shown.forEach((visible, i) => {
    const kind = visible ? "lines" : "fold";
    const last = result[result.length - 1];
    if (last?.kind === kind) {
      last.to = i + 1;
    } else {
      result.push({ kind, from: i, to: i + 1 });
    }
  });
  return result;
}

// A file's chunks: its changes with the unchanged lines around them.
export function chunksOf(lines: DiffLine[]): Span[] {
  return segments(initiallyShown(lines))
    .filter((s) => s.kind === "lines")
    .map(({ from, to }) => ({ from, to }));
}

// How many lines of a gap are open from its top and from its bottom.
export interface Reveal {
  top: number;
  bottom: number;
}

// The unchanged lines before chunk `index`; index chunks.length is the gap
// below the last chunk.
export interface Gap extends Span {
  index: number;
  top: number;
  bottom: number;
  hidden: number;
  place: "above" | "between" | "below";
}

export interface ChunkView {
  chunk: Span;
  gapAbove: Gap | null;
  before: Span;
  after: Span;
  gapBelow: Gap | null;
}

// Each chunk with what is open of the gaps around it: the bottom of the gap
// above sits over the chunk, the top of the gap below under it. The gap
// above the first chunk opens upwards only, the one below the last
// downwards only, and an open gap between two chunks belongs to the first.
export function chunkViews(
  chunks: Span[],
  length: number,
  reveals: Reveal[],
): ChunkView[] {
  const n = chunks.length;
  const gap = (index: number): Gap => {
    const from = index === 0 ? 0 : chunks[index - 1]!.to;
    const to = index === n ? length : chunks[index]!.from;
    const total = to - from;
    const reveal = reveals[index] ?? { top: 0, bottom: 0 };
    let top = index === 0 ? 0 : Math.min(reveal.top, total);
    let bottom = index === n ? 0 : Math.min(reveal.bottom, total - top);
    if (index > 0 && top + bottom === total) {
      top = total;
      bottom = 0;
    }
    const place = index === 0 ? "above" : index === n ? "below" : "between";
    return {
      index,
      from,
      to,
      top,
      bottom,
      hidden: total - top - bottom,
      place,
    };
  };
  return chunks.map((chunk, c) => {
    const above = gap(c);
    const below = gap(c + 1);
    return {
      chunk,
      gapAbove: above.hidden > 0 ? above : null,
      before: { from: above.to - above.bottom, to: above.to },
      after: { from: below.from, to: below.from + below.top },
      gapBelow: c === n - 1 && below.hidden > 0 ? below : null,
    };
  });
}

// How to open a gap: EXPAND_STEP more lines from its top ("down") or its
// bottom ("up"), all of it, or from its bottom up to a line.
export type Opening = "down" | "up" | "all" | { upTo: number };

export function reveal(reveals: Reveal[], gap: Gap, how: Opening): Reveal[] {
  const next = [...reveals];
  const step = Math.min(EXPAND_STEP, gap.hidden);
  const total = gap.to - gap.from;
  next[gap.index] =
    how === "down"
      ? { top: gap.top + step, bottom: gap.bottom }
      : how === "up"
        ? { top: gap.top, bottom: gap.bottom + step }
        : how === "all"
          ? gap.place === "above"
            ? { top: 0, bottom: total }
            : { top: total, bottom: 0 }
          : {
              top: gap.top,
              bottom: Math.max(
                gap.bottom,
                gap.to - Math.max(how.upTo, gap.from),
              ),
            };
  return next;
}

// "Lines n–m" of the new file, or the old file's for a chunk that only
// removes.
export function chunkLabel(lines: DiffLine[]): string {
  const added = lines.flatMap((line) =>
    line.kind === "removed" ? [] : [line.new],
  );
  if (added.length > 0) {
    return span("Line", "Lines", added);
  }
  return span(
    "Removed line",
    "Removed lines",
    lines.flatMap((line) => (line.kind === "added" ? [] : [line.old])),
  );
}

function span(one: string, many: string, numbers: number[]): string {
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  if (first === undefined || last === undefined) {
    return "";
  }
  return first === last ? `${one} ${first}` : `${many} ${first}–${last}`;
}

// The slice of a file's lines a bracket range covers. Ranges count new-file
// lines (old ones for a deleted file); removed lines belong to the new line
// that follows them, and to the last line when they end the file.
export function rangeSlice(
  lines: DiffLine[],
  range: Range,
  deletedFile: boolean,
): Span {
  const inRange = (n: number) => n >= range.start && n <= range.end;
  const covered = lines.map(() => false);
  // The new line the lines from i on belong to, read from the end.
  let owner = 0;
  for (const line of lines) {
    if (line.kind !== "removed") {
      owner = line.new;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (deletedFile) {
      covered[i] = line.kind !== "added" && inRange(line.old);
      continue;
    }
    if (line.kind !== "removed") {
      owner = line.new;
    }
    covered[i] = inRange(owner);
  }
  const from = covered.indexOf(true);
  return from === -1
    ? { from: 0, to: 0 }
    : { from, to: covered.lastIndexOf(true) + 1 };
}

// The line each removed or added line replaces or is replaced by, if any.
export function partners(lines: DiffLine[]): (number | null)[] {
  const result: (number | null)[] = lines.map(() => null);
  for (const { left, right } of splitRows(lines)) {
    if (left !== null && right !== null && left !== right) {
      result[left] = right;
      result[right] = left;
    }
  }
  return result;
}

// The changes whose lines fall in a span, in order and each once.
export function changesIn(owner: (Change | null)[], span: Span): Change[] {
  return [...new Set(owner.slice(span.from, span.to))].filter(
    (change): change is Change => change !== null,
  );
}

// A run of changed rows with more than one change, accepted together from a
// box on its first row.
export interface Block {
  head: boolean;
  changes: Change[];
}

// Each row's block, given each row's change: null outside a block.
export function blocksOf(rows: (Change | null)[]): (Block | null)[] {
  const result: (Block | null)[] = rows.map(() => null);
  let from = 0;
  while (from < rows.length) {
    let to = from;
    while (to < rows.length && rows[to]) {
      to++;
    }
    const changes = changesIn(rows, { from, to });
    if (changes.length > 1) {
      for (let i = from; i < to; i++) {
        result[i] = { head: i === from, changes };
      }
    }
    from = to + 1;
  }
  return result;
}

// Lines that open a function, method or type in the languages people write
// most: what a reader wants named when the change sits inside one.
const DECLARATION = new RegExp(
  [
    String.raw`^\s*(export\s+)?(default\s+)?(declare\s+)?(abstract\s+)?(async\s+)?(function\*?|class|interface|enum|namespace|module|def|fn|func|struct|trait|impl|object)\b`,
    String.raw`^\s*(pub(\(\w+\))?\s+)+(async\s+)?(fn|struct|enum|trait|mod)\b`,
    String.raw`^\s*(export\s+)?(const|let|var)\s+[\w$]+\s*(:[^=]+)?=\s*(async\s+)?(function\b|[(<]|[\w$]+\s*=>)`,
    String.raw`^\s*[\w$]+\s*:\s*(async\s+)?(function\b|\(.*=>|[\w$]+\s*=>)`,
    String.raw`^\s*(describe|it|test)(\.\w+)?\(`,
    String.raw`^\s*((public|private|protected|static|async|override|readonly|get|set)\s+)*[\w$]+\s*(<[^>]*>)?\s*\([^;]*\)\s*(:[^{;]+)?\{\s*$`,
  ].join("|"),
);
const NOT_A_DECLARATION = /^\s*(if|for|while|switch|catch|with|return|else)\b/;

const indentOf = (text: string) => text.length - text.trimStart().length;

// The declaration that encloses line `at`, if it starts above `before`: the
// nearest line above that both starts a function or type and is indented
// less than everything between. A signature split over lines is read from
// its first line. Read on the new side, or the old one for a deleted file.
export interface Scope {
  line: number;
  text: string;
}

export function scopeOf(
  lines: DiffLine[],
  at: number,
  before: number,
): Scope | null {
  const skip = lines.some((l) => l.kind !== "removed") ? "removed" : "added";
  const anchor = lines
    .slice(at)
    .find((l) => l.kind !== skip && l.text.trim() !== "");
  if (!anchor) {
    return null;
  }
  let indent = indentOf(anchor.text);
  for (let i = at - 1; i >= 0 && indent > 0; i--) {
    const { kind, text } = lines[i]!;
    if (kind === skip || text.trim() === "" || indentOf(text) >= indent) {
      continue;
    }
    if (/^\s*[)\]}]/.test(text)) {
      // The end of a multi-line signature: its first line is the one at
      // this indent that does not close anything.
      indent = indentOf(text) + 1;
      continue;
    }
    indent = indentOf(text);
    if (DECLARATION.test(text) && !NOT_A_DECLARATION.test(text)) {
      return i < before ? { line: i, text: text.trim() } : null;
    }
  }
  return null;
}
