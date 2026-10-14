import { oc } from "@orpc/contract";
import { z } from "zod";

// GitHub's own rules for owner and repository names.
const githubNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, {
    error: "Use a GitHub owner or repository name",
  });

export const githubRepositoryRefSchema = z.object({
  owner: githubNameSchema,
  repo: githubNameSchema,
});

export const githubTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  // The token's last characters.
  hint: z.string(),
  githubLogin: z.string(),
  // A classic token's scopes; null for a fine-grained token.
  scopes: z.string().nullable(),
  expiresAt: z.number().nullable(),
  lastUsedAt: z.number().nullable(),
  createdAt: z.number(),
});
export type GithubToken = z.infer<typeof githubTokenSchema>;

export const githubTokenRepositorySchema = githubRepositoryRefSchema.extend({
  private: z.boolean(),
  description: z.string().nullable(),
});
export type GithubTokenRepository = z.infer<typeof githubTokenRepositorySchema>;

export const GITHUB_SYNC_STATUSES = ["idle", "syncing", "failed"] as const;

export const githubConnectionSchema = githubRepositoryRefSchema.extend({
  htmlUrl: z.string(),
  // Where GitHub delivers the repository's events.
  webhookUrl: z.string(),
  // "manual" until someone adds the hook on GitHub with the secret.
  webhook: z.enum(["automatic", "manual"]),
  webhookDeliveredAt: z.number().nullable(),
  syncStatus: z.enum(GITHUB_SYNC_STATUSES),
  lastSyncedAt: z.number().nullable(),
  lastSyncError: z.string().nullable(),
  // Null once the token was deleted: syncing stops until someone reconnects.
  token: z
    .object({
      id: z.string(),
      name: z.string(),
      githubLogin: z.string(),
      userId: z.string(),
      userName: z.string(),
    })
    .nullable(),
});
export type GithubConnection = z.infer<typeof githubConnectionSchema>;

export const workflowRunSchema = z.object({
  runId: z.number(),
  workflowName: z.string(),
  runNumber: z.number(),
  runAttempt: z.number(),
  event: z.string(),
  headBranch: z.string().nullable(),
  headSha: z.string(),
  // GitHub's: queued, in_progress, completed, …
  status: z.string(),
  // GitHub's, once completed: success, failure, cancelled, skipped, …
  conclusion: z.string().nullable(),
  htmlUrl: z.string(),
  startedAt: z.number(),
  updatedAt: z.number(),
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const workflowJobSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  htmlUrl: z.string().nullable(),
  steps: z.array(
    z.object({
      number: z.number(),
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
    }),
  ),
});
export type WorkflowJob = z.infer<typeof workflowJobSchema>;

export const workflowArtifactSchema = z.object({
  id: z.number(),
  name: z.string(),
  sizeInBytes: z.number(),
  expired: z.boolean(),
  createdAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
});
export type WorkflowArtifact = z.infer<typeof workflowArtifactSchema>;

export const githubWorkflowSchema = z.object({
  id: z.number(),
  name: z.string(),
  path: z.string(),
  // GitHub's: active, disabled_manually, …
  state: z.string(),
});
export type GithubWorkflow = z.infer<typeof githubWorkflowSchema>;

export const GITHUB_PULL_STATES = ["open", "closed", "merged"] as const;

export const githubCheckSchema = z.object({
  name: z.string(),
  // A check run (GitHub Actions and apps) or a commit status (older CI).
  source: z.enum(["check", "status"]),
  status: z.enum(["queued", "in_progress", "completed"]),
  conclusion: z.string().nullable(),
  url: z.string().nullable(),
});
export type GithubCheck = z.infer<typeof githubCheckSchema>;

// What GitHub says about a pull request: its GitHub pull request, and the
// checks and workflow runs on that one's head.
export const githubPullStatusSchema = z.object({
  connected: z.boolean(),
  pull: z
    .object({
      number: z.number(),
      url: z.string(),
      state: z.enum(GITHUB_PULL_STATES),
      draft: z.boolean(),
      // Null while GitHub is still working it out.
      mergeable: z.boolean().nullable(),
      mergeableState: z.string().nullable(),
      headSha: z.string(),
    })
    .nullable(),
  checks: z.array(githubCheckSchema),
  runs: z.array(workflowRunSchema),
});
export type GithubPullStatus = z.infer<typeof githubPullStatusSchema>;

