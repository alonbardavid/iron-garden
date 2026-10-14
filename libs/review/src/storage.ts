import { ForgeError } from "@lib/forge";
import {
  agentSessions,
  eq,
  pullRequests,
  repositories,
  sql,
} from "@lib/db-models";

// The Artifacts repository a pull request's commits live in: its session's
// for one an agent opened (null once that session is gone), the repository's
// own for one opened from GitHub, whose branches are mirrored there. Select
// it from pull_requests left-joined on `sessionJoin` and joined on
// `repositoryJoin`.
export const storageName = sql<
  string | null
>`CASE WHEN ${pullRequests.origin} = 'github' THEN ${repositories.artifactsName} ELSE ${agentSessions.artifactsName} END`;

export const sessionJoin = eq(agentSessions.id, pullRequests.sessionId);
export const repositoryJoin = eq(repositories.id, pullRequests.repositoryId);

// The storage, or why the pull request's commits can no longer be read.
export function requireStorage(name: string | null): string {
  if (!name) {
    throw new ForgeError(
      "NOT_FOUND",
      "The session this pull request came from is gone",
    );
  }
  return name;
}
