import { diffLines, type DiffLine } from "@lib/diff";
import type { FileChange } from "@lib/db-models";
import type { FileVersion } from "@lib/git-host";

export interface ChangedFileContents {
  path: string;
  change: FileChange;
  before: FileVersion | null;
  after: FileVersion | null;
}

// Unchanged lines shown on each side of a change.
const CONTEXT_LINES = 3;

/**
 * The diff of every changed file as the server's model reads it: both line
 * numbers on every line, so it can name ranges in either version. Files past
 * `maxChars` are listed but not shown, so one huge change cannot crowd out
 * the rest of the prompt.
 */
export function renderChanges(
  files: ChangedFileContents[],
  maxChars: number,
): string {
  const shown: string[] = [];
  const left: string[] = [];
  let used = 0;
  for (const file of files) {
    const text = renderFile(file);
    if (used + text.length > maxChars) {
      left.push(file.path);
    } else {
      shown.push(text);
      used += text.length;
    }
  }
  return left.length === 0
    ? shown.join("\n\n")
    : [
        ...shown,
        `### Not shown, too large for one prompt\n${left.map((path) => `- ${path}`).join("\n")}`,
      ].join("\n\n");
}

function renderFile(file: ChangedFileContents): string {
  const heading = `### ${file.path} (${file.change})`;
  const before = textOf(file.before);
  const after = textOf(file.after);
  if (before === null || after === null) {
    return `${heading}\n(binary or too large to show)`;
  }
  return `${heading}\n${hunks(diffLines(before, after)).join("\n")}`;
}

// The text of a side, "" for a side the file lacks, null when not text.
function textOf(version: FileVersion | null): string | null {
  if (!version) {
    return "";
  }
  return version.kind === "text" ? version.text : null;
}

// Every changed line with CONTEXT_LINES unchanged lines around it; "..."
// marks the unchanged lines left out between.
function hunks(lines: DiffLine[]): string[] {
  const near = new Set<number>();
  lines.forEach((line, i) => {
    if (line.kind !== "same") {
      for (let j = i - CONTEXT_LINES; j <= i + CONTEXT_LINES; j++) {
        near.add(j);
      }
    }
  });
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!near.has(i)) {
      return;
    }
    if (i > 0 && !near.has(i - 1) && out.length > 0) {
      out.push("...");
    }
    out.push(numbered(line));
  });
  return out;
}

function numbered(line: DiffLine): string {
  const old = line.kind === "added" ? "" : String(line.old);
  const next = line.kind === "removed" ? "" : String(line.new);
  const marker =
    line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
  return `${old.padStart(5)} ${next.padStart(5)} ${marker} ${line.text}`;
}
