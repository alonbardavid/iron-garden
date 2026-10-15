import {
  getDb,
  agentSessions,
  agents,
  sessionNotifications,
  and,
  asc,
  count,
  eq,
  gt,
  or,
  type SessionContact,
} from "@lib/db-models";
import { sessionMessagingOn } from "@lib/ai";
import { SESSION_LIVE_MS } from "@lib/contract";
import { ForgeError } from "@lib/forge";
import { getUserProfile, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import {
  notifySession,
  toNotification,
  undeliveredMessagesTo,
  type SessionNotification,
} from "./notifications";
import { activeSession, type Session } from "./sessions";

const log = moduleLogger("collab/messages");

// The most messages a session sends in an hour.
export const MESSAGES_PER_HOUR = 30;

// The most messages a session may have waiting on one other session's answer.
export const UNANSWERED_PER_SESSION = 5;

const HOUR_MS = 60 * 60_000;

export interface MessageInput {
  to: string;
  body: string;
  replyTo?: string | null;
}

// Sends a message from one of the caller's sessions to another active
// session of the same repository, delivered like any notification.
export async function sendMessage(
  principal: Principal,
  fromSessionId: string,
  input: MessageInput,
): Promise<{ id: string; recipientLive: boolean }> {
  await requireMessaging();
  const sender = await activeSession(principal, fromSessionId);
  const recipient = await recipientOf(sender, input.to);
  if (input.replyTo) {
    await requireMessageTo(sender.id, input.replyTo);
  }
  await checkLimits(sender.id, recipient.id);
  const id = await notifySession(recipient.id, {
    kind: "message",
    body: input.body,
    data: { from: await senderLabel(sender) },
    fromSessionId: sender.id,
    replyToId: input.replyTo ?? undefined,
  });
  log.info("session message sent", {
    notificationId: id,
    fromSessionId: sender.id,
    toSessionId: recipient.id,
  });
  return { id, recipientLive: recipient.live };
}

// The session ended: each message it never fetched goes back to its sender
// as an undelivered notice.
export async function returnUndelivered(sessionId: string): Promise<void> {
  const waiting = await undeliveredMessagesTo(sessionId);
  for (const message of waiting) {
    if (message.fromSessionId) {
      await notifySession(message.fromSessionId, {
        kind: "undelivered",
        body: `Your message to session ${sessionId} was never delivered: that session ended before it fetched it.`,
        data: { to: sessionId, messageId: message.id },
      });
    }
  }
  if (waiting.length > 0) {
    log.info("undelivered messages returned", {
      sessionId,
      count: waiting.length,
    });
  }
}

// Every message the session sent or got, oldest first. Only for the people
// who own its agent: callers decide that.
export async function messagesOf(
  sessionId: string,
): Promise<SessionNotification[]> {
  const rows = await getDb()
    .select()
    .from(sessionNotifications)
    .where(
      and(
        eq(sessionNotifications.kind, "message"),
        or(
          eq(sessionNotifications.sessionId, sessionId),
          eq(sessionNotifications.fromSessionId, sessionId),
        ),
      ),
    )
    .orderBy(asc(sessionNotifications.createdAt));
  return rows.map(toNotification);
}

async function requireMessaging(): Promise<void> {
  if (!(await sessionMessagingOn())) {
    log.info("session message refused: messaging off");
    throw new ForgeError(
      "FORBIDDEN",
      "An admin turned messaging between sessions off",
    );
  }
}

interface Recipient {
  id: string;
  live: boolean;
}

async function recipientOf(sender: Session, to: string): Promise<Recipient> {
  const [row] = await getDb()
    .select({
      id: agentSessions.id,
      status: agentSessions.status,
      lastSeenAt: agentSessions.lastSeenAt,
      contact: agentSessions.contact,
    })
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.id, to),
        eq(agentSessions.repositoryId, sender.repositoryId),
      ),
    );
  if (!row || row.id === sender.id) {
    throw new ForgeError(
      "NOT_FOUND",
      "No other session on this repository has that id",
    );
  }
  if (row.status !== "active") {
    throw new ForgeError(
      "BAD_REQUEST",
      `That session has ended${contactHint(row.contact)}`,
    );
  }
  return {
    id: row.id,
    live:
      !!row.lastSeenAt &&
      Date.now() - row.lastSeenAt.getTime() < SESSION_LIVE_MS,
  };
}

function contactHint(contact: SessionContact[] | null): string {
  return contact?.length
    ? `; it published a contact: ${JSON.stringify(contact)}`
    : "";
}

// A reply must answer a message the sender got.
async function requireMessageTo(sessionId: string, messageId: string) {
  const [row] = await getDb()
    .select({ id: sessionNotifications.id })
    .from(sessionNotifications)
    .where(
      and(
        eq(sessionNotifications.id, messageId),
        eq(sessionNotifications.sessionId, sessionId),
        eq(sessionNotifications.kind, "message"),
      ),
    );
  if (!row) {
    throw new ForgeError(
      "BAD_REQUEST",
      "replyTo names no message this session got",
    );
  }
}

async function checkLimits(senderId: string, recipientId: string) {
  const [sentLastHour, unanswered] = await Promise.all([
    sentSince(senderId, new Date(Date.now() - HOUR_MS)),
    unansweredTo(senderId, recipientId),
  ]);
  if (sentLastHour >= MESSAGES_PER_HOUR) {
    log.info("session message refused: hourly limit", { senderId });
    throw new ForgeError(
      "RATE_LIMITED",
      `A session sends at most ${MESSAGES_PER_HOUR} messages an hour; try again later`,
    );
  }
  if (unanswered >= UNANSWERED_PER_SESSION) {
    log.info("session message refused: unanswered limit", {
      senderId,
      recipientId,
    });
    throw new ForgeError(
      "RATE_LIMITED",
      `${UNANSWERED_PER_SESSION} of your messages to that session are still unanswered; wait for an answer`,
    );
  }
}

async function sentSince(senderId: string, since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(sessionNotifications)
    .where(
      and(
        eq(sessionNotifications.fromSessionId, senderId),
        eq(sessionNotifications.kind, "message"),
        gt(sessionNotifications.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

// The sender's messages to the recipient that the recipient has not replied
// to.
async function unansweredTo(
  senderId: string,
  recipientId: string,
): Promise<number> {
  const between = (from: string, to: string) =>
    getDb()
      .select({
        id: sessionNotifications.id,
        replyToId: sessionNotifications.replyToId,
      })
      .from(sessionNotifications)
      .where(
        and(
          eq(sessionNotifications.kind, "message"),
          eq(sessionNotifications.fromSessionId, from),
          eq(sessionNotifications.sessionId, to),
        ),
      );
  const [sent, replies] = await Promise.all([
    between(senderId, recipientId),
    between(recipientId, senderId),
  ]);
  const answered = new Set(replies.map((reply) => reply.replyToId));
  return sent.filter((message) => !answered.has(message.id)).length;
}

async function senderLabel(sender: Session) {
  const [agent] = await getDb()
    .select({ ownerUserId: agents.ownerUserId })
    .from(agents)
    .where(eq(agents.id, sender.agentId));
  const owner = agent ? await getUserProfile(agent.ownerUserId) : null;
  return {
    sessionId: sender.id,
    title: sender.title,
    agent: sender.agentName,
    ownerName: owner?.name ?? null,
  };
}
