import {
  MAX_ACCEPT_CHANGES,
  MAX_ACCEPT_FILES,
  type Review,
  type ReviewRule,
} from "@lib/contract";

// One change of the pull request, by its file and its key in that file's diff.
export interface ChangeRef {
  path: string;
  key: string;
}

// `auto` of the accepted changes a rule accepted; `high` changes are high
// impact and not accepted yet.
export interface Progress {
  total: number;
  accepted: number;
  auto?: number;
  high?: number;
}

export interface LineRange {
  path: string;
  start: number;
  end: number;
}

// A reviewer's accepted changes, looked up by file, range or change, and the
// rules that matched them.
export interface Marks {
  changes(path: string, range?: { start: number; end: number }): ChangeRef[];
  all(): ChangeRef[];
  isAccepted(change: ChangeRef): boolean;
  // Accepted by a rule rather than by you.
  isAuto(change: ChangeRef): boolean;
  // Matched by a high-impact rule.
  isHigh(change: ChangeRef): boolean;
  // The auto-accept and high-impact rules that matched a change.
  rulesOf(change: ChangeRef): ReviewRule[];
  // The rules that matched anything.
  rules: ReviewRule[];
  // The line a change is at, as ranges count lines.
  lineOf(change: ChangeRef): number | undefined;
  progress(changes: ChangeRef[]): Progress;
}

const id = ({ path, key }: ChangeRef) => `${path}\n${key}`;

export function marksOf(review: Review): Marks {
  const files = new Map(
    review.files.map((f) => [
      f.path,
      {
        changes: f.changes,
        accepted: new Set(f.accepted),
        auto: new Set(f.auto),
        at: new Map(f.changes.map((c) => [c.key, c.at])),
      },
    ]),
  );
  const rules = review.rules.filter((r) => r.files.length > 0);
  const byChange = new Map<string, ReviewRule[]>();
  for (const rule of rules) {
    if (rule.action === "require-review") {
      continue;
    }
    for (const { path, keys } of rule.files) {
      for (const key of keys) {
        const change = id({ path, key });
        byChange.set(change, [...(byChange.get(change) ?? []), rule]);
      }
    }
  }
  const isAccepted = ({ path, key }: ChangeRef) =>
    files.get(path)?.accepted.has(key) ?? false;
  const isAuto = ({ path, key }: ChangeRef) =>
    files.get(path)?.auto.has(key) ?? false;
  const rulesOf = (change: ChangeRef) => byChange.get(id(change)) ?? [];
  const isHigh = (change: ChangeRef) =>
    rulesOf(change).some((r) => r.action === "high-impact");
  return {
    changes: (path, range) =>
      (files.get(path)?.changes ?? [])
        .filter((c) => !range || (c.at >= range.start && c.at <= range.end))
        .map(({ key }) => ({ path, key })),
    all: () =>
      review.files.flatMap((f) =>
        f.changes.map(({ key }) => ({ path: f.path, key })),
      ),
    isAccepted,
    isAuto,
    isHigh,
    rulesOf,
    rules,
    lineOf: ({ path, key }) => files.get(path)?.at.get(key),
    progress: (changes) => ({
      total: changes.length,
      accepted: changes.filter(isAccepted).length,
      auto: changes.filter(isAuto).length,
      high: changes.filter((c) => isHigh(c) && !isAccepted(c)).length,
    }),
  };
}

// The changes a rule matched.
export function ruleChanges(rule: ReviewRule): ChangeRef[] {
  return rule.files.flatMap(({ path, keys }) =>
    keys.map((key) => ({ path, key })),
  );
}

// The line ranges a rule's changes sit in, file by file: each run of matched
// changes with no other change between them is one range.
export function ruleRanges(marks: Marks, rule: ReviewRule): LineRange[] {
  return rule.files.flatMap(({ path, keys }) => {
    const matched = new Set(keys);
    const ranges: LineRange[] = [];
    let open: LineRange | null = null;
    for (const change of marks.changes(path)) {
      const at = marks.lineOf(change) ?? 0;
      if (!matched.has(change.key)) {
        open = null;
      } else if (open) {
        open.end = at;
      } else {
        open = { path, start: at, end: at };
        ranges.push(open);
      }
    }
    return ranges;
  });
}

