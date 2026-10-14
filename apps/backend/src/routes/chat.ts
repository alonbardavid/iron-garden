import {
  closeChat,
  deleteChatMessage,
  listChatAgents,
  listChatMessages,
  listen,
  openChatSocket,
  pollChat,
  replyInChat,
  sendChatMessage,
  workingInChat,
} from "@lib/review";
import { ForgeError, type ForgeErrorCode } from "@lib/forge";
import { api, publicApi } from "./api";
import { chatEndpoints } from "./links";

// People talking to their own agents listening on a pull request.
export const chat = api.pullRequests.chat.router({
  agents: api.pullRequests.chat.agents.handler(
    ({ context: { principal }, input }) =>
      listChatAgents(principal, input.name, input.number),
  ),
  messages: api.pullRequests.chat.messages.handler(
    ({ context: { principal }, input }) =>
      listChatMessages(principal, input.name, input.number, input.channel),
  ),
  send: api.pullRequests.chat.send.handler(
    ({
      context: { principal },
      input: { name, number, channel, ...message },
    }) => sendChatMessage(principal, name, number, channel, message),
  ),
  deleteMessage: api.pullRequests.chat.deleteMessage.handler(
    async ({ context: { principal }, input }) => {
      await deleteChatMessage(
        principal,
        input.name,
        input.number,
        input.channel,
        input.message,
      );
      return { ok: true as const };
    },
  ),
});

// A listening agent. Only `listen` takes its API key; the rest are
// authenticated by the key in their path, which is why they sit on publicApi.
export const agentChat = {
  listen: api.chat.listen.handler(({ context: { principal, origin }, input }) =>
    listen(principal, input.id, chatEndpoints(origin)),
  ),
  poll: publicApi.chat.poll.handler(({ input }) => pollChat(input.key)),
  reply: publicApi.chat.reply.handler(({ input: { key, ...reply } }) =>
    replyInChat(key, reply),
  ),
  working: publicApi.chat.working.handler(async ({ input }) => {
    await workingInChat(input.key, input.replyTo);
    return { ok: true as const };
  }),
  close: publicApi.chat.close.handler(async ({ input }) => {
    await closeChat(input.key);
    return { ok: true as const };
  }),
};

const SOCKET_REFUSALS: Partial<Record<ForgeErrorCode, number>> = {
  NOT_FOUND: 404,
  GONE: 410,
};

// A listening agent's socket, handed to its channel's Durable Object. Not an
// oRPC procedure: it answers with a WebSocket upgrade.
export async function chatSocket(key: string, request: Request) {
  try {
    return await openChatSocket(key, request);
  } catch (err) {
    if (!(err instanceof ForgeError)) {
      throw err;
    }
    return Response.json(
      { code: err.code, message: err.message },
      { status: SOCKET_REFUSALS[err.code] ?? 400 },
    );
  }
}
