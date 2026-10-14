import type { ContractRouterClient } from "@orpc/contract";
import { adminEmailContract, capabilitiesContract } from "./capabilities";
import { accountContract, setupContract } from "./account";
import { agentsContract } from "./agents";
import { repositoriesContract } from "./repositories";
import { githubTokensContract, repositoryGithubContract } from "./github";
import { rulesContract } from "./rules";
import {
  adminContract,
  pullRequestsContract,
  pullRequestsFromGithubContract,
  sessionsContract,
} from "./review";
import {
  activityContract,
  commentsContract,
  transcriptsContract,
} from "./activity";
import { agentChatContract, chatContract } from "./chat";

export { PRODUCT_DISPLAY_NAME } from "./constants";

export * from "./capabilities";
export * from "./files";
export * from "./listing";
export * from "./names";
export * from "./account";
export * from "./agents";
export * from "./repositories";
export * from "./github";
export * from "./rules";
export * from "./review";
export * from "./activity";
export * from "./chat";

// Procedures need a signed-in user or an API key unless the worker implements
// them on `publicApi`; the worker rejects the rest with 401.
export const contract = {
  capabilities: capabilitiesContract,
  setup: setupContract,
  ...accountContract,
  agents: agentsContract,
  githubTokens: githubTokensContract,
  repositories: {
    ...repositoriesContract,
    rules: rulesContract,
    github: repositoryGithubContract,
  },
  sessions: sessionsContract,
  pullRequests: {
    ...pullRequestsContract,
    fromGithub: pullRequestsFromGithubContract,
    activity: activityContract,
    comments: commentsContract,
    chat: chatContract,
  },
  chat: agentChatContract,
  transcripts: transcriptsContract,
  admin: { ...adminContract, email: adminEmailContract },
};

export type Contract = typeof contract;

export type ApiClient = ContractRouterClient<Contract>;
