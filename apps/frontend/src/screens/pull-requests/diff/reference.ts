import { diffLines, splitLines } from "@lib/diff";
import type { DiffLine, Range, Span } from "./model";
import { changedSpans } from "../../../logic/syntax";

// How a copied line compares with the reference line beside it.
export type Match = "same" | "rename" | "changed" | "new";

export interface ReferenceLine {
  // 1-based, in the reference file.
  line: number;
  text: string;
}

// A line of the change copied from the reference: the reference line it
// matches, if any, and the characters that differ from it.
export interface CopiedLine {
  match: Match;
  reference: ReferenceLine | null;
  spans: [number, number][];
}

export interface ReferenceStats {
  same: number;
  rename: number;
  changed: number;
  new: number;
  leftOut: number;
}

export interface ReferenceCompare {
  // By index into the file's diff lines.
  copied: Map<number, CopiedLine>;
  // Reference lines the copy left out, shown before the diff line they
  // precede, or after the last copied line.
  leftOut: Map<number, ReferenceLine[]>;
  trailing: { after: number; lines: ReferenceLine[] } | null;
  stats: ReferenceStats;
}

// The added lines of a range against the reference they were copied from.
// Only lines the change adds outright are compared; a line that replaces an
// old one is read against the line it replaces.
export function compareWithReference(
  lines: DiffLine[],
  slice: Span,
  partners: (number | null)[],
  referenceText: string,
  reference: Range,
): ReferenceCompare {
  const indexes: number[] = [];
  for (let i = slice.from; i < slice.to; i++) {
    if (lines[i]!.kind === "added" && partners[i] === null) {
      indexes.push(i);
    }
  }
  const refLines = splitLines(referenceText).slice(
    reference.start - 1,
    reference.end,
  );
  const join = (texts: string[]) => texts.map((t) => `${t}\n`).join("");
  const compared = diffLines(
    join(refLines),
    join(indexes.map((i) => lines[i]!.text)),
  );
  const result: ReferenceCompare = {
    copied: new Map(),
    leftOut: new Map(),
    trailing: null,
    stats: { same: 0, rename: 0, changed: 0, new: 0, leftOut: 0 },
  };
  let pending: ReferenceLine[] = [];
  const emit = (ref: ReferenceLine | null, index: number | null) => {
    if (index === null) {
      pending.push(ref!);
      result.stats.leftOut++;
      return;
    }
    if (pending.length > 0) {
      result.leftOut.set(index, pending);
      pending = [];
    }
    const line = matchOf(ref, lines[index]!.text);
    result.copied.set(index, line);
    result.stats[line.match]++;
  };
  let refs: ReferenceLine[] = [];
  let copies: number[] = [];
  const flush = () => {
    for (const [ref, copy] of align(refs, copies, (i) => lines[i]!.text)) {
      emit(ref, copy);
    }
    refs = [];
    copies = [];
  };
  for (const line of compared) {
    if (line.kind !== "added") {
      const ref = { line: line.old + reference.start - 1, text: line.text };
      if (line.kind === "same") {
        flush();
        emit(ref, indexes[line.new - 1]!);
      } else {
        refs.push(ref);
      }
    } else {
      copies.push(indexes[line.new - 1]!);
    }
  }
  flush();
  if (pending.length > 0 && indexes.length > 0) {
    result.trailing = { after: indexes[indexes.length - 1]!, lines: pending };
  }
  return result;
}

