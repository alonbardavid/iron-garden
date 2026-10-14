import {
  addGithubToken,
  artifactDownloadUrl,
  canOpenFromGithub,
  githubPullOptions,
  openFromGithub,
  connectGithub,
  deleteGithubToken,
  disconnectGithub,
  getGithubConnection,
  githubWebhookSecret,
  setUpGithubWebhook,
  removeGithubWebhook,
  githubWebhookAccess,
  jobLogsUrl,
  listGithubTokens,
  listTokenRepositories,
  listWorkflowArtifacts,
  listWorkflowJobs,
  listWorkflowRuns,
  listGithubWorkflows,
  syncGithub,
} from "@lib/github";
import { api } from "./api";

const ok = { ok: true as const };

export const githubTokens = api.githubTokens.router({
  list: api.githubTokens.list.handler(({ context: { principal } }) =>
    listGithubTokens(principal),
  ),
  create: api.githubTokens.create.handler(({ context: { principal }, input }) =>
    addGithubToken(principal, input),
  ),
  delete: api.githubTokens.delete.handler(
    async ({ context: { principal }, input }) => {
      await deleteGithubToken(principal, input.id);
      return ok;
    },
  ),
  repositories: api.githubTokens.repositories.handler(
    ({ context: { principal }, input }) =>
      listTokenRepositories(principal, input.id),
  ),
});

export const repositoryGithub = {
  get: api.repositories.github.get.handler(
    ({ context: { principal, origin }, input }) =>
      getGithubConnection(principal, input.name, origin),
  ),
  connect: api.repositories.github.connect.handler(
    ({ context: { principal, origin }, input: { name, ...connection } }) =>
      connectGithub(principal, name, connection, origin),
  ),
  disconnect: api.repositories.github.disconnect.handler(
    async ({ context: { principal }, input }) => {
      await disconnectGithub(principal, input.name);
      return ok;
    },
  ),
  webhookSecret: api.repositories.github.webhookSecret.handler(
    async ({ context: { principal }, input }) => ({
      secret: await githubWebhookSecret(principal, input.name),
    }),
  ),
  setUpWebhook: api.repositories.github.setUpWebhook.handler(
    ({ context: { principal, origin }, input }) =>
      setUpGithubWebhook(principal, input.name, origin),
  ),
  webhookAccess: api.repositories.github.webhookAccess.handler(
    ({ context: { principal }, input }) =>
      githubWebhookAccess(principal, input.name),
  ),
  removeWebhook: api.repositories.github.removeWebhook.handler(
    ({ context: { principal, origin }, input }) =>
      removeGithubWebhook(principal, input.name, origin),
  ),
  sync: api.repositories.github.sync.handler(
    ({ context: { principal, origin }, input }) =>
      syncGithub(principal, input.name, origin),
  ),
  runs: api.repositories.github.runs.handler(
    ({ context: { principal }, input: { name, ...filter } }) =>
      listWorkflowRuns(principal, name, filter),
  ),
  jobs: api.repositories.github.jobs.handler(
    ({ context: { principal }, input }) =>
      listWorkflowJobs(principal, input.name, input.runId),
  ),
  artifacts: api.repositories.github.artifacts.handler(
    ({ context: { principal }, input }) =>
      listWorkflowArtifacts(principal, input.name, input.runId),
  ),
  artifactDownload: api.repositories.github.artifactDownload.handler(
    async ({ context: { principal }, input }) => ({
      url: await artifactDownloadUrl(principal, input.name, input.artifactId),
    }),
  ),
  workflows: api.repositories.github.workflows.handler(
    ({ context: { principal }, input }) =>
      listGithubWorkflows(principal, input.name),
  ),
  jobLogs: api.repositories.github.jobLogs.handler(
    async ({ context: { principal }, input }) => ({
      url: await jobLogsUrl(principal, input.name, input.jobId),
    }),
  ),
};

export const pullRequestsFromGithub = api.pullRequests.fromGithub.router({
  available: api.pullRequests.fromGithub.available.handler(
    async ({ context: { principal }, input }) => ({
      available: await canOpenFromGithub(principal, input.name),
    }),
  ),
  pulls: api.pullRequests.fromGithub.pulls.handler(
    ({ context: { principal }, input }) =>
      githubPullOptions(principal, input.name),
  ),
  open: api.pullRequests.fromGithub.open.handler(
    ({ context: { principal }, input }) =>
      openFromGithub(principal, input.name, input.source),
  ),
});
