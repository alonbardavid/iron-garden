import { ORPCError } from "@orpc/server";
import {
  createAgent,
  createKey,
  deleteAgent,
  getOwnedAgent,
  listAgents,
  listKeys,
  revokeKey,
  setAgentActive,
  type Agent,
  type Principal,
} from "@lib/identity";
import { listAgentAccess, requireUser, setAgentAccess } from "@lib/forge";
import { api } from "./api";

const toAgent = ({ id, name, description, active, createdAt }: Agent) => ({
  id,
  name,
  description,
  active,
  createdAt,
});

// Agents are managed by their owner, in a browser or with a personal key.
async function ownedAgent(principal: Principal, name: string): Promise<Agent> {
  requireUser(principal);
  const agent = await getOwnedAgent(principal.userId, name);
  if (!agent) {
    throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
  }
  return agent;
}

export const agents = api.agents.router({
  list: api.agents.list.handler(async ({ context: { principal } }) => {
    requireUser(principal);
    return (await listAgents(principal.userId)).map(toAgent);
  }),
  create: api.agents.create.handler(
    async ({ context: { principal }, input }) => {
      requireUser(principal);
      return toAgent(await createAgent(principal.userId, input));
    },
  ),
  get: api.agents.get.handler(async ({ context: { principal }, input }) => {
    const agent = await ownedAgent(principal, input.name);
    const owner = { userId: agent.ownerUserId, agentId: agent.id };
    const [keys, access] = await Promise.all([
      listKeys(owner),
      listAgentAccess(agent),
    ]);
    return { ...toAgent(agent), keys, access };
  }),
  update: api.agents.update.handler(
    async ({ context: { principal }, input }) => {
      const agent = await ownedAgent(principal, input.name);
      return toAgent(await setAgentActive(agent, input.active));
    },
  ),
  delete: api.agents.delete.handler(
    async ({ context: { principal }, input }) => {
      await deleteAgent(await ownedAgent(principal, input.name));
      return { ok: true as const };
    },
  ),
  keys: {
    create: api.agents.keys.create.handler(
      async ({ context: { principal }, input: { agent: name, ...key } }) => {
        const agent = await ownedAgent(principal, name);
        return createKey({ userId: agent.ownerUserId, agentId: agent.id }, key);
      },
    ),
    revoke: api.agents.keys.revoke.handler(
      async ({ context: { principal }, input }) => {
        const agent = await ownedAgent(principal, input.agent);
        const revoked = await revokeKey(
          { userId: agent.ownerUserId, agentId: agent.id },
          input.id,
        );
        if (!revoked) {
          throw new ORPCError("NOT_FOUND", { message: "Key not found" });
        }
        return { ok: true as const };
      },
    ),
  },
  setAccess: api.agents.setAccess.handler(
    async ({ context: { principal }, input }) => {
      const agent = await ownedAgent(principal, input.agent);
      await setAgentAccess(principal, agent, input.repository, input.level);
      return { ok: true as const };
    },
  ),
});
