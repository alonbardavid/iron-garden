import { AsyncLocalStorage } from "node:async_hooks";
import {
  getLogger as drizzleQueryLogger,
  type DrizzleLogger,
} from "@logtape/drizzle-orm";
import {
  configureSync,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
  logfmtFormatter,
  parseLogLevel,
  type Config,
  type Logger,
} from "@logtape/logtape";

type LoggerConfig = Config<"console", never>["loggers"][number];

// Verbosity is set per category here, not by a level var. To turn one up:
//   { category: ["forge"], sinks: ["console"], lowestLevel: "debug" }
const LOGGERS: LoggerConfig[] = [
  { category: [], sinks: ["console"], lowestLevel: "info" },
];

configureSync({
  reset: true,
  sinks: { console: getConsoleSink({ formatter: formatter() }) },
  loggers: [
    ...LOGGERS,
    ...categoryOverrides(),
    // Without a sink of its own, LogTape's reports about itself go nowhere.
    {
      category: ["logtape", "meta"],
      sinks: ["console"],
      lowestLevel: "warning",
    },
  ],
  contextLocalStorage: new AsyncLocalStorage(),
});

/**
 * `moduleLogger("forge/repositories")`. The name is written out because
 * `import.meta.url` is undefined for a module inside the bundled Worker; the
 * `local/module-logger-name` ESLint rule checks it against the file and
 * autofixes it.
 */
export function moduleLogger(name: string): Logger {
  return getLogger(name.split("/"));
}

export { withContext, type Logger } from "@logtape/logtape";

/**
 * Drizzle's query logger. Queries are written at `debug`, so they stay off
 * until `LOG_CATEGORIES="drizzle-orm=debug"` — the records carry query
 * parameters, i.e. emails and session tokens.
 */
export function queryLogger(): DrizzleLogger {
  return drizzleQueryLogger();
}

// Remote targets get NODE_ENV=production from gen-wrangler-config and need
// JSON lines for Workers Logs to index the fields; logfmt keeps them readable
// in a terminal.
function formatter() {
  return readEnv("NODE_ENV") === "production"
    ? getJsonLinesFormatter({ properties: "flatten" })
    : logfmtFormatter;
}

// `LOG_CATEGORIES="forge=debug,identity/auth=trace"`. An entry that does
// not parse is skipped: a typo in a var must not take the worker down.
function categoryOverrides(): LoggerConfig[] {
  const spec = readEnv("LOG_CATEGORIES")?.trim();
  if (!spec) return [];
  return spec.split(",").flatMap((entry) => {
    const [category, level] = entry.split("=").map((part) => part.trim());
    if (!category || !level) return [];
    try {
      return [
        {
          category: category.split("/"),
          sinks: ["console" as const],
          lowestLevel: parseLogLevel(level),
        },
      ];
    } catch {
      return [];
    }
  });
}

function readEnv(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}
