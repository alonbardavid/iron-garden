import { oc } from "@orpc/contract";
import { z } from "zod";
import { chatEndpointsSchema } from "./chat";
import {
  changedFileContentsSchema,
  changedFileSchema,
  fileVersionSchema,
} from "./files";
import { branchSchema } from "./repositories";
import { RULE_ACTIONS, ruleMatchSchema, ruleWorkflowSchema } from "./rules";
import { GITHUB_PULL_STATES, githubPullStatusSchema } from "./github";

// Mirrors GROUP_KINDS in @lib/review, which checks them on submit.
export const GROUP_KINDS = [
  "flow",
  "refactor",
  "rename",
  "move",
  "copy",
  "schema",
  "generated",
  "config",
  "tests",
  "docs",
  "other",
] as const;

export const PULL_REQUEST_STATUSES = [
  "processing",
  "open",
  "merged",
  "closed",
] as const;

// GitHub's merge button: a merge commit, one squashed commit, or the
// branch's own commits.
export const MERGE_METHODS = ["merge", "squash", "rebase"] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

export const DISPATCH_STATUSES = ["waiting", "dispatched", "failed"] as const;

const ok = z.object({ ok: z.literal(true) });

const markdown = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const sessionDetailsSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  goal: markdown(20_000),
  context: markdown(50_000),
});

export const sessionSchema = z.object({
  id: z.string(),
  repository: z.string(),
  agent: z.string(),
  title: z.string().nullable(),
  goal: z.string().nullable(),
  context: z.string().nullable(),
  status: z.enum(["active", "ended"]),
  baseBranch: z.string(),
  baseCommit: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionLinksSchema = z.object({
  session: z.string(),
  token: z.string(),
  pullRequests: z.string(),
  transcripts: z.string(),
  end: z.string(),
});

export const gitTokenSchema = z.object({
  remote: z.string(),
  token: z.string(),
  expiresAt: z.string(),
});

export const startedSessionSchema = z.object({
  session: sessionSchema,
  git: gitTokenSchema.extend({
    baseBranch: z.string(),
    baseCommit: z.string().nullable(),
  }),
  instructions: z.string(),
  links: sessionLinksSchema,
});

export const lineRangeSchema = z.object({
  path: z.string().min(1).max(1000),
  start: z.number().int().min(1),
  end: z.number().int().min(1),
});

// Lines in the new version of a file (the old one for a deleted file), a
// short note on what they do, for moved code where it came from, in the old
// version of that file, and for code copied from or modelled on existing code,
// that code on the target branch.
export const groupRangeSchema = lineRangeSchema.extend({
  note: z.string().trim().max(500).optional(),
  movedFrom: lineRangeSchema.optional(),
  reference: lineRangeSchema.optional(),
});
export type GroupRange = z.infer<typeof groupRangeSchema>;

export const groupInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(GROUP_KINDS),
  description: z.string().trim().max(5000).nullable().optional(),
  ranges: z.array(groupRangeSchema).min(1).max(500),
});

// A pull request's groups, from its agent or the server's model.
export const groupingAnswerSchema = z.object({
  groups: z.array(groupInputSchema),
  // The lines each prompt rule matched, as the agent judged them.
  rules: z
    .array(
      z.object({
        rule: z.string(),
        ranges: z.array(lineRangeSchema).max(500),
      }),
    )
    .max(100)
    .optional(),
});

