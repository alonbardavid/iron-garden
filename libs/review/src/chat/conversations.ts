import {
  agents,
  agentSessions,
  and,
  chatChannels,
  chatMessages,
  eq,
  getDb,
  isNull,
  newEntityId,
  type ChatContextRow,
} from "@lib/db-models";
import {
  AD_HOC_CHANNEL,
  AD_HOC_NAME,
  CHAT_LIVE_MS,
  type ChatAgent,
} from "@lib/contract";
import { enqueueJob, groupsOnServer } from "@lib/ai";
import { ForgeError, requireUser } from "@lib/forge";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { pullRequestByNumber } from "../lookup";
import { channelById, type OpenChannel } from "./channels";
import { agentPoll } from "./listening";
import { presentMessages, type ChatMessage } from "./present";
import { relay } from "./relay";

const log = moduleLogger("review/chat/conversations");

type MessageRow = typeof chatMessages.$inferSelect;

export interface ChatInput {
  body: string;
  context?: ChatContextRow;
}

// Your agents listening on a pull request, for you to pick one, and the ad
// hoc channel while the server answers there. Nobody talks to someone else's
// agent.
export async function listChatAgents(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<ChatAgent[]> {
  requireUser(principal);
  const { row: pr } = await pullRequestByNumber(
    principal,
    repositoryName,
    number,
  );
  const [open, adHoc] = await Promise.all([
    listeningOn(pr.id, principal.userId),
    groupsOnServer(),
  ]);
  const now = Date.now();
  const agents = open.map(({ channel, agent }) => ({
    channel: channel.id,
    agent: { id: agent.id, name: agent.name },
    madeThis: agent.id === pr.agentId,
    adHoc: false,
    live:
      channel.lastSeenAt !== null &&
      now - channel.lastSeenAt.getTime() < CHAT_LIVE_MS,
    lastSeenAt: channel.lastSeenAt?.getTime() ?? null,
  }));
  return adHoc ? [...agents, AD_HOC_AGENT] : agents;
}

// The server, answering on the ad hoc channel: always there while it does.
const AD_HOC_AGENT: ChatAgent = {
  channel: AD_HOC_CHANNEL,
  agent: { id: AD_HOC_CHANNEL, name: AD_HOC_NAME },
  madeThis: false,
  adHoc: true,
  live: true,
  lastSeenAt: null,
};

// Your conversation with one agent on the pull request, oldest first.
export async function listChatMessages(
  principal: Principal,
  repositoryName: string,
  number: number,
  channelId: string,
): Promise<ChatMessage[]> {
  const { channel } = await channelOf(
    principal,
    repositoryName,
    number,
    channelId,
  );
  if (!channel) {
    return [];
  }
  const rows = await getDb()
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.channelId, channel.id),
        eq(chatMessages.userId, principal.userId),
      ),
    )
    .orderBy(chatMessages.createdAt);
  return presentMessages(channel.agentId, rows);
}

// A person's message to a listening agent. It reaches an open socket at
// once, and the agent's next poll otherwise.
export async function sendChatMessage(
  principal: Principal,
  repositoryName: string,
  number: number,
  channelId: string,
  input: ChatInput,
): Promise<ChatMessage> {
  if (channelId === AD_HOC_CHANNEL) {
    return askAdHoc(principal, repositoryName, number, input);
  }
  const { channel } = await channelOf(
    principal,
    repositoryName,
    number,
    channelId,
  );
  const open = await channelById(channel!.id);
  const row = await deliver(
    open,
    await insertPersonMessage(open, principal, input),
  );
  log.info("chat message sent", {
    channelId: channel!.id,
    messageId: row.id,
    delivered: row.deliveredAt !== null,
    page: input.context?.page,
  });
  return (await presentMessages(channel!.agentId, [row]))[0]!;
}

// A question to the server on the ad hoc channel: stored, then answered by
// the pull request's processor in the background.
async function askAdHoc(
  principal: Principal,
  repositoryName: string,
  number: number,
  input: ChatInput,
): Promise<ChatMessage> {
  requireUser(principal);
  const { row: pr } = await pullRequestByNumber(
    principal,
    repositoryName,
    number,
  );
  if (!(await groupsOnServer())) {
    log.info("ad hoc question refused: the server does not answer");
    throw new ForgeError(
      "BAD_REQUEST",
      "Ad hoc questions are answered only while this server processes pull requests",
    );
  }
  const channelId = await adHocChannelId(pr.id);
  const [row] = await getDb()
    .insert(chatMessages)
    .values({
      id: newEntityId("CHAT_MESSAGE"),
      channelId,
      userId: principal.userId,
      sender: "person",
      body: input.body,
      context: input.context ?? null,
    })
    .returning();
  await enqueueJob({
    kind: "answer-chat",
    pullRequestId: pr.id,
    messageId: row!.id,
  });
  log.info("ad hoc question asked", {
    channelId,
    messageId: row!.id,
    page: input.context?.page,
  });
  return (await presentMessages(null, [row!]))[0]!;
}

