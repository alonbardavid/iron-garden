import { env } from "cloudflare:workers";
import type { ChatPoll } from "@lib/contract";

// The channel a socket request is for, set by the worker after it checked
// the key.
export const CHANNEL_HEADER = "x-chat-channel";

// The channel's Durable Object: it holds the agent's open sockets. D1 stays
// the record; the object only passes messages on.
export const relay = {
  // How many open sockets got the messages.
  notify: (channelId: string, poll: ChatPoll): Promise<number> =>
    channelObject(channelId).notify(poll),
  close: (channelId: string, reason: string): Promise<void> =>
    channelObject(channelId).close(reason),
  connect: (channelId: string, request: Request): Promise<Response> => {
    const headers = new Headers(request.headers);
    headers.set(CHANNEL_HEADER, channelId);
    return channelObject(channelId).fetch(new Request(request, { headers }));
  },
};

function channelObject(channelId: string) {
  const namespace = env.CHAT_CHANNELS;
  return namespace.get(namespace.idFromName(channelId));
}
