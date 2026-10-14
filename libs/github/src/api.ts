import { z } from "zod";
import { moduleLogger } from "@lib/logging";
import {
  artifactSchema,
  checkRunSchema,
  commitStatusSchema,
  githubRepoSchema,
  githubUserSchema,
  hookSchema,
  jobSchema,
  mergeResultSchema,
  pullSchema,
  repoListingSchema,
  workflowRunSchema,
  workflowSchema,
} from "./payloads";

const log = moduleLogger("github/api");

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const REPOSITORY_PAGES = 3;

export type GithubErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "UNAVAILABLE";

// A refusal from GitHub, or from this integration about GitHub, shown to the
// caller as is.
export class GithubError extends Error {
  constructor(
    readonly code: GithubErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

// What a token tells GitHub about itself when it is first used.
export interface TokenIdentity {
  login: string;
  scopes: string | null;
  expiresAt: Date | null;
}

// The REST calls the integration makes, each with the one token it was built
// with.
export function githubApi(token: string) {
  const call = (path: string, init: RequestInit = {}) =>
    request(token, path, init);
  return {
    async identity(): Promise<TokenIdentity> {
      const response = await call("/user");
      const { login } = githubUserSchema.parse(await response.json());
      return {
        login,
        scopes: response.headers.get("x-oauth-scopes"),
        expiresAt: parseExpiry(
          response.headers.get("github-authentication-token-expiration"),
        ),
      };
    },

    async repository(owner: string, repo: string) {
      const response = await call(`/repos/${owner}/${repo}`);
      return githubRepoSchema.parse(await response.json());
    },

    // The repositories the token can see, most recently pushed first. A
    // fine-grained token sees only the ones it was given.
    async repositories() {
      const listed: z.infer<typeof repoListingSchema>[] = [];
      for (let page = 1; page <= REPOSITORY_PAGES; page++) {
        const response = await call(
          `/user/repos?per_page=100&sort=pushed&page=${page}`,
        );
        const batch = z.array(repoListingSchema).parse(await response.json());
        listed.push(...batch);
        if (batch.length < 100) {
          break;
        }
      }
      return listed;
    },

    // Readable only with permission to manage the repository's hooks.
    async hooks(owner: string, repo: string) {
      const response = await call(`/repos/${owner}/${repo}/hooks?per_page=100`);
      return z.array(hookSchema).parse(await response.json());
    },

    async createHook(
      owner: string,
      repo: string,
      config: { url: string; secret: string; events: string[] },
    ): Promise<number> {
      const response = await call(`/repos/${owner}/${repo}/hooks`, {
        method: "POST",
        body: JSON.stringify({
          name: "web",
          active: true,
          events: config.events,
          config: {
            url: config.url,
            secret: config.secret,
            content_type: "json",
            insecure_ssl: "0",
          },
        }),
      });
      return hookSchema.parse(await response.json()).id;
    },

    async updateHookEvents(
      owner: string,
      repo: string,
      hookId: number,
      events: string[],
    ) {
      await call(`/repos/${owner}/${repo}/hooks/${hookId}`, {
        method: "PATCH",
        body: JSON.stringify({ events }),
      });
    },

    async deleteHook(owner: string, repo: string, hookId: number) {
      await call(`/repos/${owner}/${repo}/hooks/${hookId}`, {
        method: "DELETE",
      });
    },

    async workflowRuns(owner: string, repo: string, perPage: number) {
      const response = await call(
        `/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`,
      );
      return z
        .object({ workflow_runs: z.array(workflowRunSchema) })
        .parse(await response.json()).workflow_runs;
    },

    async workflowRunsAt(owner: string, repo: string, sha: string) {
      const response = await call(
        `/repos/${owner}/${repo}/actions/runs?head_sha=${sha}&per_page=100`,
      );
      return z
        .object({ workflow_runs: z.array(workflowRunSchema) })
        .parse(await response.json()).workflow_runs;
    },

    async workflows(owner: string, repo: string) {
      const response = await call(
        `/repos/${owner}/${repo}/actions/workflows?per_page=100`,
      );
      return z
        .object({ workflows: z.array(workflowSchema) })
        .parse(await response.json()).workflows;
    },

    // Starts a workflow that has a workflow_dispatch trigger, on a branch.
    async dispatchWorkflow(
      owner: string,
      repo: string,
      workflowId: number,
      ref: string,
    ) {
      await call(
        `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        { method: "POST", body: JSON.stringify({ ref }) },
      );
    },

    async pull(owner: string, repo: string, number: number) {
      const response = await call(`/repos/${owner}/${repo}/pulls/${number}`);
      return pullSchema.parse(await response.json());
    },

    // The open pull requests, newest first.
    async openPulls(owner: string, repo: string) {
      const response = await call(
        `/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
      );
      return z.array(pullSchema).parse(await response.json());
    },

    // The pull requests from a branch of the repository itself, newest first.
    async pullsFrom(owner: string, repo: string, branch: string) {
      const head = encodeURIComponent(`${owner}:${branch}`);
      const response = await call(
        `/repos/${owner}/${repo}/pulls?head=${head}&state=all&per_page=20`,
      );
      return z.array(pullSchema).parse(await response.json());
    },

    async createPull(
      owner: string,
      repo: string,
      pull: { title: string; body: string; head: string; base: string },
    ) {
      const response = await call(`/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        body: JSON.stringify(pull),
      });
      return pullSchema.parse(await response.json());
    },

    // `sha` makes GitHub refuse if the branch moved past what was reviewed.
    async mergePull(
      owner: string,
      repo: string,
      number: number,
      merge: {
        method: "merge" | "squash" | "rebase";
        sha: string;
        title: string;
        message: string;
      },
    ) {
      const response = await call(
        `/repos/${owner}/${repo}/pulls/${number}/merge`,
        {
          method: "PUT",
          body: JSON.stringify({
            merge_method: merge.method,
            sha: merge.sha,
            ...(merge.method === "rebase"
              ? {}
              : { commit_title: merge.title, commit_message: merge.message }),
          }),
        },
      );
      return mergeResultSchema.parse(await response.json());
    },

    async checkRuns(owner: string, repo: string, sha: string) {
      const response = await call(
        `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`,
      );
      return z
        .object({ check_runs: z.array(checkRunSchema) })
        .parse(await response.json()).check_runs;
    },

    async statuses(owner: string, repo: string, sha: string) {
      const response = await call(
        `/repos/${owner}/${repo}/commits/${sha}/status?per_page=100`,
      );
      return z
        .object({ statuses: z.array(commitStatusSchema) })
        .parse(await response.json()).statuses;
    },

    async jobs(owner: string, repo: string, runId: number) {
      const response = await call(
        `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`,
      );
      return z.object({ jobs: z.array(jobSchema) }).parse(await response.json())
        .jobs;
    },

    async artifacts(owner: string, repo: string, runId: number) {
      const response = await call(
        `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`,
      );
      return z
        .object({ artifacts: z.array(artifactSchema) })
        .parse(await response.json()).artifacts;
    },

    // GitHub answers a download with a redirect to a URL that works without
    // the token for about a minute; that URL is what the caller gets.
    async artifactDownloadUrl(owner: string, repo: string, artifactId: number) {
      return redirectTarget(
        await call(
          `/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`,
          { redirect: "manual" },
        ),
      );
    },

    async jobLogsUrl(owner: string, repo: string, jobId: number) {
      return redirectTarget(
        await call(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
          redirect: "manual",
        }),
      );
    },
  };
}

export type GithubApi = ReturnType<typeof githubApi>;

// Git over HTTPS takes a token as the Basic password, whatever the user.
export function gitRemote(token: string, owner: string, repo: string) {
  return {
    url: `https://github.com/${owner}/${repo}.git`,
    authorization: `Basic ${btoa(`x-access-token:${token}`)}`,
  };
}

async function request(
  token: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": API_VERSION,
        "user-agent": "iron-garden",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch (err) {
    log.error("github unreachable", { path: pathOnly(path), err });
    throw new GithubError("UNAVAILABLE", "GitHub could not be reached");
  }
  if (response.ok || (init.redirect === "manual" && isRedirect(response))) {
    return response;
  }
  const message = await errorMessage(response);
  log.warning("github refused a request", {
    path: pathOnly(path),
    status: response.status,
    message,
  });
  throw toError(response.status, message);
}

function toError(status: number, message: string): GithubError {
  switch (status) {
    case 401:
      return new GithubError(
        "UNAUTHORIZED",
        "GitHub rejected the token: it may be revoked or expired",
      );
    case 403:
      return new GithubError(
        "FORBIDDEN",
        `GitHub refused: ${message}. Check the token's permissions.`,
      );
    case 404:
      return new GithubError(
        "NOT_FOUND",
        "GitHub found nothing there, or the token cannot see it",
      );
    case 410:
      return new GithubError("NOT_FOUND", `GitHub: ${message}`);
    case 405:
    case 409:
      return new GithubError("CONFLICT", `GitHub: ${message}`);
    case 422:
      return new GithubError("BAD_REQUEST", `GitHub: ${message}`);
  }
  return new GithubError(
    "UNAVAILABLE",
    `GitHub failed (${status}): ${message}`,
  );
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      errors?: { message?: string }[];
    };
    const detail = parsed.errors?.find((e) => e.message)?.message;
    return [parsed.message, detail].filter(Boolean).join(": ") || body;
  } catch {
    return body.slice(0, 200);
  }
}

function redirectTarget(response: Response): string {
  const location = response.headers.get("location");
  if (!location) {
    throw new GithubError("UNAVAILABLE", "GitHub gave no download location");
  }
  return location;
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

// "2026-11-01 00:00:00 UTC"
function parseExpiry(header: string | null): Date | null {
  if (!header) {
    return null;
  }
  const time = Date.parse(header.replace(" UTC", "Z").replace(" ", "T"));
  return Number.isNaN(time) ? null : new Date(time);
}

function pathOnly(path: string): string {
  return path.split("?")[0]!;
}
