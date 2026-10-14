import { ORPCError } from "@orpc/server";
import {
  createKey,
  getUserProfile,
  listKeys,
  listUserProfiles,
  revokeKey,
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

// Everyone signed in can see who else is on the instance, to add them to a
// repository.
export const users = api.users.handler(async () =>
  (await listUserProfiles()).map(toUser),
);

export const keys = api.keys.router({
  list: api.keys.list.handler(({ context: { principal } }) => {
    requireUser(principal);
    return listKeys({ userId: principal.userId, agentId: null });
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
