import { newEntityId } from "@lib/db-models/entity-ids";
import { TEST_ADMIN, TEST_USER } from "../users";

// A repository with sessions in every state, all run by TEST_USER's agent and
// read by TEST_ADMIN, who owns none of them; and one with no sessions at all.
// The live session was seen when the database was seeded, so it stays live
// for the suite's first 15 minutes.
export const SESSIONS_FIXTURE = {
  repository: "sessions-fixture",
  empty: "sessions-empty",
  agent: "builder-bot",
  owner: TEST_USER,
  viewer: TEST_ADMIN,
  live: {
    id: "SES_sessions-live",
    title: "Redesign the header",
    goal: "Swap the logo for the **new mark** and tighten the header.",
  },
  idle: { id: "SES_sessions-idle", title: "Migrate billing" },
  unmerged: {
    id: "SES_sessions-unmerged",
    title: "Resize the logo",
    pullRequest: { number: 1, title: "Shrink logo.png" },
  },
  merged: {
    id: "SES_sessions-merged",
    title: "Fix the typo",
    pullRequest: { number: 2, title: "Fix a typo in README" },
  },
};

const sql = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function buildSessionsFixtureSql(): string {
  const f = SESSIONS_FIXTURE;
  const repositoryId = newEntityId("REPOSITORY");
  const emptyId = newEntityId("REPOSITORY");
  const agentId = newEntityId("AGENT");
  const userOf = (username: string) =>
    `(SELECT id FROM user WHERE username = ${sql(username)})`;
  const minutesAgo = (m: number) => Date.now() - m * 60_000;
  const commit = (c: string) => c.repeat(40);
  const session = (
    s: { id: string; title: string; goal?: string },
    status: "active" | "ended",
    lastSeen: number,
    started: number,
  ) =>
    `INSERT INTO agent_sessions (id, agent_id, repository_id, title, goal, status, artifacts_name, base_branch, base_commit, client, last_seen_at, ended_at, created_at) VALUES ('${s.id}', '${agentId}', '${repositoryId}', ${sql(s.title)}, ${s.goal ? sql(s.goal) : "NULL"}, '${status}', '${s.id}', 'main', '${commit("a")}', 'claude-code', ${lastSeen}, ${status === "ended" ? lastSeen : "NULL"}, ${started});`;
  const pullRequest = (
    s: { id: string; pullRequest: { number: number; title: string } },
    status: "open" | "merged",
  ) =>
    `INSERT INTO pull_requests (id, repository_id, number, session_id, agent_id, title, branch, target_branch, base_commit, head_commit, status) VALUES ('${newEntityId("PULL_REQUEST")}', '${repositoryId}', ${s.pullRequest.number}, '${s.id}', '${agentId}', ${sql(s.pullRequest.title)}, 'work-${s.pullRequest.number}', 'main', '${commit("a")}', '${commit("b")}', '${status}');`;
  return [
    `INSERT INTO agents (id, owner_user_id, name) VALUES ('${agentId}', ${userOf(f.owner.username)}, '${f.agent}');`,
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${repositoryId}', '${f.repository}', '${repositoryId}');`,
    `INSERT INTO repositories (id, name, artifacts_name) VALUES ('${emptyId}', '${f.empty}', '${emptyId}');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${userOf(f.owner.username)}, 'write');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${repositoryId}', ${userOf(f.viewer.username)}, 'read');`,
    `INSERT INTO repository_members (repository_id, user_id, level) VALUES ('${emptyId}', ${userOf(f.viewer.username)}, 'read');`,
    session(f.live, "active", Date.now(), minutesAgo(30)),
    session(f.idle, "active", minutesAgo(120), minutesAgo(240)),
    session(f.unmerged, "ended", minutesAgo(300), minutesAgo(400)),
    session(f.merged, "ended", minutesAgo(500), minutesAgo(600)),
    pullRequest(f.unmerged, "open"),
    pullRequest(f.merged, "merged"),
  ].join("\n");
}
