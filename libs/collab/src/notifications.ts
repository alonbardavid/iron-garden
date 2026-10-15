import {
  getDb,
  sessionNotifications,
  newEntityId,
  and,
  asc,
  eq,
  inArray,
  isNull,
  type NotificationKind,
} from "@lib/db-models";
import { sessionMessagingOn } from "@lib/ai";
import { moduleLogger } from "@lib/logging";
import { inbox } from "./inbox";

const log = moduleLogger("collab/notifications");

export interface SessionNotification {
  id: string;
  kind: NotificationKind;
  body: string;
  data: Record<string, unknown> | null;
  // For a message: the session that sent it, and the message it answers.
  fromSessionId: string | null;
  replyTo: string | null;
  createdAt: number;
}

export interface NewNotification {
  kind: NotificationKind;
  body: string;
  data?: Record<string, unknown>;
  collisionId?: string;
  fromSessionId?: string;
  replyToId?: string;
}

type NotificationRow = typeof sessionNotifications.$inferSelect;

// Keeps a notification for the session, and hands it to its listener at once
// if one is connected.
export async function notifySession(
  sessionId: string,
  notification: NewNotification,
): Promise<string> {
  const id = newEntityId("SESSION_NOTIFICATION");
  await getDb()
    .insert(sessionNotifications)
    .values({
      id,
      sessionId,
      kind: notification.kind,
      body: notification.body,
      data: notification.data ?? null,
      collisionId: notification.collisionId ?? null,
      fromSessionId: notification.fromSessionId ?? null,
      replyToId: notification.replyToId ?? null,
    });
  log.info("session notified", {
    sessionId,
    notificationId: id,
    kind: notification.kind,
  });
  await inbox.deliver(sessionId).catch((err: unknown) => {
    log.warn("session listener unreachable", { sessionId, err });
  });
  return id;
}

// What the session has not had yet, oldest first, marked delivered as it is
// returned, in one statement so two listeners never both get one. Messages
// from other sessions wait while an admin has messaging turned off; the
// chat with the person the agent works for never does.
export async function takeNotifications(
  sessionId: string,
): Promise<SessionNotification[]> {
  const rows = await getDb()
    .update(sessionNotifications)
    .set({ deliveredAt: new Date() })
    .where(
      and(
        eq(sessionNotifications.sessionId, sessionId),
        isNull(sessionNotifications.deliveredAt),
        inArray(sessionNotifications.kind, await deliverableKinds()),
      ),
    )
    .returning();
  if (rows.length > 0) {
    log.info("session notifications delivered", {
      sessionId,
      count: rows.length,
    });
  }
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(toNotification);
}

// Messages that never reached the session, oldest first.
export async function undeliveredMessagesTo(
  sessionId: string,
): Promise<NotificationRow[]> {
  return getDb()
    .select()
    .from(sessionNotifications)
    .where(
      and(
        eq(sessionNotifications.sessionId, sessionId),
        eq(sessionNotifications.kind, "message"),
        isNull(sessionNotifications.deliveredAt),
      ),
    )
    .orderBy(asc(sessionNotifications.createdAt));
}

export function toNotification(row: NotificationRow): SessionNotification {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    data: row.data,
    fromSessionId: row.fromSessionId,
    replyTo: row.replyToId,
    createdAt: row.createdAt.getTime(),
  };
}

async function deliverableKinds(): Promise<NotificationKind[]> {
  return (await sessionMessagingOn())
    ? ["collision", "message", "undelivered", "chat"]
    : ["collision", "undelivered", "chat"];
}
