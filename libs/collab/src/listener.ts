import { getDb, agentSessions, eq } from "@lib/db-models";
import { ForgeError } from "@lib/forge";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { inbox } from "./inbox";
import { takeNotifications, type SessionNotification } from "./notifications";
import { activeSession, getSession, touchSession } from "./sessions";
import { hashUrlKey, newUrlKey } from "./url-keys";

const log = moduleLogger("collab/listener");

const LISTEN_KEY_PREFIX = "cgit_inbox_";

// Where a session's listener connects; the key in the path is its only
// credential.
export interface ListenEndpoints {
  pollUrl: string;
  socketUrl: string;
}

export type ListenEndpointsFor = (key: string) => ListenEndpoints;

// The session's own agent, or the user who owns it, listening again.
export async function listenAgain(
  principal: Principal,
  sessionId: string,
  endpointsFor: ListenEndpointsFor,
): Promise<ListenEndpoints> {
  await activeSession(principal, sessionId);
  return endpointsFor(await rekeyListener(sessionId));
}

// What is waiting for the session, for its own agent or the user who owns
// it, without a listener.
export async function fetchNotifications(
  principal: Principal,
  sessionId: string,
): Promise<{ notifications: SessionNotification[] }> {
  await getSession(principal, sessionId);
  return { notifications: await takeNotifications(sessionId) };
}

// What is waiting for the session; it answers at once.
export async function pollListener(
  key: string,
): Promise<{ notifications: SessionNotification[] }> {
  const sessionId = await sessionByKey(key);
  await touchSession(sessionId);
  return { notifications: await takeNotifications(sessionId) };
}

export async function openListenerSocket(
  key: string,
  request: Request,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const sessionId = await sessionByKey(key);
  await touchSession(sessionId);
  log.info("session listener socket opening", { sessionId });
  return inbox.connect(sessionId, request);
}

// A fresh key for the session's listener: the old one stops working.
export async function rekeyListener(sessionId: string): Promise<string> {
  const key = newUrlKey(LISTEN_KEY_PREFIX);
  await getDb()
    .update(agentSessions)
    .set({ listenKeyHash: await hashUrlKey(key) })
    .where(eq(agentSessions.id, sessionId));
  log.info("session listener keyed", { sessionId });
  return key;
}

async function sessionByKey(key: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: agentSessions.id, status: agentSessions.status })
    .from(agentSessions)
    .where(eq(agentSessions.listenKeyHash, await hashUrlKey(key)));
  if (!row) {
    throw new ForgeError("NOT_FOUND", "No session listens on this key");
  }
  if (row.status !== "active") {
    log.info("session listener refused: session ended", { sessionId: row.id });
    throw new ForgeError("GONE", "This session has ended");
  }
  return row.id;
}
