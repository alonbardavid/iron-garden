import {
  getDb,
  agents,
  user,
  newEntityId,
  and,
  eq,
  matchesAllTerms,
  paginate,
  searchTerms,
  type ListRequest,
  type ListResult,
} from "@lib/db-models";
import { moduleLogger } from "@lib/logging";
import { revokeAgentKeys } from "./keys";

const log = moduleLogger("identity/agents");

export interface Agent {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: number;
}

export class AgentNameTaken extends Error {
  constructor(name: string) {
    super(`The name "${name}" is taken`);
    this.name = "AgentNameTaken";
  }
}

// A user's agents a page at a time, by name unless asked otherwise; `q` keeps
// those whose name holds every word of it.
export async function listAgents(
  ownerUserId: string,
  request: ListRequest<"name" | "createdAt"> & { q?: string },
): Promise<ListResult<Agent>> {
  const page = await paginate(
    getDb()
      .select()
      .from(agents)
      .where(eq(agents.ownerUserId, ownerUserId))
      .$dynamic(),
    request,
    {
      defaultSort: "name",
      filters: { q: (q) => matchesAllTerms(agents.name, searchTerms(q)) },
    },
  );
  return { ...page, items: page.items.map(toAgent) };
}

export async function getAgent(id: string): Promise<Agent | null> {
  const [row] = await getDb().select().from(agents).where(eq(agents.id, id));
  return row ? toAgent(row) : null;
}

export async function getOwnedAgent(
  ownerUserId: string,
  name: string,
): Promise<Agent | null> {
  const [row] = await getDb()
    .select()
    .from(agents)
    .where(and(eq(agents.ownerUserId, ownerUserId), eq(agents.name, name)));
  return row ? toAgent(row) : null;
}

// Agent names share the login namespace with usernames, so one name never
// means two identities.
export async function createAgent(
  ownerUserId: string,
  input: { name: string; description?: string | null },
): Promise<Agent> {
  const db = getDb();
  const [agentClash, userClash] = await Promise.all([
    db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.name, input.name)),
    db.select({ id: user.id }).from(user).where(eq(user.username, input.name)),
  ]);
  if (agentClash.length > 0 || userClash.length > 0) {
    throw new AgentNameTaken(input.name);
  }
  const [row] = await db
    .insert(agents)
    .values({
      id: newEntityId("AGENT"),
      ownerUserId,
      name: input.name,
      description: input.description ?? null,
    })
    .returning();
  log.info("agent created", { userId: ownerUserId, agentId: row!.id });
  return toAgent(row!);
}

export async function setAgentActive(
  agent: Agent,
  active: boolean,
): Promise<Agent> {
  const [row] = await getDb()
    .update(agents)
    .set({ deactivatedAt: active ? null : new Date(), updatedAt: new Date() })
    .where(eq(agents.id, agent.id))
    .returning();
  log.info("agent status changed", { agentId: agent.id, active });
  return toAgent(row!);
}

export async function deleteAgent(agent: Agent): Promise<void> {
  await revokeAgentKeys(agent.ownerUserId, agent.id);
  await getDb().delete(agents).where(eq(agents.id, agent.id));
  log.info("agent deleted", { agentId: agent.id });
}

function toAgent(row: typeof agents.$inferSelect): Agent {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    description: row.description,
    active: row.deactivatedAt === null,
    createdAt: row.createdAt.getTime(),
  };
}