export const pullRequestSummarySchema = z.object({
  id: z.string(),
  number: z.number(),
  repository: z.string(),
  title: z.string(),
  status: z.enum(PULL_REQUEST_STATUSES),
  branch: z.string(),
  targetBranch: z.string(),
  revision: z.number(),
  // Who splits it into groups: its agent, or the server's model.
  groupedBy: z.enum(["agent", "server"]),
  // An agent's session, or a GitHub pull request or branch.
  origin: z.enum(["agent", "github"]),
  agent: z
    .object({ name: z.string(), ownerName: z.string().nullable() })
    .nullable(),
  // Who opened one from GitHub.
  openedBy: z.string().nullable(),
  fileCount: z.number(),
  groupCount: z.number(),
  // How far you are through reviewing it; changes is null until someone
  // opens the pull request.
  review: z.object({ changes: z.number().nullable(), accepted: z.number() }),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type PullRequestSummary = z.infer<typeof pullRequestSummarySchema>;

export const pullRequestDetailSchema = pullRequestSummarySchema.extend({
  description: z.string().nullable(),
  baseCommit: z.string(),
  headCommit: z.string(),
  // Why the server could not group the current revision; it opened without
  // groups.
  processingError: z.string().nullable(),
  files: z.array(changedFileSchema),
  groups: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: z.string(),
      description: z.string().nullable(),
      ranges: z.array(groupRangeSchema),
    }),
  ),
  // The GitHub pull request for the same branch, once there is one.
  github: z
    .object({
      number: z.number(),
      url: z.string(),
      state: z.enum(GITHUB_PULL_STATES),
    })
    .nullable(),
  // How it was merged. One merged on GitHub may not say how or by whom.
  merge: z
    .object({
      method: z.enum(MERGE_METHODS).nullable(),
      commit: z.string().nullable(),
      by: z.string().nullable(),
      at: z.number().nullable(),
    })
    .nullable(),
});
export type PullRequestDetail = z.infer<typeof pullRequestDetailSchema>;

// A changed file before and after the pull request; a side is null when the
// file is added or deleted.
export const pullRequestFileSchema = changedFileContentsSchema;
export type PullRequestFileContents = z.infer<typeof pullRequestFileSchema>;

// A file on the pull request's target branch, named as a reference; version
// is null when the branch has no such file.
export const pullRequestReferenceSchema = z.object({
  path: z.string(),
  version: fileVersionSchema.nullable(),
});
export type PullRequestReference = z.infer<typeof pullRequestReferenceSchema>;

// A repository rule as it ran on this revision, the changes it matched, and
// for require-review whether each reviewer has accepted all of them.
export const reviewRuleSchema = z.object({
  id: z.string(),
  // The repository rule; null once it is deleted.
  ruleId: z.string().nullable(),
  name: z.string(),
  match: ruleMatchSchema,
  action: z.enum(RULE_ACTIONS),
  reviewers: z.array(
    z.object({ id: z.string(), name: z.string(), done: z.boolean() }),
  ),
  // For run-workflow: the workflow, and whether GitHub started it.
  workflow: ruleWorkflowSchema.nullable(),
  dispatch: z
    .object({
      status: z.enum(DISPATCH_STATUSES),
      error: z.string().nullable(),
    })
    .nullable(),
  files: z.array(z.object({ path: z.string(), keys: z.array(z.string()) })),
});
export type ReviewRule = z.infer<typeof reviewRuleSchema>;

// Every change in the pull request, file by file, and which ones you accepted.
// A change's `at` is the line group ranges find it by. `accepted` includes
// `auto`, the changes a rule accepted for you.
export const reviewSchema = z.object({
  revision: z.number(),
  files: z.array(
    z.object({
      path: z.string(),
      changes: z.array(z.object({ key: z.string(), at: z.number() })),
      accepted: z.array(z.string()),
      auto: z.array(z.string()),
    }),
  ),
  rules: z.array(reviewRuleSchema),
});
export type Review = z.infer<typeof reviewSchema>;

// The most changes one request accepts or undoes, and the most files; a
// client sends a larger selection in parts.
export const MAX_ACCEPT_CHANGES = 20_000;
export const MAX_ACCEPT_FILES = 1000;

export const pullRequestLinksSchema = z.object({
  url: z.string(),
  submitUrl: z.string(),
  refreshUrl: z.string(),
  commentsUrl: z.string(),
  // POST for a fresh chat key (see agentChatContract.listen).
  chatUrl: z.string(),
});

