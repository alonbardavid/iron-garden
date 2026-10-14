const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

// "4 minutes ago", "yesterday", "just now".
export function timeAgo(epochMs: number, now = Date.now()): string {
  const seconds = Math.round((epochMs - now) / 1000);
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.trunc(seconds / size), unit);
    }
  }
  return "just now";
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
