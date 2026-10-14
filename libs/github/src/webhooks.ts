import { ZodError } from "zod";
import { getDb, githubConnections, eq } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";
import { verifySignature } from "./crypto";
import {
  pullRequestEventSchema,
  pushEventSchema,
  workflowRunEventSchema,
} from "./payloads";
import { applyPullRequestEvent, branchDeletedOnGithub } from "./pulls";
import { recordRun } from "./runs";
import { unseal } from "./secrets";
import { syncConnection, type ConnectionRow } from "./sync";

const log = moduleLogger("github/webhooks");

const BRANCH_REF = "refs/heads/";

export interface WebhookOutcome {
  status: number;
  message: string;
  // Work to finish after answering: GitHub gives a delivery ten seconds.
  followUp?: () => Promise<void>;
}

// One delivery to a connection's hook. Only a body signed with that
// connection's secret is acted on. A push is a hint to sync its branch from
// GitHub, never a source of commits, so a replayed delivery changes nothing.
export async function receiveGithubWebhook(
  connectionId: string,
  headers: Headers,
  body: Uint8Array,
): Promise<WebhookOutcome> {
  const connection = await connectionById(connectionId);
  if (!connection) {
    log.info("webhook for unknown connection", { connectionId });
    return { status: 404, message: "No such hook" };
  }
  const secret = await unseal(connection.webhookSecretCiphertext);
  if (
    !(await verifySignature(secret, body, headers.get("x-hub-signature-256")))
  ) {
    log.warning("webhook signature rejected", { connectionId });
    return { status: 401, message: "Bad signature" };
  }
  await markDelivered(connectionId);
  const event = headers.get("x-github-event") ?? "";
  log.info("webhook received", {
    connectionId,
    event,
    deliveryId: headers.get("x-github-delivery"),
  });
  try {
    return await handleEvent(
      connection,
      event,
      JSON.parse(new TextDecoder().decode(body)),
    );
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof ZodError) {
      log.warning("webhook payload unreadable", { connectionId, event, err });
      return { status: 400, message: "Unreadable payload" };
    }
    throw err;
  }
}

async function handleEvent(
  connection: ConnectionRow,
  event: string,
  payload: unknown,
): Promise<WebhookOutcome> {
  switch (event) {
    case "ping":
      return { status: 200, message: "pong" };
    case "push":
      return onPush(connection, payload);
    case "workflow_run":
      return onWorkflowRun(connection, payload);
    case "pull_request":
      return onPullRequest(connection, payload);
  }
  log.info("webhook event ignored", { connectionId: connection.id, event });
  return { status: 202, message: `Ignored ${event}` };
}

function onPush(connection: ConnectionRow, payload: unknown): WebhookOutcome {
  const push = pushEventSchema.parse(payload);
  if (
    !push.ref.startsWith(BRANCH_REF) ||
    !mirrors(connection, push.repository.full_name)
  ) {
    log.info("push ignored", { connectionId: connection.id, ref: push.ref });
    return { status: 202, message: "Not a branch of the mirrored repository" };
  }
  const branch = push.ref.slice(BRANCH_REF.length);
  return {
    status: 202,
    message: `Syncing ${branch}`,
    followUp: async () => {
      await syncConnection(connection, [branch]);
      if (push.deleted) {
        await branchDeletedOnGithub(connection, branch);
      }
    },
  };
}

async function onPullRequest(
  connection: ConnectionRow,
  payload: unknown,
): Promise<WebhookOutcome> {
  const {
    action,
    pull_request: pull,
    repository,
  } = pullRequestEventSchema.parse(payload);
  if (!mirrors(connection, repository.full_name)) {
    log.info("pull request event ignored", { connectionId: connection.id });
    return { status: 202, message: "Not the mirrored repository" };
  }
  const followUp = await applyPullRequestEvent(connection, action, pull);
  return {
    status: 200,
    message: `Applied ${action}`,
    ...(followUp ? { followUp } : {}),
  };
}

async function onWorkflowRun(
  connection: ConnectionRow,
  payload: unknown,
): Promise<WebhookOutcome> {
  const { workflow_run: run, repository } =
    workflowRunEventSchema.parse(payload);
  if (!mirrors(connection, repository.full_name)) {
    log.info("workflow run ignored", { connectionId: connection.id });
    return { status: 202, message: "Not the mirrored repository" };
  }
  await recordRun(connection.repositoryId, run);
  log.info("workflow run recorded", {
    connectionId: connection.id,
    runId: run.id,
    status: run.status,
  });
  return { status: 200, message: "Recorded" };
}

function mirrors(connection: ConnectionRow, fullName: string): boolean {
  return (
    fullName.toLowerCase() ===
    `${connection.owner}/${connection.repo}`.toLowerCase()
  );
}

async function markDelivered(connectionId: string): Promise<void> {
  await getDb()
    .update(githubConnections)
    .set({ webhookDeliveredAt: new Date() })
    .where(eq(githubConnections.id, connectionId));
}

async function connectionById(id: string): Promise<ConnectionRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.id, id));
  return row;
}