// The pull request's ad hoc channel, made the first time someone asks.
async function adHocChannelId(pullRequestId: string): Promise<string> {
  const existing = await adHocChannelOf(pullRequestId);
  if (existing) {
    return existing.id;
  }
  await getDb()
    .insert(chatChannels)
    .values({ id: newEntityId("CHAT_CHANNEL"), pullRequestId })
    .onConflictDoNothing();
  return (await adHocChannelOf(pullRequestId))!.id;
}

async function adHocChannelOf(pullRequestId: string) {
  const [channel] = await getDb()
    .select()
    .from(chatChannels)
    .where(
      and(
        eq(chatChannels.pullRequestId, pullRequestId),
        isNull(chatChannels.agentId),
      ),
    );
  return channel ?? null;
}

// Takes back a message the agent has not had yet.
export async function deleteChatMessage(
  principal: Principal,
  repositoryName: string,
  number: number,
  channelId: string,
  messageId: string,
): Promise<void> {
  const { channel } = await channelOf(
    principal,
    repositoryName,
    number,
    channelId,
  );
  const deleted = await getDb()
    .delete(chatMessages)
    .where(
      and(
        eq(chatMessages.id, messageId),
        eq(chatMessages.channelId, channel?.id ?? ""),
        eq(chatMessages.userId, principal.userId),
        eq(chatMessages.sender, "person"),
        isNull(chatMessages.deliveredAt),
      ),
    )
    .returning({ id: chatMessages.id });
  if (deleted.length === 0) {
    log.info("chat message delete refused", { channelId, messageId });
    throw new ForgeError(
      "CONFLICT",
      "Only a message of yours the agent has not had yet can be deleted",
    );
  }
  log.info("chat message deleted", { channelId, messageId });
}

// One of your agents' channels on the pull request, or its ad hoc channel
// (null until someone first asks there).
async function channelOf(
  principal: Principal,
  repositoryName: string,
  number: number,
  channelId: string,
): Promise<{ channel: typeof chatChannels.$inferSelect | null }> {
  requireUser(principal);
  const { row: pr } = await pullRequestByNumber(
    principal,
    repositoryName,
    number,
  );
  if (channelId === AD_HOC_CHANNEL) {
    return { channel: await adHocChannelOf(pr.id) };
  }
  const [found] = await getDb()
    .select({ channel: chatChannels })
    .from(chatChannels)
    .innerJoin(agents, eq(agents.id, chatChannels.agentId))
    .where(
      and(
        eq(chatChannels.id, channelId),
        eq(chatChannels.pullRequestId, pr.id),
        eq(agents.ownerUserId, principal.userId),
      ),
    );
  if (!found) {
    throw new ForgeError("NOT_FOUND", "None of your agents listens here");
  }
  return { channel: found.channel };
}

// The owner's open channels whose agent is active and whose session, if any,
// is not over.
async function listeningOn(pullRequestId: string, ownerUserId: string) {
  const rows = await getDb()
    .select({
      channel: chatChannels,
      agent: { id: agents.id, name: agents.name, owner: agents.ownerUserId },
      sessionStatus: agentSessions.status,
    })
    .from(chatChannels)
    .innerJoin(agents, eq(agents.id, chatChannels.agentId))
    .leftJoin(agentSessions, eq(agentSessions.id, chatChannels.sessionId))
    .where(
      and(
        eq(chatChannels.pullRequestId, pullRequestId),
        eq(agents.ownerUserId, ownerUserId),
        isNull(chatChannels.closedAt),
        isNull(agents.deactivatedAt),
      ),
    )
    .orderBy(chatChannels.createdAt);
  return rows.filter((r) => r.sessionStatus !== "ended");
}

async function insertPersonMessage(
  channel: OpenChannel,
  principal: Principal,
  input: ChatInput,
): Promise<MessageRow> {
  const [row] = await getDb()
    .insert(chatMessages)
    .values({
      id: newEntityId("CHAT_MESSAGE"),
      channelId: channel.id,
      userId: principal.userId,
      sender: "person",
      body: input.body,
      context: input.context ?? null,
    })
    .returning();
  return row!;
}

// Hands the message to the agent's open sockets; a socket that got it counts
// as delivery.
async function deliver(
  channel: OpenChannel,
  row: MessageRow,
): Promise<MessageRow> {
  const sockets = await relay.notify(
    channel.id,
    await agentPoll(channel, [row]),
  );
  if (sockets === 0) {
    return row;
  }
  const [delivered] = await getDb()
    .update(chatMessages)
    .set({ deliveredAt: new Date() })
    .where(eq(chatMessages.id, row.id))
    .returning();
  return delivered!;
}
