import { openListenerSocket, pollListener } from "@lib/collab";
import { ForgeError, type ForgeErrorCode } from "@lib/forge";
import { publicApi } from "./api";

// A listening session, authenticated by the key in the path, which is why it
// sits on publicApi.
export const sessionInbox = {
  poll: publicApi.sessionInbox.poll.handler(({ input }) =>
    pollListener(input.key),
  ),
};

const SOCKET_REFUSALS: Partial<Record<ForgeErrorCode, number>> = {
  NOT_FOUND: 404,
  GONE: 410,
};

// A listening session's socket, handed to its Durable Object. Not an oRPC
// procedure: it answers with a WebSocket upgrade.
export async function sessionInboxSocket(key: string, request: Request) {
  try {
    return await openListenerSocket(key, request);
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
