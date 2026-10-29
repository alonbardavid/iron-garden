import {
  getDb,
  apiKeys,
  and,
  eq,
  desc,
  matchesAllTerms,
  paginate,
  searchTerms,
  type ListRequest,
  type ListResult,
} from "@lib/db-models";
import { moduleLogger } from "@lib/logging";
import { AGENT_KEY_PREFIX, PERSONAL_KEY_PREFIX, getAuth } from "./auth";
import { parseKeyMetadata, type KeyMetadata } from "./key-metadata";

const log = moduleLogger("identity/keys");

const DAY_SECONDS = 24 * 60 * 60;

export interface KeySummary {
  id: string;
  name: string;
  start: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
}

export interface CreatedKey {
  key: KeySummary;
  plaintext: string;
}

// `agentId` null means the user's personal keys.
export interface KeyOwner {
  userId: string;
  agentId: string | null;
}

export async function createKey(
  owner: KeyOwner,
  input: { name: string; expiresInDays: number | null },
): Promise<CreatedKey> {
  const metadata: KeyMetadata = owner.agentId
    ? { kind: "agent", agentId: owner.agentId }
    : { kind: "user" };
  const created = await getAuth().api.createApiKey({
    body: {
      userId: owner.userId,
      name: input.name,
      prefix: owner.agentId ? AGENT_KEY_PREFIX : PERSONAL_KEY_PREFIX,
      expiresIn: input.expiresInDays ? input.expiresInDays * DAY_SECONDS : null,
      metadata,
    },
  });
  log.info("api key created", {
    userId: owner.userId,
    agentId: owner.agentId,
    keyId: created.id,
  });
  return {
    plaintext: created.key,
    key: {
      id: created.id,
      name: created.name ?? input.name,
      start: created.start ?? null,
      createdAt: new Date(created.createdAt).getTime(),
      lastUsedAt: null,
      expiresAt: created.expiresAt
        ? new Date(created.expiresAt).getTime()
        : null,
    },
  };
}

// A user's personal keys a page at a time, newest first by default; `q` keeps
// those whose name holds every word of it. The prefix tells them from agent
// keys in SQL, so pages stay full; the metadata check is the authority.
export async function listPersonalKeys(
  userId: string,
  request: ListRequest<"createdAt"> & { q?: string },
): Promise<ListResult<KeySummary>> {
  const page = await paginate(
    getDb()
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.referenceId, userId),
          eq(apiKeys.prefix, PERSONAL_KEY_PREFIX),
        ),
      )
      .$dynamic(),
    request,
    {
      defaultSort: "createdAt",
      filters: { q: (q) => matchesAllTerms(apiKeys.name, searchTerms(q)) },
    },
  );
  const owner = { userId, agentId: null };
  return {
    ...page,
    items: page.items
      .filter((row) => belongsTo(row.metadata, owner))
      .map(toSummary),
  };
}

// Every key of one owner, newest first: an agent has few.
export async function listKeys(owner: KeyOwner): Promise<KeySummary[]> {
  const rows = await getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.referenceId, owner.userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.filter((row) => belongsTo(row.metadata, owner)).map(toSummary);
}

export async function revokeKey(
  owner: KeyOwner,
  keyId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: apiKeys.id, metadata: apiKeys.metadata })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.referenceId, owner.userId)));
  if (!row || !belongsTo(row.metadata, owner)) {
    return false;
  }
  await getDb().delete(apiKeys).where(eq(apiKeys.id, keyId));
  log.info("api key revoked", { userId: owner.userId, keyId });
  return true;
}

export async function revokeAgentKeys(
  userId: string,
  agentId: string,
): Promise<void> {
  const keys = await listKeys({ userId, agentId });
  for (const key of keys) {
    await revokeKey({ userId, agentId }, key.id);
  }
}

function belongsTo(rawMetadata: unknown, owner: KeyOwner): boolean {
  const metadata = parseKeyMetadata(rawMetadata);
  if (!metadata) {
    return false;
  }
  return owner.agentId
    ? metadata.kind === "agent" && metadata.agentId === owner.agentId
    : metadata.kind === "user";
}

function toSummary(row: typeof apiKeys.$inferSelect): KeySummary {
  return {
    id: row.id,
    name: row.name ?? "",
    start: row.start,
    createdAt: row.createdAt.getTime(),
    lastUsedAt: row.lastRequest?.getTime() ?? null,
    expiresAt: row.expiresAt?.getTime() ?? null,
  };
}
