// What an API key acts for, stored in its better-auth metadata. Only the app
// writes it (clients cannot reach the API key endpoints), so it is trusted
// once parsed; the owner is still checked against the agent row.
export type KeyMetadata = { kind: "user" } | { kind: "agent"; agentId: string };

export function parseKeyMetadata(raw: unknown): KeyMetadata | null {
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  const parsed = typeof value === "string" ? safeParse(value) : value;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const { kind, agentId } = parsed as Record<string, unknown>;
  if (kind === "user") {
    return { kind };
  }
  if (kind === "agent" && typeof agentId === "string" && agentId) {
    return { kind, agentId };
  }
  return null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
