import { ORPCError } from "@orpc/server";
import { AUTOCOMPLETE_LIMIT } from "@lib/contract";
import {
  createKey,
  getUserProfile,
  listPersonalKeys,
  revokeKey,
  searchUserProfiles,
} from "@lib/identity";
import { requireUser } from "@lib/forge";
import { api, signedInApi } from "./api";
import { toUser } from "./repositories";

export const me = signedInApi.me.handler(async ({ context: { principal } }) => {
  const profile = await getUserProfile(principal.userId);
  if (!profile) {
    throw new ORPCError("UNAUTHORIZED", { message: "Not authenticated" });
  }
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    username: profile.username,
    role: profile.role,
    mustChangePassword:
      principal.kind === "user" && principal.mustChangePassword,
    agent:
      principal.kind === "agent"
        ? { id: principal.agentId, name: principal.agentName }
        : null,
  };
});

// Everyone signed in can find who else is on the instance, to add them to a
// repository.
export const searchUsers = api.searchUsers.handler(async ({ input }) =>
  (await searchUserProfiles(input.q, AUTOCOMPLETE_LIMIT)).map(toUser),
);

export const keys = api.keys.router({
  list: api.keys.list.handler(({ context: { principal }, input }) => {
    requireUser(principal);
    return listPersonalKeys(principal.userId, input);
  }),
  create: api.keys.create.handler(({ context: { principal }, input }) => {
    requireUser(principal);
    return createKey({ userId: principal.userId, agentId: null }, input);
  }),
  revoke: api.keys.revoke.handler(async ({ context: { principal }, input }) => {
    requireUser(principal);
    if (
      !(await revokeKey({ userId: principal.userId, agentId: null }, input.id))
    ) {
      throw new ORPCError("NOT_FOUND", { message: "Key not found" });
    }
    return { ok: true as const };
  }),
});
