import { agents, chatMessages, eq, getDb } from "@lib/db-models";
import { AD_HOC_NAME, type ChatMessage } from "@lib/contract";
import { getUserProfiles } from "@lib/identity";

export type { ChatMessage };

type MessageRow = typeof chatMessages.$inferSelect;

// Messages of one channel as people read them. The ad hoc channel, with no
// agent, answers as AD_HOC_NAME.
export async function presentMessages(
  agentId: string | null,
  rows: MessageRow[],
): Promise<ChatMessage[]> {
  const [agent] = agentId
    ? await getDb()
        .select({ name: agents.name })
        .from(agents)
        .where(eq(agents.id, agentId))
    : [{ name: AD_HOC_NAME }];
  const people = await getUserProfiles(
    rows.filter((r) => r.sender === "person").map((r) => r.userId),
  );
  return rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    author:
      row.sender === "agent"
        ? (agent?.name ?? "agent")
        : (people.get(row.userId)?.name ?? "Someone"),
    body: row.body,
    context: row.context ?? null,
    delivered: row.deliveredAt !== null,
    workingAt: row.workingAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
  }));
}
