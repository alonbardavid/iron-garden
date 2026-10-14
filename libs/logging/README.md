# @lib/logging

Server code logs through `@lib/logging`: `const log = moduleLogger("<package>/<path>")`.
The name is a static string because `import.meta.url` is undefined in the bundled Worker;
the `local/module-logger-name` ESLint rule derives and autofixes it.

- `httpLogger` (`@lib/server-commons`) is mounted first. It logs each request, sets an
  `x-request-id` header, and opens a scope holding `requestId` / `method` / `path`;
  the API's `requirePrincipal` adds `userId`, and `agentId` for an agent key.
- The root logs at `info`. A `LOG_CATEGORIES` worker var
  (`"forge=debug,drizzle-orm=debug"`) turns categories up for one deploy.
- Drizzle queries log at `debug` only — the records carry query params such as emails and
  session tokens.
- `NODE_ENV=production` (every remote target) writes JSON lines for Workers Logs; anything
  else writes logfmt.
