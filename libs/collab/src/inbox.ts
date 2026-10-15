import { env } from "cloudflare:workers";

// The session a socket request is for, set by the worker after it checked
// the listener's key.
export const SESSION_HEADER = "x-session-inbox";

// Each session's Durable Object holds its listener's open sockets. D1 stays
// the record; the object only passes notifications on.
export const inbox = {
  // Sends what is waiting down any open socket.
  deliver: (sessionId: string): Promise<number> =>
    inboxObject(sessionId).deliver(sessionId),
  close: (sessionId: string, reason: string): Promise<void> =>
    inboxObject(sessionId).close(reason),
  connect: (sessionId: string, request: Request): Promise<Response> => {
    const headers = new Headers(request.headers);
    headers.set(SESSION_HEADER, sessionId);
    return inboxObject(sessionId).fetch(new Request(request, { headers }));
  },
};

function inboxObject(sessionId: string) {
  const namespace = env.SESSION_INBOXES;
  return namespace.get(namespace.idFromName(sessionId));
}
