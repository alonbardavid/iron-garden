import {
  agentSessions,
  agents,
  and,
  asc,
  eq,
  getDb,
  newEntityId,
  sessionChatMessages,
  sessionNotifications,
  type SessionChatSender,
  type SessionStatus,
} from "@lib/db-models";
import { authorize, ForgeError } from "@lib/forge";
import { getUserProfile, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { notifySession } from "./notifications";
import { activeSession, requireAgent } from "./sessions";

const log = moduleLogger("collab/session-chat");

export interface SessionChatMessage {
  id: string;
  sender: SessionChatSender;
  author: string;
  body: string;
  delivered: boolean;
  createdAt: number;
}

interface OwnedSession {
  id: string;
  status: SessionStatus;
  agentName: string;
  ownerUserId: string;
}

// The chat between a session's agent and the person it works for, oldest
// first. Nobody else reads it.
export async function sessionChat(
  principal: Principal,
  repositoryName: string,
  sessionId: string,
): Promise<SessionChatMessage[]> {
  const session = await ownedSession(principal, repositoryName, sessionId);
  const [rows, owner] = await Promise.all([
    threadRows(session.id),
    getUserProfile(session.ownerUserId),
  ]);
  log.info("session chat read", { sessionId, count: rows.length });
  const authors = { person: owner?.name ?? "You", agent: session.agentName };
  return rows.map((row) => toChatMessage(row, authors[row.sender]));
}

// A message from the person the session's agent works for. It reaches the
// agent as a `chat` notice, on its listener if one is open.
export async function chatWithSession(
  principal: Principal,
  repositoryName: string,
  sessionId: string,
  body: string,
): Promise<SessionChatMessage> {
  const session = await ownedSession(principal, repositoryName, sessionId);
  requireActive(session);
  const owner = await getUserProfile(session.ownerUserId);
  const author = owner?.name ?? "The person you work for";
  const row = await insertMessage(
    session.id,
    "person",
    body,
    session.ownerUserId,
  );
  await deliverToAgent(session.id, row.id, body, author);
  return toChatMessage({ ...row, deliveredAt: null }, author);
}

// The agent's answer in its session's chat.
export async function replyInSessionChat(
  principal: Principal,
  sessionId: string,
  body: string,
): Promise<SessionChatMessage> {
  const session = await activeSession(requireAgent(principal), sessionId);
  const row = await insertMessage(session.id, "agent", body, null);
  log.info("session chat answered", { sessionId, messageId: row.id });
  return toChatMessage({ ...row, deliveredAt: null }, session.agentName);
}

// The session, when the principal is the person its agent works for.
async function ownedSession(
  principal: Principal,
  repositoryName: string,
  sessionId: string,
): Promise<OwnedSession> {
  const repository = await authorize(principal, repositoryName, "read");
  const [found] = await getDb()
    .select({
      id: agentSessions.id,
      status: agentSessions.status,
      agentName: agents.name,
      ownerUserId: agents.ownerUserId,
    })
    .from(agentSessions)
    .innerJoin(agents, eq(agents.id, agentSessions.agentId))
    .where(
      and(
        eq(agentSessions.id, sessionId),
        eq(agentSessions.repositoryId, repository.id),
      ),
    );
  if (!found) {
    throw new ForgeError("NOT_FOUND", "Session not found");
  }
  if (principal.kind !== "user" || principal.userId !== found.ownerUserId) {
    log.info("session chat refused: not the agent's owner", { sessionId });
    throw new ForgeError(
      "FORBIDDEN",
      "Only the person a session's agent works for chats with it",
    );
  }
  return found;
}

function requireActive(session: OwnedSession): void {
  if (session.status !== "active") {
    log.info("session chat refused: session ended", { sessionId: session.id });
    throw new ForgeError(
      "CONFLICT",
      "This session has ended; its agent no longer listens",
    );
  }
}

// Sends the message as a `chat` notice and ties it to the notice, whose
// delivery is the message's.
async function deliverToAgent(
  sessionId: string,
  messageId: string,
  body: string,
  author: string,
): Promise<void> {
  const notificationId = await notifySession(sessionId, {
    kind: "chat",
    body,
    data: { from: { name: author }, messageId },
  });
  await getDb()
    .update(sessionChatMessages)
    .set({ notificationId })
    .where(eq(sessionChatMessages.id, messageId));
  log.info("session chat sent", { sessionId, messageId, notificationId });
}

async function insertMessage(
  sessionId: string,
  sender: SessionChatSender,
  body: string,
  userId: string | null,
) {
  const [row] = await getDb()
    .insert(sessionChatMessages)
    .values({
      id: newEntityId("SESSION_CHAT_MESSAGE"),
      sessionId,
      sender,
      userId,
      body,
    })
    .returning();
  return row!;
}

// A person's message is delivered once the agent fetched the notice that
// carries it.
async function threadRows(sessionId: string) {
  return getDb()
    .select({
      id: sessionChatMessages.id,
      sender: sessionChatMessages.sender,
      body: sessionChatMessages.body,
      createdAt: sessionChatMessages.createdAt,
      deliveredAt: sessionNotifications.deliveredAt,
    })
    .from(sessionChatMessages)
    .leftJoin(
      sessionNotifications,
      eq(sessionNotifications.id, sessionChatMessages.notificationId),
    )
    .where(eq(sessionChatMessages.sessionId, sessionId))
    .orderBy(asc(sessionChatMessages.createdAt));
}

function toChatMessage(
  row: {
    id: string;
    sender: SessionChatSender;
    body: string;
    createdAt: Date;
    deliveredAt: Date | null;
  },
  author: string,
): SessionChatMessage {
  return {
    id: row.id,
    sender: row.sender,
    author,
    body: row.body,
    delivered: row.sender === "agent" || row.deliveredAt !== null,
    createdAt: row.createdAt.getTime(),
  };
}
