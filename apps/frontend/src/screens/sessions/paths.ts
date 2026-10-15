import type { SessionSummary } from "@lib/contract";

export const SESSION_TABS = ["overview", "conversations"] as const;
export type SessionTab = (typeof SESSION_TABS)[number];

export function sessionPath(
  repository: string,
  id: string,
  tab: SessionTab = "overview",
): string {
  const base = `/r/${repository}/sessions/${id}`;
  return tab === "overview" ? base : `${base}/${tab}`;
}

export function sessionTitle(session: Pick<SessionSummary, "title">): string {
  return session.title ?? "Untitled session";
}