const createdPullRequestSchema = z.object({
  pullRequest: pullRequestDetailSchema,
  // What the agent does next. Null when the server groups the pull request:
  // it opens for review without the agent.
  grouping: z.object({ prompt: z.string(), submitUrl: z.string() }).nullable(),
  links: pullRequestLinksSchema,
});

// A new pull request comes with where its agent listens for chat.
const openedPullRequestSchema = createdPullRequestSchema.extend({
  chat: chatEndpointsSchema,
});

const bySession = z.object({ id: z.string() });

export const sessionsContract = {
  start: oc
    .route({ method: "POST", path: "/api/sessions" })
    .input(
      sessionDetailsSchema.extend({
        repository: z.string(),
        // What the agent is, such as "claude-code"; prompts tailor
        // themselves to it.
        client: z.string().trim().max(200).optional(),
      }),
    )
    .output(startedSessionSchema),
  get: oc
    .route({ method: "GET", path: "/api/sessions/{id}" })
    .input(bySession)
    .output(sessionSchema.extend({ links: sessionLinksSchema })),
  update: oc
    .route({ method: "PATCH", path: "/api/sessions/{id}" })
    .input(bySession.extend(sessionDetailsSchema.shape))
    .output(sessionSchema),
  token: oc
    .route({ method: "POST", path: "/api/sessions/{id}/token" })
    .input(bySession)
    .output(gitTokenSchema),
  end: oc
    .route({ method: "POST", path: "/api/sessions/{id}/end" })
    .input(bySession)
    .output(sessionSchema),
  createPullRequest: oc
    .route({ method: "POST", path: "/api/sessions/{id}/pull-requests" })
    .input(
      bySession.extend({
        branch: branchSchema,
        title: z.string().trim().min(1).max(200),
        description: markdown(50_000),
      }),
    )
    .output(openedPullRequestSchema),
};

const byRepository = z.object({ name: z.string() });
const byNumber = byRepository.extend({
  number: z.coerce.number<number>().int().min(1),
});

export const pullRequestsContract = {
  list: oc
    .route({ method: "GET", path: "/api/repositories/{name}/pull-requests" })
    .input(byRepository)
    .output(z.array(pullRequestSummarySchema)),
  get: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/pull-requests/{number}",
    })
    .input(
      byRepository.extend({ number: z.coerce.number<number>().int().min(1) }),
    )
    .output(pullRequestDetailSchema),
  file: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/pull-requests/{number}/file",
    })
    .input(
      byRepository.extend({
        number: z.coerce.number<number>().int().min(1),
        path: z.string().min(1).max(1000),
      }),
    )
    .output(pullRequestFileSchema),
  reference: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/pull-requests/{number}/reference",
    })
    .input(
      byRepository.extend({
        number: z.coerce.number<number>().int().min(1),
        path: z.string().min(1).max(1000),
      }),
    )
    .output(pullRequestReferenceSchema),
  review: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/pull-requests/{number}/review",
    })
    .input(
      byRepository.extend({ number: z.coerce.number<number>().int().min(1) }),
    )
    .output(reviewSchema),
  accept: oc
    .route({
      method: "PUT",
      path: "/api/repositories/{name}/pull-requests/{number}/review",
    })
    .input(
      byRepository.extend({
        number: z.coerce.number<number>().int().min(1),
        accepted: z.boolean(),
        changes: z
          .array(
            z.object({
              path: z.string().min(1).max(1000),
              keys: z.array(z.string().min(1).max(40)).min(1),
            }),
          )
          .min(1)
          .max(MAX_ACCEPT_FILES)
          .refine(
            (files) =>
              files.reduce((n, f) => n + f.keys.length, 0) <=
              MAX_ACCEPT_CHANGES,
            `Accept at most ${MAX_ACCEPT_CHANGES} changes at once`,
          ),
      }),
    )
    .output(reviewSchema),
  // Links the GitHub pull request for the branch if there is one, and reads
  // its checks and workflow runs.
  github: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/pull-requests/{number}/github",
    })
    .input(byNumber)
    .output(githubPullStatusSchema),
  // Pushes the reviewed head to GitHub and opens a pull request there.
  createInGithub: oc
    .route({
      method: "POST",
      path: "/api/repositories/{name}/pull-requests/{number}/github",
    })
    .input(byNumber)
    .output(ok),
  // On GitHub when the repository is connected, else in this instance.
  merge: oc
    .route({
      method: "POST",
      path: "/api/repositories/{name}/pull-requests/{number}/merge",
    })
    .input(byNumber.extend({ method: z.enum(MERGE_METHODS) }))
    .output(pullRequestDetailSchema),
  submitGroups: oc
    .route({ method: "PUT", path: "/api/pull-requests/{id}/groups" })
    .input(groupingAnswerSchema.extend({ id: z.string() }))
    .output(pullRequestDetailSchema),
  refresh: oc
    .route({ method: "POST", path: "/api/pull-requests/{id}/refresh" })
    .input(z.object({ id: z.string() }))
    .output(createdPullRequestSchema),
};

