import { newEntityId } from "@lib/db-models/entity-ids";

// A repository with more pull requests and rules than a page holds, and one
// to copy its rules into that already has the first of them. Named to sort
// after every other fixture so they never push one off a first page.
export const REVIEW_LISTING_FIXTURE = {
  repository: "zz-review-paged",
  copyTo: "zz-review-paged-copy",
  // #1 is closed, #2 merged, #3 processing and the rest open.
  pullRequests: 25,
  rules: 23,
};

export const pagedRule = (n: number) =>
  `Paged rule ${String(n).padStart(2, "0")}`;

export const pagedPullStatus = (n: number) =>
  (["closed", "merged", "processing"] as const)[n - 1] ?? "open";

const match = { kind: "files", syntax: "glob", patterns: ["paged/**"] };

export function buildReviewListingFixtureSql(): string {
  const f = REVIEW_LISTING_FIXTURE;
  const repositoryId = newEntityId("REPOSITORY");
  const copyToId = newEntityId("REPOSITORY");
  const start = Date.UTC(2026, 0, 1);
  const rule = (repository: string, n: number) =>
    `INSERT INTO repository_rules (id, repository_id, name, match, action, created_at, updated_at) VALUES ('${newEntityId("REPOSITORY_RULE")}', '${repository}', '${pagedRule(n)}', '${JSON.stringify(match)}', 'auto-accept', ${start + n * 1000}, ${start + n * 1000});`;
  return [
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}'), ('${copyToId}', '${f.copyTo}', '${copyToId}');`,
    ...Array.from(
      { length: f.pullRequests },
      (_, i) =>
        `INSERT INTO pull_requests (id, repository_id, number, title, branch, target_branch, base_commit, head_commit, status) VALUES ('${newEntityId("PULL_REQUEST")}', '${repositoryId}', ${i + 1}, 'Paged change ${i + 1}', 'paged-${i + 1}', 'main', '${"a".repeat(40)}', '${"b".repeat(40)}', '${pagedPullStatus(i + 1)}');`,
    ),
    ...Array.from({ length: f.rules }, (_, i) => rule(repositoryId, i + 1)),
    rule(copyToId, 1),
  ].join("\n");
}
