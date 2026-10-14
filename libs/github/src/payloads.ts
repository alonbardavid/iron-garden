import { z } from "zod";

// The parts of GitHub's REST and webhook payloads the integration reads.

export const githubUserSchema = z.object({ login: z.string() });

export const githubRepoSchema = z.object({
  full_name: z.string(),
  default_branch: z.string(),
  private: z.boolean(),
  html_url: z.string(),
  description: z.string().nullable(),
  // What the token's account may do there.
  permissions: z
    .object({ admin: z.boolean(), push: z.boolean(), pull: z.boolean() })
    .optional(),
});

export const repoListingSchema = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
  private: z.boolean(),
  description: z.string().nullable(),
});

export const workflowRunSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  run_number: z.number(),
  run_attempt: z.number().default(1),
  event: z.string(),
  head_branch: z.string().nullable(),
  head_sha: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  html_url: z.string(),
  run_started_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WorkflowRunPayload = z.infer<typeof workflowRunSchema>;

const stepSchema = z.object({
  number: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
});

export const jobSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  html_url: z.string().nullable(),
  steps: z.array(stepSchema).default([]),
});
export type JobPayload = z.infer<typeof jobSchema>;

export const artifactSchema = z.object({
  id: z.number(),
  name: z.string(),
  size_in_bytes: z.number(),
  expired: z.boolean(),
  created_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});
export type ArtifactPayload = z.infer<typeof artifactSchema>;

export const hookSchema = z.object({ id: z.number() });

export const pushEventSchema = z.object({
  ref: z.string(),
  deleted: z.boolean().default(false),
  repository: z.object({ full_name: z.string() }),
});

export const workflowRunEventSchema = z.object({
  workflow_run: workflowRunSchema,
  repository: z.object({ full_name: z.string() }),
});

export const workflowSchema = z.object({
  id: z.number(),
  name: z.string(),
  path: z.string(),
  state: z.string(),
});
export type WorkflowPayload = z.infer<typeof workflowSchema>;

export const pullSchema = z.object({
  number: z.number(),
  html_url: z.string(),
  title: z.string(),
  body: z.string().nullable().optional(),
  user: z.object({ login: z.string() }).nullable().optional(),
  state: z.enum(["open", "closed"]),
  draft: z.boolean().default(false),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  // Only on a single pull request: null while GitHub is still working it out.
  mergeable: z.boolean().nullable().optional(),
  mergeable_state: z.string().optional(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
    repo: z.object({ full_name: z.string() }).nullable(),
  }),
  base: z.object({ ref: z.string() }),
});
export type PullPayload = z.infer<typeof pullSchema>;

export const mergeResultSchema = z.object({
  merged: z.boolean(),
  sha: z.string().nullable(),
  message: z.string(),
});

export const checkRunSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  html_url: z.string().nullable(),
  details_url: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  app: z.object({ name: z.string() }).nullable(),
});
export type CheckRunPayload = z.infer<typeof checkRunSchema>;

export const commitStatusSchema = z.object({
  id: z.number(),
  context: z.string(),
  state: z.enum(["error", "failure", "pending", "success"]),
  description: z.string().nullable(),
  target_url: z.string().nullable(),
  updated_at: z.string(),
});
export type CommitStatusPayload = z.infer<typeof commitStatusSchema>;

export const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: pullSchema,
  repository: z.object({ full_name: z.string() }),
});