// An open GitHub pull request a pull request can be opened from.
export const githubPullOptionSchema = z.object({
  number: z.number(),
  title: z.string(),
  branch: z.string(),
  targetBranch: z.string(),
  url: z.string(),
  author: z.string().nullable(),
});
export type GithubPullOption = z.infer<typeof githubPullOptionSchema>;

const branchNameSchema = z.string().trim().min(1).max(250);

export const openFromGithubSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pull"), number: z.number().int().positive() }),
  z.object({
    kind: z.literal("branch"),
    branch: branchNameSchema,
    targetBranch: branchNameSchema,
    title: z.string().trim().min(1).max(300),
  }),
]);
export type OpenFromGithubSource = z.infer<typeof openFromGithubSourceSchema>;

// Pull requests opened from a GitHub pull request or branch rather than by an
// agent; the server groups them.
export const pullRequestsFromGithubContract = {
  // Whether the caller can open one here: the repository is connected to
  // GitHub, the server groups pull requests, and they have Write.
  available: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/pull-requests/from-github",
    })
    .input(byRepository)
    .output(z.object({ available: z.boolean() })),
  // The open GitHub pull requests from the repository's own branches that no
  // pull request here stands for yet.
  pulls: oc
    .route({
      method: "GET",
      path: "/api/repositories/{name}/pull-requests/from-github/pulls",
    })
    .input(byRepository)
    .output(z.array(githubPullOptionSchema)),
  open: oc
    .route({
      method: "POST",
      path: "/api/repositories/{name}/pull-requests/from-github",
    })
    .input(byRepository.extend({ source: openFromGithubSourceSchema }))
    .output(pullRequestDetailSchema),
};

// A prompt agents or the server's model get that an admin can replace: the
// session prompt, or the processing prompt.
export const agentPromptSchema = z.object({
  prompt: z.string(),
  isDefault: z.boolean(),
  defaultPrompt: z.string(),
  updatedAt: z.number().nullable(),
  // Every {{placeholder}} the prompt may use, with what it is replaced by.
  placeholders: z.array(z.object({ name: z.string(), meaning: z.string() })),
  // Every condition {{#if name}}…{{else}}…{{/if}} may test, with its meaning.
  conditions: z.array(z.object({ name: z.string(), meaning: z.string() })),
});
export type AgentPrompt = z.infer<typeof agentPromptSchema>;

const promptInput = z.object({ prompt: z.string().trim().min(1).max(50_000) });

// get, set and restoreDefault for the prompt stored under a settings path.
function promptContract(path: `/${string}`) {
  return {
    get: oc.route({ method: "GET", path }).output(agentPromptSchema),
    set: oc
      .route({ method: "PUT", path })
      .input(promptInput)
      .output(agentPromptSchema),
    restoreDefault: oc
      .route({ method: "DELETE", path })
      .output(agentPromptSchema),
  };
}

