import { execFileSync } from "node:child_process";
import { BACKEND_DIR, PERSIST } from "./shared";

// Every run starts from an empty instance, so the first screenshot is the
// first-run setup form. The server is already running on this state, so its
// rows are emptied rather than its files deleted.
export default function globalSetup() {
  if (process.env.DOCS_SCREENSHOTS_KEEP) return;
  wrangler(["d1", "migrations", "apply", "DB"]);
  const [{ results }] = JSON.parse(
    wrangler(
      [
        "d1",
        "execute",
        "DB",
        "--json",
        "--command",
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      ],
      "pipe",
    ),
  ) as [{ results: { name: string }[] }];
  const tables = results
    .map((r) => r.name)
    .filter((name) => !/^(sqlite_|_cf_|d1_migrations$)/.test(name));
  wrangler([
    "d1",
    "execute",
    "DB",
    "--command",
    [
      "PRAGMA defer_foreign_keys = on;",
      ...tables.map((t) => `DELETE FROM ${t};`),
    ].join(" "),
  ]);
}

function wrangler(args: string[], stdio: "inherit" | "pipe" = "inherit") {
  return execFileSync(
    "pnpm",
    ["exec", "wrangler", ...args, "--local", "--persist-to", PERSIST],
    {
      cwd: BACKEND_DIR,
      stdio: stdio === "pipe" ? ["ignore", "pipe", "inherit"] : "inherit",
      encoding: "utf8",
    },
  );
}
