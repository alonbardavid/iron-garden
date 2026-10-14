import { changesOf, diffLines } from "@lib/diff";
import { newEntityId } from "@lib/db-models/entity-ids";
import { TEST_ADMIN, TEST_USER } from "../users";

// A pull request reviewed with rules, seeded with what the worker would have
// stored: each file's changes, what the pattern rules matched, and the
// prompt rule's lines as an agent judged them.
export const RULES_FIXTURE = {
  repository: "rules-fixture",
  number: 1,
  files: {
    "src/money.ts": {
      change: "modified",
      before:
        'import { a } from "./a";\n\nexport function total(x) {\n  return x + 1;\n}\n',
      after:
        'import { a } from "./a";\nimport { round } from "./round";\n\nexport function total(x) {\n  return round(x + 2);\n}\nexport const VERSION = 2;\n',
    },
    "src/fees.ts": {
      change: "added",
      before: "",
      after: "export const fee = 3;\nexport const cap = 10;\n",
    },
    "src/old.ts": {
      change: "deleted",
      before: "export const fee = 3;\nexport const cap = 10;\n",
      after: "",
    },
  } as Record<
    string,
    { change: "added" | "modified" | "deleted"; before: string; after: string }
  >,
};

const sql = (value: unknown) =>
  `'${(typeof value === "string" ? value : JSON.stringify(value)).replace(/'/g, "''")}'`;
const userId = (username: string) =>
  `(SELECT id FROM user WHERE username = ${sql(username)})`;

export function buildRulesFixtureSql(): string {
  const f = RULES_FIXTURE;
  const repositoryId = newEntityId("REPOSITORY");
  const pullRequestId = newEntityId("PULL_REQUEST");
  const keys = (path: string) => {
    const { before, after } = f.files[path]!;
    return changesOf(diffLines(before, after)).map(
      (c) => [c.key, c.at] as [string, number],
    );
  };
  const money = keys("src/money.ts");
  const fees = keys("src/fees.ts");
  const rules = {
    imports: {
      rule: newEntityId("REPOSITORY_RULE"),
      run: newEntityId("PULL_REQUEST_RULE"),
      name: "Import changes",
      match: { kind: "structure", constructs: ["imports"], paths: [] },
      action: "auto-accept",
      reviewers: "'[]'",
    },
    money: {
      rule: newEntityId("REPOSITORY_RULE"),
      run: newEntityId("PULL_REQUEST_RULE"),
      name: "Money math",
      match: {
        kind: "prompt",
        prompt: "Any change to how totals are computed",
        paths: ["src/**"],
      },
      action: "high-impact",
      reviewers: "'[]'",
    },
    fees: {
      rule: newEntityId("REPOSITORY_RULE"),
      run: newEntityId("PULL_REQUEST_RULE"),
      name: "Fee review",
      match: { kind: "files", syntax: "glob", patterns: ["src/fees.ts"] },
      action: "require-review",
      reviewers: `json_array(${userId(TEST_ADMIN.username)})`,
    },
  };
  const matches: Record<string, Record<string, string[]>> = {
    "src/money.ts": { [rules.imports.run]: [money[0]![0]] },
    "src/fees.ts": { [rules.fees.run]: fees.map(([key]) => key) },
    "src/old.ts": {},
  };
  const lineCount = (text: string) => text.split("\n").length - 1;
  return [
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${userId(TEST_ADMIN.username)}, 'admin'), ('${repositoryId}', ${userId(TEST_USER.username)}, 'read');`,
    `INSERT INTO pull_requests (id, repository_id, number, title, branch, target_branch, base_commit, head_commit, status) VALUES ('${pullRequestId}', '${repositoryId}', ${f.number}, 'Round totals and move fees', 'fees', 'main', '${"a".repeat(40)}', '${"b".repeat(40)}', 'open');`,
    ...Object.entries(f.files).map(
      ([path, file]) =>
        `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes, matches) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${pullRequestId}', '${path}', '${file.change}', ${lineCount(file.before)}, ${lineCount(file.after)}, ${sql(keys(path))}, ${sql(matches[path])});`,
    ),
    ...Object.values(rules).flatMap((rule, position) => [
      `INSERT INTO repository_rules (id, repository_id, name, match, action, reviewers) VALUES ('${rule.rule}', '${repositoryId}', ${sql(rule.name)}, ${sql(rule.match)}, '${rule.action}', ${rule.reviewers});`,
      `INSERT INTO pull_request_rules (id, pull_request_id, rule_id, position, name, match, action, reviewers, ranges, matched) VALUES ('${rule.run}', '${pullRequestId}', '${rule.rule}', ${position}, ${sql(rule.name)}, ${sql(rule.match)}, '${rule.action}', ${rule.reviewers}, ${rule === rules.money ? sql([{ path: "src/money.ts", start: 5, end: 5 }]) : "NULL"}, 1);`,
    ]),
    `INSERT INTO pull_request_groups (id, pull_request_id, position, title, kind, description, ranges) VALUES ('${newEntityId("PULL_REQUEST_GROUP")}', '${pullRequestId}', 0, 'Totals are rounded', 'flow', 'Rounds every total.', ${sql([{ path: "src/money.ts", start: 1, end: 7, note: "The total is rounded before it is returned." }])});`,
    `INSERT INTO pull_request_groups (id, pull_request_id, position, title, kind, description, ranges) VALUES ('${newEntityId("PULL_REQUEST_GROUP")}', '${pullRequestId}', 1, 'Fees move to their own file', 'move', 'Moved as is.', ${sql([{ path: "src/fees.ts", start: 1, end: 2, movedFrom: { path: "src/old.ts", start: 1, end: 2 } }])});`,
  ].join("\n");
}