export const PROCESSING_MODES = ["agent", "server"] as const;

// The prompt that processes a pull request, as one way of processing sees it:
// its default and placeholders are that way's.
const byMode = z.object({ mode: z.enum(PROCESSING_MODES) });

function processingPromptContract(path: `/${string}`) {
  return {
    get: oc
      .route({ method: "GET", path })
      .input(byMode)
      .output(agentPromptSchema),
    set: oc
      .route({ method: "PUT", path })
      .input(byMode.extend(promptInput.shape))
      .output(agentPromptSchema),
    restoreDefault: oc
      .route({ method: "DELETE", path })
      .input(byMode)
      .output(agentPromptSchema),
  };
}

// The most a transcript limit may be: well past what fits a model's context.
export const MAX_TRANSCRIPT_WORDS = 500_000;

export const agentConfigInputSchema = z.object({
  // Who groups a new pull request: its agent, or the model on the server.
  processing: z.enum(PROCESSING_MODES),
  model: z
    .string()
    .trim()
    .min(1, "Name a model")
    .max(200)
    .regex(/^[\w@./:-]+$/, "A model id like @cf/zai-org/glm-5.3-flash"),
  gateway: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9-]*$/, "Lowercase letters, digits and dashes")
    .transform((id) => id || null)
    .nullable(),
  // The latest words of the agent's transcripts a prompt carries; 0 sends
  // none.
  maxTranscriptWords: z
    .number({ error: "A number of words" })
    .int("A whole number of words")
    .min(0, "0 sends no transcripts")
    .max(MAX_TRANSCRIPT_WORDS, `At most ${MAX_TRANSCRIPT_WORDS} words`),
});
export type AgentConfigInput = z.input<typeof agentConfigInputSchema>;

export const modelTestSchema = z.object({
  ok: z.boolean(),
  model: z.string(),
  // The gateway the call went through.
  gateway: z.string(),
  ms: z.number(),
  error: z.string().nullable(),
  testedAt: z.number(),
});
export type ModelTest = z.infer<typeof modelTestSchema>;

export const agentConfigSchema = z.object({
  processing: z.enum(PROCESSING_MODES),
  model: z.string(),
  gateway: z.string().nullable(),
  maxTranscriptWords: z.number(),
  defaultModel: z.string(),
  // The gateway used while `gateway` is null.
  defaultGateway: z.string(),
  defaultMaxTranscriptWords: z.number(),
  updatedAt: z.number().nullable(),
  // Whether this deployment has the bindings to group on the server; without
  // them agents group their own pull requests whatever processing says.
  serverAvailable: z.boolean(),
  lastTest: modelTestSchema.nullable(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const modelOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type ModelOption = z.infer<typeof modelOptionSchema>;

export const adminContract = {
  agentConfig: {
    get: oc
      .route({ method: "GET", path: "/api/admin/settings/agent-config" })
      .output(agentConfigSchema),
    set: oc
      .route({ method: "PUT", path: "/api/admin/settings/agent-config" })
      .input(agentConfigInputSchema)
      .output(agentConfigSchema),
    // Asks a model for a one-line answer, before or after it is saved.
    testModel: oc
      .route({ method: "POST", path: "/api/admin/settings/agent-config/test" })
      .input(agentConfigInputSchema.pick({ model: true, gateway: true }))
      .output(modelTestSchema),
    // Up to five Workers AI models whose names hold every word of `query`.
    searchModels: oc
      .route({ method: "GET", path: "/api/admin/settings/agent-config/models" })
      .input(z.object({ query: z.string().trim().max(100) }))
      .output(z.array(modelOptionSchema)),
  },
  processingPrompt: processingPromptContract(
    "/api/admin/settings/processing-prompt",
  ),
  sessionPrompt: promptContract("/api/admin/settings/session-prompt"),
};

export { ok as okSchema };
