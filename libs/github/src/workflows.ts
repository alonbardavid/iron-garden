import { authorize } from "@lib/forge";
import type { RuleWorkflow } from "@lib/db-models";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { copyRules, type Rule } from "@lib/review";
import { githubApi } from "./api";
import { connectedApi, connectionOf } from "./connections";
import { matchesEveryWord } from "./search";
import { connectionToken } from "./sync";

const log = moduleLogger("github/workflows");

export interface GithubWorkflow extends RuleWorkflow {
  // GitHub's: active, disabled_manually, …
  state: string;
}

// Up to `limit` of the connected repository's GitHub Actions workflows whose
// name or path holds every word of `q`, for a run-workflow rule to pick from.
export async function searchGithubWorkflows(
  principal: Principal,
  name: string,
  q: string,
  limit: number,
): Promise<GithubWorkflow[]> {
  const { connection, api } = await connectedApi(principal, name, "read");
  const workflows = await api.workflows(connection.owner, connection.repo);
  const found = workflows
    .filter((workflow) =>
      matchesEveryWord(`${workflow.name} ${workflow.path}`, q),
    )
    .slice(0, limit);
  log.info("workflows searched", {
    connectionId: connection.id,
    workflows: workflows.length,
    found: found.length,
  });
  return found.map(({ id, name, path, state }) => ({
    id,
    name,
    path,
    state,
  }));
}

// Copies rules from another repository. A run-workflow rule needs a workflow
// at the same path here, so without one, or without a GitHub connection, it
// is dropped and named in `dropped`.
export async function copyRulesHere(
  principal: Principal,
  name: string,
  from: string,
  ids: string[],
): Promise<{ rules: Rule[]; dropped: string[] }> {
  return copyRules(
    principal,
    name,
    from,
    ids,
    await workflowsByPath(principal, name),
  );
}

async function workflowsByPath(
  principal: Principal,
  name: string,
): Promise<Map<string, RuleWorkflow>> {
  const repository = await authorize(principal, name, "admin");
  const connection = await connectionOf(repository.id);
  if (!connection) {
    return new Map();
  }
  const api = githubApi(await connectionToken(connection));
  const workflows = await api.workflows(connection.owner, connection.repo);
  return new Map(
    workflows.map(({ id, name, path }) => [path, { id, name, path }]),
  );
}