// Pairs the reference lines and copied lines of one edited run, in order,
// so they sit beside the lines they most resemble; the rest are left out of
// the copy or new in it.
function align(
  refs: ReferenceLine[],
  copies: number[],
  textOf: (index: number) => string,
): [ReferenceLine | null, number | null][] {
  const score = refs.map((ref) =>
    copies.map((copy) => resemblance(ref.text, textOf(copy))),
  );
  // best[r][c]: the most resemblance among refs from r and copies from c.
  const best = Array.from({ length: refs.length + 1 }, () =>
    new Array<number>(copies.length + 1).fill(0),
  );
  const paired = (r: number, c: number) =>
    score[r]![c]! > 0 ? best[r + 1]![c + 1]! + score[r]![c]! : 0;
  for (let r = refs.length - 1; r >= 0; r--) {
    for (let c = copies.length - 1; c >= 0; c--) {
      best[r]![c] = Math.max(best[r + 1]![c]!, best[r]![c + 1]!, paired(r, c));
    }
  }
  const pairs: [ReferenceLine | null, number | null][] = [];
  let r = 0;
  let c = 0;
  while (r < refs.length || c < copies.length) {
    if (
      r < refs.length &&
      c < copies.length &&
      score[r]![c]! > 0 &&
      best[r]![c] === paired(r, c)
    ) {
      pairs.push([refs[r++]!, copies[c++]!]);
    } else if (
      r < refs.length &&
      (c === copies.length || best[r]![c] === best[r + 1]![c])
    ) {
      pairs.push([refs[r++]!, null]);
    } else {
      pairs.push([null, copies[c++]!]);
    }
  }
  return pairs;
}

// How alike two lines read, from just over 0.5 (more than half their
// tokens shared, in order) to 1; 0 when they are less alike than that.
function resemblance(reference: string, copy: string): number {
  const a = tokens(reference);
  const b = tokens(copy);
  if (a.length + b.length === 0) {
    return 1;
  }
  const shared = (2 * commonLength(a, b)) / (a.length + b.length);
  return renameSpans(reference, copy) ? 1 : shared > 0.5 ? shared : 0;
}

// Words, whole string literals and single punctuation marks.
const tokens = (text: string) =>
  text.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\w+|\S/g) ??
  [];

// The longest common subsequence's length.
function commonLength(a: string[], b: string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    const next = new Array<number>(b.length + 1).fill(0);
    for (let j = b.length - 1; j >= 0; j--) {
      next[j] =
        a[i] === b[j] ? row[j + 1]! + 1 : Math.max(row[j]!, next[j + 1]!);
    }
    row = next;
  }
  return row[0]!;
}

function matchOf(reference: ReferenceLine | null, text: string): CopiedLine {
  if (!reference) {
    return { match: "new", reference, spans: [] };
  }
  if (reference.text === text) {
    return { match: "same", reference, spans: [] };
  }
  const renamed = renameSpans(reference.text, text);
  if (renamed) {
    return { match: "rename", reference, spans: renamed };
  }
  const changed = changedSpans(reference.text, text);
  return {
    match: "changed",
    reference,
    spans: [changed ? changed.after : [0, text.length]],
  };
}

const WORDS = /([A-Za-z0-9_$]+)/;

// The names that differ, when two lines differ in nothing else.
export function renameSpans(
  before: string,
  after: string,
): [number, number][] | null {
  const a = before.split(WORDS);
  const b = after.split(WORDS);
  if (a.length !== b.length) {
    return null;
  }
  const spans: [number, number][] = [];
  let at = 0;
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) {
      // Odd parts are the words the split captured.
      if (
        i % 2 === 0 ||
        !/^[A-Za-z_$]/.test(a[i]!) ||
        !/^[A-Za-z_$]/.test(b[i]!)
      ) {
        return null;
      }
      spans.push([at, at + b[i]!.length]);
    }
    at += b[i]!.length;
  }
  return spans.length > 0 ? spans : null;
}

// "15 same · 3 renamed only · 9 changed · 2 new · 1 left out"
export function statsText(stats: ReferenceStats): string {
  return [
    `${stats.same} same`,
    stats.rename && `${stats.rename} renamed only`,
    stats.changed && `${stats.changed} changed`,
    stats.new && `${stats.new} new`,
    stats.leftOut && `${stats.leftOut} left out`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const MATCH_TITLES: Record<Match, string> = {
  same: "same as the reference",
  rename: "differs from the reference only by name",
  changed: "differs from the reference",
  new: "not in the reference",
};
