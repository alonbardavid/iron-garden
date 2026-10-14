import {
  and,
  chatMessages,
  desc,
  eq,
  getDb,
  isNull,
  newEntityId,
} from "@lib/db-models";
import type { AgentChatMessage, ChatPoll } from "@lib/contract";
import { ForgeError } from "@lib/forge";
import { getUserProfiles } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import {
  channelById,
  channelByKey,
  touchChannel,
  type OpenChannel,
} from "./channels";
import { presentMessages, type ChatMessage } from "./present";
import { relay } from "./relay";

const log = moduleLogger("review/chat/listening");

export interface AgentReply {
  body: string;
  replyTo?: string;
}

type MessageRow = typeof chatMessages.$inferSelect;

// What people wrote to the agent since it last asked, at once: the agent
// polls again on its own schedule.
export async function pollChat(key: string): Promise<ChatPoll> {
  const channel = await channelByKey(key);
  await touchChannel(channel.id);
  return takeUndelivered(channel);
}

export async function replyInChat(
  key: string,
  reply: AgentReply,
): Promise<ChatMessage> {
  return replyOnChannel(await channelByKey(key), reply);
}

export async function workingInChat(
  key: string,
  replyTo?: string,
): Promise<void> {
  await markWorking(await channelByKey(key), replyTo);
}

// A socket opened on the channel's object, once the key is good.
export async function openChatSocket(
  key: string,
  request: Request,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const channel = await channelByKey(key);
  await touchChannel(channel.id);
  log.info("chat socket opening", { channelId: channel.id });
  return relay.connect(channel.id, request);
}

// For the channel's object, which knows the channel by id.
export async function takeUndeliveredOn(channelId: string): Promise<ChatPoll> {
  return takeUndelivered(await channelById(channelId));
}

export async function replyOnChannelId(
  channelId: string,
  reply: AgentReply,
): Promise<ChatMessage> {
  return replyOnChannel(await channelById(channelId), reply);
}

export async function workingOnChannelId(
  channelId: string,
  replyTo?: string,
): Promise<void> {
  await markWorking(await channelById(channelId), replyTo);
}

// The agent's people messages as it gets them, from rows already marked
// delivered.
export async function agentPoll(
  channel: OpenChannel,
  rows: MessageRow[],
): Promise<ChatPoll> {
  const people = await getUserProfiles(rows.map((r) => r.userId));
  const messages: AgentChatMessage[] = rows.map((row) => ({
    id: row.id,
    from: { id: row.userId, name: people.get(row.userId)?.name ?? "Someone" },
    body: row.body,
    context: row.context ?? null,
    sentAt: row.createdAt.getTime(),
  }));
  return { pullRequest: channel.pullRequest, messages };
}

// Marks and returns every person's message the agent has not had, in one
// statement, so two polls never both get one.
async function takeUndelivered(channel: OpenChannel): Promise<ChatPoll> {
  const rows = await getDb()
    .update(chatMessages)
    .set({ deliveredAt: new Date() })
    .where(
      and(
        eq(chatMessages.channelId, channel.id),
        eq(chatMessages.sender, "person"),
        isNull(chatMessages.deliveredAt),
      ),
    )
    .returning();
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (rows.length > 0) {
    log.info("chat messages delivered", {
      channelId: channel.id,
      count: rows.length,
    });
  }
  return agentPoll(channel, rows);
}

// The person sees the agent working on their message until it answers, or
// for CHAT_WORKING_MS.
async function markWorking(
  channel: OpenChannel,
  replyTo: string | undefined,
): Promise<void> {
  const message = await addressedMessage(channel.id, replyTo);
  await getDb()
    .update(chatMessages)
    .set({ workingAt: new Date() })
    .where(eq(chatMessages.id, message.id));
  await touchChannel(channel.id);
  log.info("chat agent working", {
    channelId: channel.id,
    messageId: message.id,
  });
}

// The agent answers the person who wrote `replyTo`, or the last who wrote.
async function replyOnChannel(
  channel: OpenChannel,
  reply: AgentReply,
): Promise<ChatMessage> {
  const { userId } = await addressedMessage(channel.id, reply.replyTo);
  const [row] = await getDb()
    .insert(chatMessages)
    .values({
      id: newEntityId("CHAT_MESSAGE"),
      channelId: channel.id,
      userId,
      sender: "agent",
      body: reply.body,
      deliveredAt: new Date(),
    })
    .returning();
  await touchChannel(channel.id);
  log.info("chat reply sent", {
    channelId: channel.id,
    messageId: row!.id,
    addressed: reply.replyTo !== undefined,
  });
  return (await presentMessages(channel.agentId, [row!]))[0]!;
}

// The person's message `replyTo` names, or else the latest anyone sent.
async function addressedMessage(
  channelId: string,
  replyTo: string | undefined,
): Promise<{ id: string; userId: string }> {
  const [message] = await getDb()
    .select({ id: chatMessages.id, userId: chatMessages.userId })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.channelId, channelId),
        eq(chatMessages.sender, "person"),
        replyTo === undefined ? undefined : eq(chatMessages.id, replyTo),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  if (!message) {
    throw new ForgeError(
      replyTo === undefined ? "BAD_REQUEST" : "NOT_FOUND",
      replyTo === undefined
        ? "No one has written to you here yet"
        : "replyTo is not a message someone sent you here",
    );
  }
  return message;
}
