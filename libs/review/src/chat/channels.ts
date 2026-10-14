import {
  agents,
  agentSessions,
  chatChannels,
  eq,
  getDb,
  newEntityId,
  pullRequests,
  repositories,
  type SQL,
} from "@lib/db-models";
import type { ChatEndpoints } from "@lib/contract";
import { authorizeId, ForgeError } from "@lib/forge";
import type { AgentPrincipal, Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { hashChatKey, newChatKey } from "./keys";
import { relay } from "./relay";

const log = moduleLogger("review/chat/channels");

// The URLs an agent listens on, built around its key.
export type ChatEndpointsFor = (key: string) => ChatEndpoints;

export interface OpenChannel {
  id: string;
  agentId: string;
  lastSeenAt: Date | null;
  pullRequest: {
    id: string;
    number: number;
    title: string;
    repository: string;
  };
}

// Starts an agent listening on a pull request it can read, or gives it a new
// key there; the old key stops working and its sockets close.
export async function listen(
  principal: Principal,
  pullRequestId: string,
  endpointsFor: ChatEndpointsFor,
): Promise<ChatEndpoints> {
  const agent = requireListener(principal);
  const [row] = await getDb()
    .select()
    .from(pullRequests)
    .where(eq(pullRequests.id, pullRequestId));
  if (!row) {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  }
  await authorizeId(agent, row.repositoryId, "read");
  if (row.status !== "processing" && row.status !== "open") {
    throw new ForgeError(
      "GONE",
      `Pull request #${row.number} is ${row.status}`,
    );
  }
  return openChannel(agent.agentId, row.id, null, endpointsFor);
}

// A channel for the agent on the pull request. `sessionId` ties it to the
// session that opened the pull request: it closes when that session ends.
export async function openChannel(
  agentId: string,
  pullRequestId: string,
  sessionId: string | null,
  endpointsFor: ChatEndpointsFor,
): Promise<ChatEndpoints> {
  const key = newChatKey();
  const keyHash = await hashChatKey(key);
  const [channel] = await getDb()
    .insert(chatChannels)
    .values({
      id: newEntityId("CHAT_CHANNEL"),
      pullRequestId,
      agentId,
      sessionId,
      keyHash,
    })
    .onConflictDoUpdate({
      target: [chatChannels.pullRequestId, chatChannels.agentId],
      set: { keyHash, sessionId, closedAt: null },
    })
    .returning({ id: chatChannels.id });
  // Sockets opened with the replaced key.
  await relay.close(channel!.id, "The chat key was replaced");
  log.info("chat channel opened", {
    channelId: channel!.id,
    pullRequestId,
    agentId,
    bySession: sessionId !== null,
  });
  return endpointsFor(key);
}

// The open channel a key belongs to. A closed one is gone for good: the
// agent should stop listening.
export async function channelByKey(key: string): Promise<OpenChannel> {
  const channel = await findChannel(
    eq(chatChannels.keyHash, await hashChatKey(key)),
  );
  if (!channel) {
    log.info("chat key unknown");
    throw new ForgeError(
      "NOT_FOUND",
      "No chat listens at this key: it was replaced or never existed. POST the pull request's links.chatUrl for new chat URLs",
    );
  }
  return channel;
}

export async function channelById(id: string): Promise<OpenChannel> {
  const channel = await findChannel(eq(chatChannels.id, id));
  if (!channel) {
    throw new ForgeError("NOT_FOUND", "Chat not found");
  }
  return channel;
}

export async function closeChannel(key: string): Promise<void> {
  const channel = await channelByKey(key);
  await getDb()
    .update(chatChannels)
    .set({ closedAt: new Date() })
    .where(eq(chatChannels.id, channel.id));
  await relay.close(channel.id, "The agent stopped listening");
  log.info("chat channel closed", { channelId: channel.id });
}

// The agent is still there: it polled, replied or holds a socket open.
export async function touchChannel(channelId: string): Promise<void> {
  await getDb()
    .update(chatChannels)
    .set({ lastSeenAt: new Date() })
    .where(eq(chatChannels.id, channelId));
}

function requireListener(principal: Principal): AgentPrincipal {
  if (principal.kind !== "agent") {
    throw new ForgeError(
      "FORBIDDEN",
      "Agents listen for chat with their API key; people chat on the pull request's page",
    );
  }
  return principal;
}

async function findChannel(where: SQL): Promise<OpenChannel | null> {
  const [found] = await getDb()
    .select({
      channel: chatChannels,
      pullRequest: {
        id: pullRequests.id,
        number: pullRequests.number,
        title: pullRequests.title,
        status: pullRequests.status,
      },
      repository: repositories.name,
      agentId: agents.id,
      sessionStatus: agentSessions.status,
      agentDeactivatedAt: agents.deactivatedAt,
    })
    .from(chatChannels)
    .innerJoin(pullRequests, eq(pullRequests.id, chatChannels.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .innerJoin(agents, eq(agents.id, chatChannels.agentId))
    .leftJoin(agentSessions, eq(agentSessions.id, chatChannels.sessionId))
    .where(where);
  if (!found) {
    return null;
  }
  const closed = closedBecause(found);
  if (closed) {
    log.info("chat channel refused", {
      channelId: found.channel.id,
      reason: closed,
    });
    throw new ForgeError("GONE", closed);
  }
  return {
    id: found.channel.id,
    agentId: found.agentId,
    lastSeenAt: found.channel.lastSeenAt,
    pullRequest: {
      id: found.pullRequest.id,
      number: found.pullRequest.number,
      title: found.pullRequest.title,
      repository: found.repository,
    },
  };
}

function closedBecause(found: {
  channel: { closedAt: Date | null };
  pullRequest: { number: number; status: string };
  sessionStatus: string | null;
  agentDeactivatedAt: Date | null;
}): string | null {
  if (found.channel.closedAt) {
    return "This chat was closed";
  }
  if (found.agentDeactivatedAt) {
    return "The agent was deactivated";
  }
  if (found.sessionStatus === "ended") {
    return "The session that opened the pull request ended";
  }
  const { number, status } = found.pullRequest;
  return status === "processing" || status === "open"
    ? null
    : `Pull request #${number} is ${status}`;
}
