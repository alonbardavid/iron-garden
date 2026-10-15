import { DurableObject } from "cloudflare:workers";
import { moduleLogger } from "@lib/logging";
import { SESSION_HEADER } from "./inbox";
import { takeNotifications } from "./notifications";
import { touchSession } from "./sessions";

const log = moduleLogger("collab/inbox-object");

// While a socket is open the object marks its session seen this often; the
// "ping" auto-response keeps the socket up without waking it.
const HEARTBEAT_MS = 30_000;

// Closing a socket because its session ended, rather than on error.
const CLOSED_CODE = 4000;

interface Attachment {
  sessionId: string;
}

// One per session: holds its listener's open sockets, hibernating between
// notifications so it is billed only while one is handled. Notifications
// live in D1; this only passes them on.
export class SessionInboxObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  // A socket for the session the worker named, once it checked the key.
  override async fetch(request: Request): Promise<Response> {
    const sessionId = request.headers.get(SESSION_HEADER);
    if (!sessionId) {
      return new Response("No session", { status: 400 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server!);
    server!.serializeAttachment({ sessionId } satisfies Attachment);
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
    await this.sendWaiting(sessionId, [server!]);
    log.info("session listener opened", {
      sessionId,
      sockets: this.ctx.getWebSockets().length,
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  // Hands what is waiting to the open sockets; how many there are. With none
  // open, it stays waiting for the next poll or session call.
  async deliver(sessionId: string): Promise<number> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length > 0) {
      await this.sendWaiting(sessionId, sockets);
    }
    return sockets.length;
  }

  async close(reason: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(CLOSED_CODE, reason);
    }
  }

  override async webSocketMessage(socket: WebSocket): Promise<void> {
    socket.send(
      JSON.stringify({
        type: "error",
        message:
          'This socket only receives; send "ping" to keep it open, and use the API to answer',
      }),
    );
  }

  override async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    const { sessionId } = socket.deserializeAttachment() as Attachment;
    log.info("session listener closed", { sessionId, code });
    socket.close(code, reason);
  }

  // Keeps the session live while a socket is open.
  override async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) {
      return;
    }
    const { sessionId } = sockets[0]!.deserializeAttachment() as Attachment;
    await touchSession(sessionId);
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
  }

  private async sendWaiting(sessionId: string, sockets: WebSocket[]) {
    const notifications = await takeNotifications(sessionId);
    const frame = JSON.stringify({ type: "notifications", notifications });
    for (const socket of sockets) {
      socket.send(frame);
    }
  }
}
