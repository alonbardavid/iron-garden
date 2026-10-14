const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Artifacts repository tokens end in `?expires=<unix seconds>`.
export function tokenExpiry(token: string, now = Date.now()): string {
  const query = token.slice(token.indexOf("?") + 1);
  const seconds = Number(new URLSearchParams(query).get("expires"));
  return new Date(
    Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000
      : now + DEFAULT_TOKEN_TTL_MS,
  ).toISOString();
}
