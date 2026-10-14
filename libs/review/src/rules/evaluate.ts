import type { DiffLine } from "@lib/diff";
import type { GroupRangeRow, RuleAction, RuleMatch } from "@lib/db-models";
import { pathMatcher } from "./patterns";
import { isScript, structureMatches } from "./structure";

export interface RunRule {
  id: string;
  match: RuleMatch;
  action: RuleAction;
  ranges: GroupRangeRow[] | null;
}

export interface MatchedFile {
  path: string;
  // [key, at] for each change, as stored on the file.
  changes: [string, number][];
  // Pattern rules' matched keys, by rule id.
  matches: Record<string, string[]>;
}

// Whether a rule keeps to some files and this is not one of them.
function inScope(match: RuleMatch, path: string): boolean {
  if (match.kind === "files") {
    return pathMatcher(match.patterns, match.syntax)(path);
  }
  return match.paths.length === 0 || pathMatcher(match.paths)(path);
}

// What each pattern rule matches in one file, by rule id, leaving out rules
// that match nothing. Prompt rules are judged by the agent instead. `text`
// is null for a file whose diff is not shown (binary or too large).
export function matchFile(
  rules: RunRule[],
  path: string,
  changes: [string, number][],
  text: { lines: DiffLine[]; before: string; after: string } | null,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const rule of rules) {
    const { match } = rule;
    if (match.kind === "prompt" || !inScope(match, path)) {
      continue;
    }
    const keys =
      match.kind === "files"
        ? changes.map(([key]) => key)
        : text && isScript(path)
          ? structureMatches(
              text.lines,
              text.before,
              text.after,
              match.constructs,
            )
          : [];
    if (keys.length > 0) {
      result[rule.id] = keys;
    }
  }
  return result;
}

// A rule's matched changes, file by file: pattern rules' stored keys, or the
// changes inside the ranges the agent sent for a prompt rule, kept to the
// rule's files.
export function ruleFiles(
  rule: RunRule,
  files: MatchedFile[],
): { path: string; keys: string[] }[] {
  return files.flatMap((file) => {
    const keys =
      rule.match.kind === "prompt"
        ? inScope(rule.match, file.path)
          ? file.changes
              .filter(([, at]) =>
                (rule.ranges ?? []).some(
                  (r) => r.path === file.path && at >= r.start && at <= r.end,
                ),
              )
              .map(([key]) => key)
          : []
        : (file.matches[rule.id] ?? []);
    return keys.length > 0 ? [{ path: file.path, keys }] : [];
  });
}

// Every change some auto-accept rule matched, as "path\nkey".
export function autoAccepted(
  rules: RunRule[],
  files: MatchedFile[],
): Set<string> {
  return new Set(
    rules
      .filter((rule) => rule.action === "auto-accept")
      .flatMap((rule) =>
        ruleFiles(rule, files).flatMap(({ path, keys }) =>
          keys.map((key) => `${path}\n${key}`),
        ),
      ),
  );
}
