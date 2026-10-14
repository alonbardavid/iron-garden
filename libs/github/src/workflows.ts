import { authorize } from "@lib/forge";
import type { RuleWorkflow } from "@lib/db-models";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { copyRules, type Rule } from "@lib/review";
import { githubApi } from "./api";
import { connectedApi, connectionOf } from "./connections";
import { connectionToken } from "./sync";

const log = moduleLogger("github/workflows");

export interface GithubWorkflow extends RuleWorkflow {
  // GitHub's: active, disabled_manually, …
  state: string;
}

// The connected repository's GitHub Actions workflows, for a run-workflow
// rule to pick from.
export async function listGithubWorkflows(
  principal: Principal,
  name: string,
): Promise<GithubWorkflow[]> {
  const { connection, api } = await connectedApi(principal, name, "read");
  const workflows = await api.workflows(connection.owner, connection.repo);
  log.info("workflows read", {
    connectionId: connection.id,
    workflows: workflows.length,
  });
  return workflows.map(({ id, name, path, state }) => ({
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
