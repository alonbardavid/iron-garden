import { pathMatcher } from "./patterns";

// A mark-exclusive rule: only files matches, so a path alone decides it.
export interface ExclusiveRule {
  id: string;
  name: string;
  syntax: "glob" | "regex";
  patterns: string[];
}

// Another session holding a path in its working set.
export interface PathHolder {
  sessionId: string;
  path: string;
  source: "declared" | "committed";
  branch: string;
}

export interface ExclusiveCollision {
  path: string;
  rule: { id: string; name: string };
  holder: PathHolder;
}

// Each path a session has just taken that a rule marks exclusive and another
// session already holds, once per holding session and path.
export function exclusiveCollisions(
  paths: string[],
  rules: ExclusiveRule[],
  others: PathHolder[],
): ExclusiveCollision[] {
  const ruleOf = exclusiveRuleMatcher(rules);
  const found = new Map<string, ExclusiveCollision>();
  for (const path of paths) {
    const rule = ruleOf(path);
    if (!rule) {
      continue;
    }
    for (const holder of others.filter((other) => other.path === path)) {
      const key = `${holder.sessionId}\n${path}`;
      if (!found.has(key) || holder.source === "committed") {
        found.set(key, {
          path,
          rule: { id: rule.id, name: rule.name },
          holder,
        });
      }
    }
  }
  return [...found.values()];
}

// The first rule that marks a path exclusive, or null.
export function exclusiveRuleMatcher(
  rules: ExclusiveRule[],
): (path: string) => ExclusiveRule | null {
  const tests = rules.map((rule) => ({
    rule,
    matches: pathMatcher(rule.patterns, rule.syntax),
  }));
  return (path) => tests.find((test) => test.matches(path))?.rule ?? null;
}
