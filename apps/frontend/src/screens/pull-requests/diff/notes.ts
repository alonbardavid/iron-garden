import { rangeSlice, type DiffLine, type Range, type Span } from "./model";

// A comment thread pinned to lines of a file.
export interface Pinned extends Range {
  id: string;
}

// Threads whose lines overlap, shown together: a mark on the first
// row and one card under the last.
export interface Cluster extends Span, Range {
  // The first item's id, stable while the cluster grows.
  key: string;
  ids: string[];
}

// The line each diff row belongs to, the way ranges count lines: the new
// file's (a removed line belongs to the new line after it, or to the last
// one when it ends the file), or the old file's for a deleted file.
export function lineNumbers(lines: DiffLine[], deleted: boolean): number[] {
  if (deleted) {
    return lines.map((line) => (line.kind === "added" ? 0 : line.old));
  }
  const result = lines.map(() => 0);
  let owner = 0;
  for (const line of lines) {
    if (line.kind !== "removed") {
      owner = line.new;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line.kind !== "removed") {
      owner = line.new;
    }
    result[i] = owner;
  }
  return result;
}

// Items grouped by overlapping lines, in file order; items whose lines are
// not in the diff are left out.
export function clustersOf(
  items: Pinned[],
  lines: DiffLine[],
  deleted: boolean,
): Cluster[] {
  const placed = items
    .map((item) => ({ item, slice: rangeSlice(lines, item, deleted) }))
    .filter(({ slice }) => slice.to > slice.from)
    .sort((a, b) => a.slice.from - b.slice.from || b.slice.to - a.slice.to);
  const clusters: Cluster[] = [];
  for (const { item, slice } of placed) {
    const last = clusters[clusters.length - 1];
    if (last && slice.from < last.to) {
      last.to = Math.max(last.to, slice.to);
      last.start = Math.min(last.start, item.start);
      last.end = Math.max(last.end, item.end);
      last.ids.push(item.id);
    } else {
      clusters.push({
        key: item.id,
        ids: [item.id],
        from: slice.from,
        to: slice.to,
        start: item.start,
        end: item.end,
      });
    }
  }
  return clusters;
}

// "line 4" or "lines 4–9".
export function linesText(range: Range): string {
  return range.start === range.end
    ? `line ${range.start}`
    : `lines ${range.start}–${range.end}`;
}
