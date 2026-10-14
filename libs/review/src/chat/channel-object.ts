import { DurableObject } from "cloudflare:workers";
import type { ChatPoll } from "@lib/contract";
import { moduleLogger } from "@lib/logging";
import { touchChannel } from "./channels";
import {
  replyOnChannelId,
  takeUndeliveredOn,
  workingOnChannelId,
} from "./listening";
import { CHANNEL_HEADER } from "./relay";

const log = moduleLogger("review/chat/channel-object");

// While a socket is open the object marks its agent seen this often; the
// "ping" auto-response keeps the socket up without waking it.
const HEARTBEAT_MS = 30_000;

// Closing a socket because its channel is over, rather than on error.
const CLOSED_CODE = 4000;

interface Attachment {
  channelId: string;
}

// What an agent sends up its socket: an answer, or word that it is working
// on one.
type SocketFrame =
  | { type: "reply"; body: string; replyTo?: string }
  | { type: "working"; replyTo?: string };

// One per chat channel: holds the agent's open sockets, hibernating between
// messages so it is billed only while one is handled. Messages live in D1;
// this only passes them on.
export class ChatChannelObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  // A socket for the channel the worker named, once it checked the key.
  override async fetch(request: Request): Promise<Response> {
    const channelId = request.headers.get(CHANNEL_HEADER);
    if (!channelId) {
      return new Response("No channel", { status: 400 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server!);
    server!.serializeAttachment({ channelId } satisfies Attachment);
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
    await this.sendQueued(server!, channelId);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Sends to every open socket; how many got it.
  async notify(poll: ChatPoll): Promise<number> {
    const sockets = this.ctx.getWebSockets();
    const frame = JSON.stringify({ type: "messages", ...poll });
    for (const socket of sockets) {
      socket.send(frame);
    }
    return sockets.length;
  }

  async close(reason: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(CLOSED_CODE, reason);
    }
  }

  override async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    const { channelId } = socket.deserializeAttachment() as Attachment;
    const frame = parseFrame(data);
    if (!frame) {
      socket.send(
        JSON.stringify({
          type: "error",
          message:
            'Send {"type":"reply","body":"<markdown>","replyTo":"<message id>"}, {"type":"working","replyTo":"<message id>"} or "ping"',
        }),
      );
      return;
    }
    try {
      socket.send(JSON.stringify(await this.handle(channelId, frame)));
    } catch (err) {
      log.info("chat socket frame refused", { channelId, err });
      socket.send(
        JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : "Refused",
        }),
      );
    }
  }

  override async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    const { channelId } = socket.deserializeAttachment() as Attachment;
    log.info("chat socket closed", { channelId, code });
    socket.close(code, reason);
  }

  // Keeps the agent live while a socket is open.
  override async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) {
      return;
    }
    const { channelId } = sockets[0]!.deserializeAttachment() as Attachment;
    await touchChannel(channelId);
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
  }

  // What people wrote while the agent was away, as the socket's first frame.
  private async sendQueued(socket: WebSocket, channelId: string) {
    try {
      const poll = await takeUndeliveredOn(channelId);
      socket.send(JSON.stringify({ type: "messages", ...poll }));
      log.info("chat socket opened", {
        channelId,
        sockets: this.ctx.getWebSockets().length,
        queued: poll.messages.length,
      });
    } catch (err) {
      // The channel closed since the worker checked its key.
      log.info("chat socket refused", { channelId, err });
      socket.close(
        CLOSED_CODE,
        err instanceof Error ? err.message : "Chat closed",
      );
    }
  }

  private async handle(channelId: string, frame: SocketFrame) {
    if (frame.type === "working") {
      await workingOnChannelId(channelId, frame.replyTo);
      return { type: "working" };
    }
    return {
      type: "sent",
      message: await replyOnChannelId(channelId, frame),
    };
  }
}

function parseFrame(data: string | ArrayBuffer): SocketFrame | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const value = JSON.parse(data) as Record<string, unknown>;
    const replyTo =
      typeof value.replyTo === "string" ? value.replyTo : undefined;
    if (value.type === "working") {
      return { type: "working", replyTo };
    }
    const body = typeof value.body === "string" ? value.body.trim() : "";
    if (value.type !== "reply" || !body || body.length > 50_000) {
      return null;
    }
    return { type: "reply", body, replyTo };
  } catch {
    return null;
  }
}
