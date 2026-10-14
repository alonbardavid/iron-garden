export const GROUP_KINDS = [
  "flow",
  "refactor",
  "rename",
  "move",
  "copy",
  "schema",
  "generated",
  "config",
  "tests",
  "docs",
  "other",
] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const MAX_GROUPS = 100;

export interface LineRange {
  path: string;
  start: number;
  end: number;
}

export interface GroupRange extends LineRange {
  // What these lines do, in a sentence.
  note?: string;
  // Where moved lines came from, in the old version of that file.
  movedFrom?: LineRange;
  // Existing code these lines were copied from or follow as an example, on
  // the target branch (the base commit). Any file can be one.
  reference?: LineRange;
}

export interface GroupInput {
  title: string;
  kind: GroupKind;
  description?: string | null;
  ranges: GroupRange[];
}

export interface FileExtent {
  path: string;
  change: "added" | "modified" | "deleted";
  oldLines: number;
  newLines: number;
}

// The files the groups name as references, each once.
export function referencePaths(groups: GroupInput[]): string[] {
  return [
    ...new Set(
      groups.flatMap((g) => g.ranges.flatMap((r) => r.reference?.path ?? [])),
    ),
  ];
}

// Every problem with a set of groups, phrased for the agent that sent them so
// it can fix them in one go. Ranges count lines of the new file, or of the old
// one for a deleted file. `references` has the line count of each reference
// path on the target branch, null when it is not a text file there.
export function groupProblems(
  groups: GroupInput[],
  files: FileExtent[],
  references: Map<string, number | null> = new Map(),
): string[] {
  if (groups.length > MAX_GROUPS) {
    return [`Send at most ${MAX_GROUPS} groups; got ${groups.length}`];
  }
  const byPath = new Map(files.map((file) => [file.path, file]));
  return groups.flatMap((group, g) =>
    group.ranges.flatMap((range, r) => {
      const where = `groups[${g}].ranges[${r}]`;
      return [
        ...rangeProblems(byPath, range, where),
        ...(range.movedFrom
          ? movedFromProblems(byPath, range.movedFrom, `${where}.movedFrom`)
          : []),
        ...(range.reference
          ? referenceProblems(references, range.reference, `${where}.reference`)
          : []),
      ];
    }),
  );
}

// Ranges count lines of the new file, or of the old one for a deleted file.
export function rangeProblems(
  byPath: Map<string, FileExtent>,
  range: LineRange,
  where: string,
): string[] {
  const file = byPath.get(range.path);
  if (!file) {
    return [`${where}: ${range.path} is not a changed file`];
  }
  const lines = file.change === "deleted" ? file.oldLines : file.newLines;
  return outside(range, lines, where);
}

// Moved lines come from a file the change took lines out of, counted in its
// old version.
function movedFromProblems(
  byPath: Map<string, FileExtent>,
  range: LineRange,
  where: string,
): string[] {
  const file = byPath.get(range.path);
  if (!file || file.change === "added") {
    return [
      `${where}: ${range.path} must be a changed file that existed before this change`,
    ];
  }
  return outside(range, file.oldLines, where, "the old version of ");
}

// A reference is read on the target branch, before this change.
function referenceProblems(
  references: Map<string, number | null>,
  range: LineRange,
  where: string,
): string[] {
  const lines = references.get(range.path);
  if (lines === undefined || lines === null) {
    return [`${where}: ${range.path} must be a text file on the target branch`];
  }
  return outside(range, lines, where, "the target branch's ");
}

function outside(
  range: LineRange,
  lines: number,
  where: string,
  version = "",
): string[] {
  if (range.start < 1 || range.end < range.start || range.end > lines) {
    return [
      `${where}: lines ${range.start}-${range.end} are outside ${version}${range.path}, which has ${lines} lines`,
    ];
  }
  return [];
}
