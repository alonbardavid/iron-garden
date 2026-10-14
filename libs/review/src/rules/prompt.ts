import type { RuleAction, RuleMatch } from "@lib/db-models";

export interface PromptRule {
  id: string;
  name: string;
  match: RuleMatch;
  action: RuleAction;
}

const ACTIONS: Record<RuleAction, string> = {
  "auto-accept":
    "auto-accepted: these lines count as accepted without anyone reading them",
  "high-impact":
    "high impact: reviewers must accept these lines one at a time after reading them",
  "require-review": "needs a named reviewer to accept these lines",
  "run-workflow":
    "runs a CI workflow on GitHub when these lines change; reviewers still read them",
};

const CONSTRUCTS = { imports: "import statements", comments: "comments" };

// The part of the grouping prompt about the repository's rules: what each
// one does, so the agent can group around them, and the prompt rules it has
// to judge. Empty when there are none.
export function rulesSection(rules: PromptRule[]): string {
  if (rules.length === 0) {
    return "";
  }
  const judged = rules.filter((rule) => rule.match.kind === "prompt");
  const list = rules.map((rule) => `- ${describe(rule)}`).join("\n");
  const judging =
    judged.length === 0
      ? ""
      : `

The rules that say "you judge" need your answer. For each, find every changed line it describes and send their ranges in the same request, under "rules" next to "groups". Leave a rule out when nothing matches it. Reviewers see your answer and can check it against the code, so match what the rule says, no more and no less.

    "rules": [
      { "rule": "${judged[0]!.id}", "ranges": [{ "path": "src/billing/total.ts", "start": 3, "end": 9 }] }
    ]

Ranges here count lines the same way group ranges do.`;
  return `## Repository rules

Every rule that matches becomes its own group in the review, next to yours, so reviewers already find those lines there.

${list}

Group with them in mind. Leave lines an auto-accept rule covers out of your groups unless a group cannot be understood without them, such as the import a new function needs; nobody reads them otherwise, so don't spend a group on them. Make sure every high-impact line sits in a group that explains it.${judging}
`;
}

function describe(rule: PromptRule): string {
  const { match } = rule;
  const where = (paths: string[]) =>
    paths.length > 0 ? ` in files matching ${paths.join(", ")}` : "";
  const what =
    match.kind === "files"
      ? `Every change in files whose path matches the ${match.syntax === "glob" ? "glob" : "regular expression"} ${match.patterns.join(" or ")}.`
      : match.kind === "structure"
        ? `Changes whose lines are all ${match.constructs.map((c) => CONSTRUCTS[c]).join(" or ")}, in JavaScript and TypeScript files${where(match.paths)}. Blank lines next to them count with them.`
        : `You judge${where(match.paths)}: ${match.prompt.replace(/\s*\n\s*/g, " ")}`;
  return `${rule.name} (id ${rule.id}), ${ACTIONS[rule.action]}.\n  ${what}`;
}
