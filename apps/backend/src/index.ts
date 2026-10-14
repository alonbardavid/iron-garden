import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ORPCError, onError } from "@orpc/server";
import { RequestHeadersPlugin } from "@orpc/server/plugins";
import { errorHandler, httpLogger } from "@lib/server-commons";
import { moduleLogger } from "@lib/logging";
import { getAuth } from "@lib/identity";
import { serveGit } from "@lib/forge";
import { receiveGithubWebhook } from "@lib/github";
import { health } from "./routes/health";
import { capabilities } from "./routes/capabilities";
import { setup } from "./routes/setup";
import { keys, me, users } from "./routes/account";
import { agents } from "./routes/agents";
import { repositories } from "./routes/repositories";
import { pullRequests, sessions } from "./routes/sessions";
import { transcripts } from "./routes/activity";
import { agentChat, chatSocket } from "./routes/chat";
import { admin } from "./routes/admin";
import { githubTokens } from "./routes/github";

// Server-side processing: its Durable Object, and the entrypoints its
// sandboxes are handed.
export {
  AnswerRepositoryEntrypoint,
  AnswerToolsEntrypoint,
  GroupingToolsEntrypoint,
  PullRequestProcessor,
  SessionRepositoryEntrypoint,
} from "./processing";

const log = moduleLogger("backend/index");

const apiHandler = new OpenAPIHandler(
  {
    capabilities,
    setup,
    me,
    users,
    keys,
    githubTokens,
    agents,
    repositories,
    sessions,
    pullRequests,
    chat: agentChat,
    transcripts,
    admin,
  },
  {
    plugins: [new RequestHeadersPlugin()],
    interceptors: [onError(logUnexpectedError)],
  },
);

const app = new Hono();

app.onError(errorHandler);

// First, so every line written while serving a request carries its context.
app.use("*", httpLogger);

app.on(["POST", "GET"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));

app.get("/api/health", health);

app.get("/api/chat/:key/socket", (c) =>
  chatSocket(c.req.param("key"), c.req.raw),
);

// GitHub signs each delivery over its raw body, so this stays outside oRPC.
app.post("/api/github/webhooks/:connectionId", async (c) => {
  const outcome = await receiveGithubWebhook(
    c.req.param("connectionId"),
    c.req.raw.headers,
    new Uint8Array(await c.req.arrayBuffer()),
  );
  if (outcome.followUp) {
    c.executionCtx.waitUntil(outcome.followUp());
  }
  return c.text(outcome.message, outcome.status as ContentfulStatusCode);
});

app.use("/api/*", async (c, next) => {
  const { matched, response } = await apiHandler.handle(c.req.raw, {
    context: { origin: new URL(c.req.url).origin },
  });
  return matched ? c.newResponse(response.body, response) : next();
});

// Git smart HTTP: /<name>.git/info/refs, /<name>.git/git-upload-pack, ...
app.on(["GET", "POST"], "/:repo{[a-z0-9-]+\\.git}/*", (c) => {
  const repo = c.req.param("repo");
  return serveGit(
    c.req.raw,
    repo.slice(0, -".git".length),
    c.req.path.slice(repo.length + 1),
  );
});

export default app;

// Durable Object classes are exported from the worker's main module.
export { ChatChannelObject } from "@lib/review";

// An ORPCError is an answer the handler meant to give; anything else is a bug.
function logUnexpectedError(error: unknown): void {
  if (error instanceof ORPCError && error.code !== "INTERNAL_SERVER_ERROR") {
    return;
  }
  log.error("request handler threw", { err: error });
}
