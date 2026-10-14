import { newEntityId } from "@lib/db-models/entity-ids";

// A pull request seeded straight into the test database: e2e has no git
// storage, so the spec serves the file's two versions itself and the seed
// carries the changes the worker would have counted from them.
export const REVIEW_FIXTURE = {
  repository: "review-fixture",
  number: 1,
  path: "greeting.ts",
  before: 'export const greeting = "hello";\nexport const name = "world";\n',
  after:
    'export const greeting = "hi";\nexport const name = "world";\nexport const shout = true;\nexport const loud = true;\n',
  // @lib/diff's [key, at] for the two versions; libs/diff/src/changes.test.ts
  // pins the same keys.
  changes: [
    ["ij42vw7t3x", 1],
    ["10b26e57rem", 3],
    ["xdmnnn44xx", 4],
  ],
};

export function buildReviewFixtureSql(): string {
  const f = REVIEW_FIXTURE;
  const repositoryId = newEntityId("REPOSITORY");
  const pullRequestId = newEntityId("PULL_REQUEST");
  const commit = (c: string) => c.repeat(40);
  const description = "Says **hi** instead of `hello`.\n\n- shouts\n- *loudly*";
  const ranges = JSON.stringify([{ path: f.path, start: 1, end: 4 }]);
  return [
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO pull_requests (id, repository_id, number, title, description, branch, target_branch, base_commit, head_commit, status) VALUES ('${pullRequestId}', '${repositoryId}', ${f.number}, 'Say *hi*', '${description}', 'hi', 'main', '${commit("a")}', '${commit("b")}', 'open');`,
    `INSERT INTO pull_request_files (id, pull_request_id, path, change, old_lines, new_lines, changes) VALUES ('${newEntityId("PULL_REQUEST_FILE")}', '${pullRequestId}', '${f.path}', 'modified', 2, 4, '${JSON.stringify(f.changes)}');`,
    `INSERT INTO pull_request_groups (id, pull_request_id, position, title, kind, description, ranges) VALUES ('${newEntityId("PULL_REQUEST_GROUP")}', '${pullRequestId}', 0, 'The greeting', 'flow', 'Says \`hi\`.', '${ranges}');`,
  ].join("\n");
}
