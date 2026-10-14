import type {
  RuleAction,
  RuleConstruct,
  RuleMatch,
  RuleWorkflow,
} from "@lib/contract";

const CONSTRUCTS: Record<RuleConstruct, string> = {
  imports: "import statements",
  comments: "comments",
};

export function joinWords(words: string[]): string {
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// What a rule matches, in one line: "File names: api/openapi.yaml".
export function matchSummary(match: RuleMatch): string {
  switch (match.kind) {
    case "files":
      return `File names${match.syntax === "regex" ? " (regex)" : ""}: ${match.patterns.join(", ")}`;
    case "structure":
      return `Code structure: ${joinWords(match.constructs.map((c) => CONSTRUCTS[c]))}, JavaScript and TypeScript${scope(match.paths)}`;
    case "prompt":
      return `Prompt: ${match.prompt}${scope(match.paths)}`;
  }
}

function scope(paths: string[]): string {
  return paths.length ? `, in ${paths.join(", ")}` : "";
}

// The kind of match, as the label over a rule's bracket.
export function matchKind(match: RuleMatch): string {
  return match.kind === "prompt" ? "Prompt" : "Pattern";
}

export const ACTION_LABELS: Record<RuleAction, string> = {
  "auto-accept": "Auto-accept",
  "high-impact": "High impact",
  "require-review": "Review",
  "run-workflow": "Workflow",
};

// "Auto-accept", "High impact", "Review by Lena Fischer" or "Runs CI".
export function actionSummary(rule: {
  action: RuleAction;
  reviewers: { name: string }[];
  workflow: RuleWorkflow | null;
}): string {
  switch (rule.action) {
    case "require-review":
      return `Review by ${joinWords(rule.reviewers.map((r) => r.name)) || "no one yet"}`;
    case "run-workflow":
      return `Runs ${rule.workflow?.name ?? "a workflow"}`;
  }
  return ACTION_LABELS[rule.action];
}
