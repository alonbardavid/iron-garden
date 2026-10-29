---
title: Monitoring and logs
description: Where to find an instance's logs, how to check its health, and how its data is backed up.
---

%PRODUCT_NAME% runs as one Cloudflare Worker, so its monitoring is Cloudflare's: Workers
Logs keeps every request and every log line, `wrangler tail` streams them live, and
`/api/health` answers whether the database is reachable.

## Workers Logs

Every deploy has Workers observability on, with Workers Logs keeping invocation logs and a
head sampling rate of 1. Every request is logged, none sampled away.

To read them, open the Worker in the Cloudflare dashboard under **Workers & Pages** and go
to its **Observability** tab. Logs are JSON. Filter on any field below, such as
`requestId`, `userId` or `status`.

## What a log line looks like

Each line is one JSON object. Its `message` is a constant phrase, and everything variable is
a field of its own:

```json
{
  "@timestamp": "2026-10-18T09:14:03.512Z",
  "level": "INFO",
  "message": "webhook received",
  "logger": "github.webhooks",
  "requestId": "4f6c1d2e-8a7b-4c39-9e0f-2b5d7a1c3e84",
  "method": "POST",
  "path": "/api/github/webhooks/GHC_…",
  "connectionId": "GHC_…",
  "event": "push"
}
```

| Field        | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `@timestamp` | When the line was written                                                    |
| `level`      | Such as `DEBUG`, `INFO`, `WARN` or `ERROR`                                   |
| `message`    | A constant description of the event                                          |
| `logger`     | The part of the server that wrote it, such as `forge.repositories` or `hono` |
| other fields | The event's own values, such as ids, counts and reasons                      |

At the default levels, emails, passwords and tokens are never written.

### Request fields

Every line written while serving a request carries:

| Field       | Meaning                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| `requestId` | One id per request, also returned to the client in the `x-request-id` response header |
| `method`    | The HTTP method                                                                       |
| `path`      | The request path                                                                      |
| `userId`    | For an API call, the signed-in user or the owner of the API key                       |
| `agentId`   | For an API call made with an agent's key                                              |

When a request finishes, the `hono` logger writes one line for it, with `status`,
`responseTime` (milliseconds), `url`, `contentLength`, `userAgent` and `referrer` as well.

To follow one problem a user reports, find the `x-request-id` header on the failing
response in the browser's developer tools, then filter Workers Logs on that `requestId`.

Lines from the server-side processing jobs carry `pullRequestId`, and `revision` for a
bracketing job or `messageId` for an ad hoc answer.

### Turning up a category

The server logs at `info`. To see `debug` lines from one part for a while, add a
`LOG_CATEGORIES` variable to the Worker, for example `forge=debug`, under its
**Settings › Variables and Secrets** in the dashboard. Several entries are separated by
commas. The next deploy replaces the Worker's variables, which removes it.

:::caution
`drizzle-orm=debug` logs every database query with its parameters, which include emails and
session tokens. Turn it on only briefly, and only when you must.
:::

## Live logs with wrangler tail

From a checkout of the repository, signed in with `wrangler login` or a
`CLOUDFLARE_API_TOKEN`, stream the Worker's logs as they happen:

```bash
pnpm --filter @app/backend exec wrangler tail <worker> --format pretty
```

`--status error` shows only failed invocations. `<worker>` is the Worker's name as the
dashboard shows it.

## Health check

`GET /api/health` needs no sign-in.

```bash
curl https://<your host>/api/health
```

It runs one query against the D1 database and answers:

| Status | Body                                                                         | Meaning                    |
| ------ | ---------------------------------------------------------------------------- | -------------------------- |
| `200`  | `{"status":"ok","checks":{"database":{"status":"ok"}}}`                      | The database answers.      |
| `503`  | `{"status":"degraded","checks":{"database":{"status":"error","error":"…"}}}` | The database query failed. |

It does not check git storage, Workers AI or email. `GET /api/capabilities`, also public,
says which of them this instance can use right now:

```json
{ "email": false, "git": true, "ai": true }
```

`git` and `ai` reflect the deploy's bindings. `email` is true once an admin
[turns email on](/administration/email/).

## The database

All of the instance's records live in one D1 database: users, repositories, sessions, pull
requests, reviews and settings. Find its name in the dashboard's D1 list, or among the
Worker's bindings, where it is bound as `DB`.

D1 Time Travel keeps a point-in-time history of the database with nothing to set up. You
can restore to any minute within the retention window (30 days on Workers Paid):

```bash
# Where the database was at a given time
pnpm --filter @app/backend exec wrangler d1 time-travel info <database> --timestamp=2026-10-18T09:00:00Z

# Restore it to that time
pnpm --filter @app/backend exec wrangler d1 time-travel restore <database> --timestamp=2026-10-18T09:00:00Z
```

For a copy you keep yourself, export it to a SQL file:

```bash
pnpm --filter @app/backend exec wrangler d1 export <database> --remote --output=backup.sql
```

:::caution
Git data is not in D1. Every repository's branches and commits live in Cloudflare
Artifacts, so restoring D1 does not roll them back, and a D1 export does not contain them.
A restore can leave the database pointing at branches as they are now, not as they were.
:::

## Durable Objects

The Worker uses three Durable Object namespaces. They hold short-lived state only; D1 stays
the record.

| Binding           | Holds                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `CHAT_CHANNELS`   | One object per chat channel: the agents' open sockets on a pull request                              |
| `PROCESSING`      | One object per pull request: the revision waiting for the server to process it, and ad hoc questions |
| `SESSION_INBOXES` | One object per agent session: its listener's open socket                                             |

Their request counts and errors show on the Durable Objects page of the Cloudflare
dashboard. A server bracketing job that throws is retried twice, with backoff,
before the pull request opens without brackets; look for `processing job failed; will
retry` and `server grouping failed; opened without groups` in the logs.