// A selection that mixes high-impact changes not accepted yet with regular
// ones: accepting all of it at once is worth a second look.
export function sweepsHighImpact(marks: Marks, changes: ChangeRef[]) {
  const pending = changes.filter((c) => !marks.isAccepted(c));
  const high = pending.filter(marks.isHigh);
  return high.length > 0 && high.length < pending.length ? high : null;
}

// The changes a set of ranges covers, each once.
export function rangesChanges(marks: Marks, ranges: LineRange[]): ChangeRef[] {
  const seen = new Set<string>();
  return ranges
    .flatMap((r) => marks.changes(r.path, r))
    .filter((c) => {
      const id = `${c.path}\n${c.key}`;
      return !seen.has(id) && seen.add(id);
    });
}

export function isDone(progress: Progress): boolean {
  return progress.accepted >= progress.total;
}

export function stateOf(progress: Progress): "done" | "partial" | "none" {
  return isDone(progress) ? "done" : progress.accepted > 0 ? "partial" : "none";
}

// How far through, as a bar's width.
export function percent(progress: Progress): number {
  return progress.total === 0
    ? 100
    : (progress.accepted / progress.total) * 100;
}

export function changesWord(n: number): string {
  return n === 1 ? "1 change" : `${n} changes`;
}

export function acceptedText({
  total,
  accepted,
  auto = 0,
  high = 0,
}: Progress): string {
  if (auto > 0 || high > 0) {
    return [
      changesWord(total),
      ...(accepted > auto ? [`${accepted - auto} accepted`] : []),
      ...(auto > 0 ? [`${auto} auto-accepted`] : []),
      ...(high > 0 ? [`${high} high impact, not accepted yet`] : []),
    ].join(" · ");
  }
  if (total === 1) {
    return accepted ? "The one change is accepted" : "1 change, not accepted";
  }
  if (accepted >= total) {
    return `All ${total} changes accepted`;
  }
  return accepted
    ? `${accepted} of ${total} changes accepted`
    : `${total} changes, none accepted`;
}

// The review as it is once these changes are accepted or undone. Undoing a
// change a rule accepted takes it from the rule too; accepting one leaves it
// to the rule.
export function withAccepted(
  review: Review,
  changes: { path: string; keys: string[] }[],
  accepted: boolean,
): Review {
  const byPath = new Map<string, string[]>();
  for (const { path, keys } of changes) {
    byPath.set(path, [...(byPath.get(path) ?? []), ...keys]);
  }
  return {
    ...review,
    files: review.files.map((file) => {
      const keys = byPath.get(file.path);
      if (!keys) {
        return file;
      }
      const now = new Set(file.accepted);
      const auto = new Set(file.auto);
      for (const key of keys) {
        if (accepted) {
          now.add(key);
        } else {
          now.delete(key);
          auto.delete(key);
        }
      }
      const only = (set: Set<string>) =>
        file.changes.flatMap((c) => (set.has(c.key) ? [c.key] : []));
      return { ...file, accepted: only(now), auto: only(auto) };
    }),
  };
}

// The changes grouped by file, split into requests the API takes at once.
export function requests(
  changes: ChangeRef[],
): { path: string; keys: string[] }[][] {
  const result: { path: string; keys: string[] }[][] = [];
  let request: { path: string; keys: string[] }[] = [];
  let count = 0;
  let file: { path: string; keys: string[] } | null = null;
  for (const change of changes) {
    const newFile = file?.path !== change.path;
    if (
      count === MAX_ACCEPT_CHANGES ||
      (newFile && request.length === MAX_ACCEPT_FILES)
    ) {
      result.push(request);
      request = [];
      count = 0;
      file = null;
    }
    if (!file || newFile) {
      file = { path: change.path, keys: [] };
      request.push(file);
    }
    file.keys.push(change.key);
    count++;
  }
  if (request.length > 0) {
    result.push(request);
  }
  return result;
}