const byName = z.object({ name: z.string() });
const ok = z.object({ ok: z.literal(true) });
// A short-lived link that works without credentials.
const download = z.object({ url: z.string() });
const githubId = z.coerce.number<number>().int().positive();

export const githubTokensContract = {
  list: oc
    .route({ method: "GET", path: "/api/account/github-tokens" })
    .output(z.array(githubTokenSchema)),
  create: oc
    .route({ method: "POST", path: "/api/account/github-tokens" })
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        token: z.string().trim().min(20).max(500),
      }),
    )
    .output(githubTokenSchema),
  delete: oc
    .route({ method: "DELETE", path: "/api/account/github-tokens/{id}" })
    .input(z.object({ id: z.string() }))
    .output(ok),
  // The GitHub repositories the token can reach, most recently pushed first.
  repositories: oc
    .route({
      method: "GET",
      path: "/api/account/github-tokens/{id}/repositories",
    })
    .input(z.object({ id: z.string() }))
    .output(z.array(githubTokenRepositorySchema)),
};

export const repositoryGithubContract = {
  // Null when the repository is not connected.
  get: oc
    .route({ method: "GET", path: "/api/repositories/{name}/github" })
    .input(byName)
    .output(githubConnectionSchema.nullable()),
  // Connects with one of the caller's tokens and syncs every branch, or moves
  // the connection onto that token.
  connect: oc
    .route({ method: "PUT", path: "/api/repositories/{name}/github" })
    .input(
      byName
        .extend(githubRepositoryRefSchema.shape)
        .extend({ tokenId: z.string() }),
    )
    .output(githubConnectionSchema),
  disconnect: oc
    .route({ method: "DELETE", path: "/api/repositories/{name}/github" })
    .input(byName)
    .output(ok),
  webhookSecret: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/github/webhook-secret",
    })
    .input(byName)
    .output(z.object({ secret: z.string() })),
  // Whether the connection's token may create and remove the webhook.
  webhookAccess: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/github/webhook/access",
    })
    .input(byName)
    .output(z.object({ allowed: z.boolean(), reason: z.string().nullable() })),
  // Creates the webhook on GitHub with the connection's token.
  setUpWebhook: oc
    .route({ method: "POST", path: "/api/repositories/{name}/github/webhook" })
    .input(byName)
    .output(githubConnectionSchema),
  removeWebhook: oc
    .route({
      method: "DELETE",
      path: "/api/repositories/{name}/github/webhook",
    })
    .input(byName)
    .output(githubConnectionSchema),
  sync: oc
    .route({ method: "POST", path: "/api/repositories/{name}/github/sync" })
    .input(byName)
    .output(githubConnectionSchema),
  // Newest first, as GitHub reported them.
  runs: oc
    .route({ method: "GET", path: "/api/repositories/{name}/github/runs" })
    .input(
      byName.extend({
        sha: z
          .string()
          .regex(/^[0-9a-f]{40}$/)
          .optional(),
        branch: z.string().min(1).max(200).optional(),
        limit: z.coerce.number<number>().int().min(1).max(100).default(30),
      }),
    )
    .output(z.array(workflowRunSchema)),
  jobs: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/github/runs/{runId}/jobs",
    })
    .input(byName.extend({ runId: githubId }))
    .output(z.array(workflowJobSchema)),
  artifacts: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/github/runs/{runId}/artifacts",
    })
    .input(byName.extend({ runId: githubId }))
    .output(z.array(workflowArtifactSchema)),
  artifactDownload: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/github/artifacts/{artifactId}/download",
    })
    .input(byName.extend({ artifactId: githubId }))
    .output(download),
  workflows: oc
    .route({ method: "GET", path: "/api/repositories/{name}/github/workflows" })
    .input(byName)
    .output(z.array(githubWorkflowSchema)),
  jobLogs: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/github/jobs/{jobId}/logs",
    })
    .input(byName.extend({ jobId: githubId }))
    .output(download),
};
