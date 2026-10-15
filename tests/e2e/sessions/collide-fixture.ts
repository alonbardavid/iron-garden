import { newEntityId } from "@lib/db-models/entity-ids";
import { TEST_ADMIN, TEST_USER } from "../users";

// Two agents, owned by different people, each with an active session on one
// repository whose rule marks PNG files exclusive; and an ended session that
// pushed a branch it never opened a pull request for. e2e has no git storage,
// so sessions are seeded rather than started.
export const COLLIDE_FIXTURE = {
  repository: "collide-fixture",
  rule: { name: "Images", pattern: "**/*.png" },
  a: {
    agent: "pixel-agent",
    owner: TEST_USER,
    session: "SES_collide-a",
    title: "Redesign the header",
  },
  b: {
    agent: "brand-agent",
    owner: TEST_ADMIN,
    session: "SES_collide-b",
    title: "Refresh the brand",
  },
  ended: {
    session: "SES_collide-ended",
    title: "Abandoned spike",
    branch: "spike",
    file: "src/spike.ts",
  },
};

const sql = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function buildCollideFixtureSql(): string {
  const f = COLLIDE_FIXTURE;
  const repositoryId = newEntityId("REPOSITORY");
  const agentA = newEntityId("AGENT");
  const agentB = newEntityId("AGENT");
  const userOf = (username: string) =>
    `(SELECT id FROM user WHERE username = ${sql(username)})`;
  const now = Date.now();
  const session = (
    id: string,
    agentId: string,
    title: string,
    status: "active" | "ended",
  ) =>
    `INSERT INTO agent_sessions (id, agent_id, repository_id, title, status, artifacts_name, base_branch, base_commit, last_seen_at, ended_at) VALUES ('${id}', '${agentId}', '${repositoryId}', ${sql(title)}, '${status}', '${id}', 'main', '${"a".repeat(40)}', ${now}, ${status === "ended" ? now : "NULL"});`;
  const match = JSON.stringify({
    kind: "files",
    syntax: "glob",
    patterns: [f.rule.pattern],
  });
  return [
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO agents (id, owner_user_id, name) VALUES ('${agentA}', ${userOf(f.a.owner.username)}, '${f.a.agent}');`,
    `INSERT INTO agents (id, owner_user_id, name) VALUES ('${agentB}', ${userOf(f.b.owner.username)}, '${f.b.agent}');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${userOf(f.a.owner.username)}, 'write');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${userOf(f.b.owner.username)}, 'admin');`,
    `INSERT INTO agent_repository_access (agent_id, repository_id, level) VALUES ('${agentA}', '${repositoryId}', 'write');`,
    `INSERT INTO agent_repository_access (agent_id, repository_id, level) VALUES ('${agentB}', '${repositoryId}', 'write');`,
    `INSERT INTO repository_rules (id, repository_id, name, match, action) VALUES ('${newEntityId("REPOSITORY_RULE")}', '${repositoryId}', ${sql(f.rule.name)}, ${sql(match)}, 'mark-exclusive');`,
    session(f.a.session, agentA, f.a.title, "active"),
    session(f.b.session, agentB, f.b.title, "active"),
    session(f.ended.session, agentA, f.ended.title, "ended"),
    `INSERT INTO session_branches (id, session_id, branch, head_commit) VALUES ('${newEntityId("SESSION_BRANCH")}', '${f.ended.session}', '${f.ended.branch}', '${"b".repeat(40)}');`,
    `INSERT INTO session_files (id, session_id, repository_id, path, source, branch, touched_at) VALUES ('${newEntityId("SESSION_FILE")}', '${f.ended.session}', '${repositoryId}', '${f.ended.file}', 'committed', '${f.ended.branch}', ${now});`,
  ].join("\n");
}
