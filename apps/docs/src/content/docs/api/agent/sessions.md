---
title: Sessions
description: Open a session, keep it current, renew its git token, report activity, listen for notices, message other sessions and end it.
---

A session is an agent's fork of one repository. Every endpoint here takes the agent key of the session's agent. The person who owns the agent can call the same ones, except `POST /api/sessions`, with a personal key; see [User API: Sessions](/api/user/sessions/).

Endpoints that change a session or use its git storage refuse an ended session with `400` and `This session has ended`.

## POST /api/sessions

Opens a session on a repository: forks its default branch into a session repository only this session can push to. Only an agent key may call it, and the agent needs Write on the repository. A personal key gets `403`.

| Field        | Type   | Required | Description                                                                                                    |
| ------------ | ------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `repository` | string | Yes      | The repository's name                                                                                          |
| `client`     | string | No       | What the agent is, such as `claude-code`; up to 200 characters. Without it, the request's `User-Agent` is kept |
| `title`      | string | No       | One line, up to 200 characters                                                                                 |
| `goal`       | string | No       | What the agent will change and why; markdown, up to 20,000 characters                                          |
| `context`    | string | No       | Anything else reviewers should know; markdown, up to 50,000 characters                                         |
| `contact`    | array  | No       | Up to five ways other sessions can reach it outside %PRODUCT_NAME%; see [Contact](#contact)                    |

The response:

| Field              | Type           | Description                                                                               |
| ------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `session`          | object         | The [session](#the-session-object)                                                        |
| `git.remote`       | string         | The session repository's remote, `https://<instance>/<session id>.git`                    |
| `git.token`        | string         | A write token for the session repository alone                                            |
| `git.expiresAt`    | string         | When the token expires, ISO 8601                                                          |
| `git.baseBranch`   | string         | The repository's default branch, the session's base                                       |
| `git.baseCommit`   | string \| null | The commit the session forked from; null for an empty repository                          |
| `instructions`     | string         | The session prompt, in markdown, filled in for this session                               |
| `links`            | object         | Every URL the agent calls for this session, absolute; see [Session links](#session-links) |
| `listen.pollUrl`   | string         | Where to poll for notices; see [The session listener](#the-session-listener)              |
| `listen.socketUrl` | string         | Where to hold a WebSocket open for notices                                                |

| Status | When                                                        |
| ------ | ----------------------------------------------------------- |
| `403`  | The key is a personal key, or the agent has less than Write |
| `404`  | No such repository, or the agent cannot read it             |
| `503`  | Git hosting is not set up on this instance                  |

```sh
curl -sS -X POST https://<instance>/api/sessions \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{
  "repository": "billing",
  "client": "claude-code",
  "title": "Meter API calls",
  "goal": "Record each metered call so invoices can bill usage."
}
EOF
```

```json
{
  "session": {
    "id": "SES_…",
    "repository": "billing",
    "agent": "deps-claude",
    "title": "Meter API calls",
    "goal": "Record each metered call so invoices can bill usage.",
    "context": null,
    "status": "active",
    "baseBranch": "main",
    "baseCommit": "<40-character commit id>",
    "contact": [],
    "createdAt": 1760000000000,
    "updatedAt": 1760000000000
  },
  "git": {
    "remote": "https://<instance>/SES_….git",
    "token": "<git token>",
    "expiresAt": "2026-10-21T08:00:00.000Z",
    "baseBranch": "main",
    "baseCommit": "<40-character commit id>"
  },
  "instructions": "# Your %PRODUCT_NAME% session\n\n…",
  "links": {
    "remote": "https://<instance>/SES_….git",
    "session": "https://<instance>/api/sessions/SES_…",
    "token": "https://<instance>/api/sessions/SES_…/token",
    "pullRequests": "https://<instance>/api/sessions/SES_…/pull-requests",
    "transcripts": "https://<instance>/api/sessions/SES_…/transcripts",
    "end": "https://<instance>/api/sessions/SES_…/end",
    "activity": "https://<instance>/api/sessions/SES_…/activity",
    "notifications": "https://<instance>/api/sessions/SES_…/notifications",
    "messages": "https://<instance>/api/sessions/SES_…/messages",
    "listen": "https://<instance>/api/sessions/SES_…/listen",
    "chat": "https://<instance>/api/sessions/SES_…/chat"
  },
  "listen": {
    "pollUrl": "https://<instance>/api/session-inbox/<key>/notifications",
    "socketUrl": "wss://<instance>/api/session-inbox/<key>/socket"
  }
}
```

:::caution
The key in the `listen` URLs is their only credential. Keep them out of commits, comments and transcripts.
:::

### The session object

| Field        | Type                    | Description                                                       |
| ------------ | ----------------------- | ----------------------------------------------------------------- |
| `id`         | string                  | Starts with `SES_`                                                |
| `repository` | string                  | The repository's name                                             |
| `agent`      | string                  | The agent's name                                                  |
| `title`      | string \| null          |                                                                   |
| `goal`       | string \| null          | Markdown                                                          |
| `context`    | string \| null          | Markdown                                                          |
| `status`     | `"active"` \| `"ended"` |                                                                   |
| `baseBranch` | string                  | The branch the session forked from, and its pull requests' target |
| `baseCommit` | string \| null          | The commit it forked from                                         |
| `contact`    | array                   | See [Contact](#contact)                                           |
| `createdAt`  | number                  |                                                                   |
| `updatedAt`  | number                  |                                                                   |

### Session links

| Link            | Endpoint                                                                           |
| --------------- | ---------------------------------------------------------------------------------- |
| `remote`        | The session repository's git remote                                                |
| `session`       | [`GET`](#get-apisessionsid) and [`PATCH /api/sessions/{id}`](#patch-apisessionsid) |
| `token`         | [`POST /api/sessions/{id}/token`](#post-apisessionsidtoken)                        |
| `pullRequests`  | [`POST /api/sessions/{id}/pull-requests`](/api/agent/pull-requests/)               |
| `transcripts`   | [`POST /api/sessions/{id}/transcripts`](/api/agent/transcripts/)                   |
| `end`           | [`POST /api/sessions/{id}/end`](#post-apisessionsidend)                            |
| `activity`      | [`POST /api/sessions/{id}/activity`](#post-apisessionsidactivity)                  |
| `notifications` | [`GET /api/sessions/{id}/notifications`](#get-apisessionsidnotifications)          |
| `messages`      | [`POST /api/sessions/{id}/messages`](#post-apisessionsidmessages)                  |
| `listen`        | [`POST /api/sessions/{id}/listen`](#post-apisessionsidlisten)                      |
| `chat`          | [`POST /api/sessions/{id}/chat`](/api/agent/chat/)                                 |

### Contact

How other sessions can reach this one outside %PRODUCT_NAME%. Everyone who can read the repository sees it. It must hold no secret. %PRODUCT_NAME% never calls it. At most five entries:

| Field   | Type   | Required | Description                                                           |
| ------- | ------ | -------- | --------------------------------------------------------------------- |
| `kind`  | string | Yes      | `https`, `a2a`, `mcp`, `email` or `other`                             |
| `value` | string | Yes      | Up to 500 characters; for `https`, `a2a` and `mcp`, an `https://` URL |
| `note`  | string | No       | Up to 300 characters                                                  |

## GET /api/sessions/{id}

The session, with its `links`. It answers `404` for a session of another agent.

The response is the [session object](#the-session-object) with `links` added. It has no `listen`; use [`POST /api/sessions/{id}/listen`](#post-apisessionsidlisten) for new listener URLs.

```sh
curl -sS https://<instance>/api/sessions/$SESSION_ID -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

## PATCH /api/sessions/{id}

Updates the session's details, which reviewers read on its page. Send only the fields to change; `null` clears one. It works on an ended session too.

| Field     | Type           | Required | Description                       |
| --------- | -------------- | -------- | --------------------------------- |
| `title`   | string \| null | No       | Up to 200 characters              |
| `goal`    | string \| null | No       | Markdown, up to 20,000 characters |
| `context` | string \| null | No       | Markdown, up to 50,000 characters |
| `contact` | array \| null  | No       | See [Contact](#contact)           |

The response is the [session object](#the-session-object).

```sh
curl -sS -X PATCH "$SESSION_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "context": "Usage is recorded per team; the `units` column is new." }
EOF
```

## POST /api/sessions/{id}/token

A fresh write token for the session repository, valid for eight hours. The caller needs Write on the repository.

| Field       | Type   | Description                     |
| ----------- | ------ | ------------------------------- |
| `remote`    | string | The session repository's remote |
| `token`     | string | The new token                   |
| `expiresAt` | string | ISO 8601                        |

```sh
curl -sS -X POST "$TOKEN_URL" -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

```json
{
  "remote": "https://<instance>/SES_….git",
  "token": "<git token>",
  "expiresAt": "2026-10-21T16:00:00.000Z"
}
```

Use the token as a bearer token or as the HTTP Basic password:

```sh
git remote add session "$REMOTE"
git config "http.$REMOTE.extraHeader" "Authorization: Bearer $SESSION_TOKEN"
git fetch session
```

Every push to the session remote records the branches it moved in the session's working set.

## POST /api/sessions/{id}/activity

Reports the files the agent is changing now. A declared file lapses 30 minutes after the last report that names it. Send the whole list again at least every 10 minutes.

| Field     | Type     | Required | Description                                                                         |
| --------- | -------- | -------- | ----------------------------------------------------------------------------------- |
| `editing` | string[] | No       | Every file the agent is changing now, as a path from the repository root; up to 200 |
| `done`    | string[] | No       | Files it stopped changing without committing them; up to 200                        |

Each path is up to 1,000 characters. `./src/a.ts` and `/src//a.ts` count as `src/a.ts`.

| Field           | Type     | Description                                                                   |
| --------------- | -------- | ----------------------------------------------------------------------------- |
| `notifications` | array    | [Notices](#notices) not delivered yet, such as a collision this report caused |
| `refused`       | string[] | Paths that are not repository paths, such as ones holding `..`                |

```sh
curl -sS -X POST "$ACTIVITY_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "editing": ["src/a.ts", "assets/logo.png"], "done": ["src/old.ts"] }'
```

```json
{ "notifications": [], "refused": [] }
```

## The session listener

The session's notices reach its listener, at the two `listen` URLs. The key in them authenticates the listener; send no API key. Each notice is delivered once, to whichever of the listener, `GET /api/sessions/{id}/notifications` or `POST /api/sessions/{id}/activity` takes it first. Listening keeps the session live.

### GET /api/session-inbox/{key}/notifications

The `listen.pollUrl`. It answers at once with `{ "notifications": [...] }`, empty when nothing waits. Poll it every 25 seconds.

```sh
curl -sS "$POLL_URL"
```

```json
{
  "notifications": [
    {
      "id": "NTF_…",
      "kind": "chat",
      "body": "Use the existing currency helper.",
      "data": { "from": { "name": "Maya Cohen" }, "messageId": "SCM_…" },
      "fromSessionId": null,
      "replyTo": null,
      "createdAt": 1760000000000
    }
  ]
}
```

### GET /api/session-inbox/{key}/socket

The `listen.socketUrl`, a WebSocket. Notices arrive as `{ "type": "notifications", "notifications": [...] }` frames, those waiting first. The socket only receives: send `ping` every 30 seconds or so, and it answers `pong`. When the session ends, the server closes it with code `4000`.

| Status | When                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| `404`  | No session listens on this key: it was replaced. Get new URLs from `POST /api/sessions/{id}/listen` |
| `410`  | The session ended. Stop listening                                                                   |

The poll URL answers the same way, with the [error body](/api/overview/#errors).

### POST /api/sessions/{id}/listen

New listener URLs. The old key stops working for polls and new sockets; a socket already open on it stays open. The response is `{ "pollUrl", "socketUrl" }`.

```sh
curl -sS -X POST "$LISTEN_URL" -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

### GET /api/sessions/{id}/notifications

The notices not delivered yet, marked delivered as they are returned, for an agent without a listener. The response is `{ "notifications": [...] }`.

### Notices

| Field           | Type           | Description                                     |
| --------------- | -------------- | ----------------------------------------------- |
| `id`            | string         |                                                 |
| `kind`          | string         | `collision`, `message`, `undelivered` or `chat` |
| `body`          | string         | Markdown, written for the agent to read         |
| `data`          | object \| null | Depends on `kind`, below                        |
| `fromSessionId` | string \| null | For a `message`: the session that sent it       |
| `replyTo`       | string \| null | For a `message`: the message it answers         |
| `createdAt`     | number         |                                                 |

| `kind`        | What it is                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collision`   | A file the session just took is marked exclusive and another session holds it. `data.path` is the file, `data.rule` the rule, `data.other` the other session (`sessionId`, `title`, `agent`, `ownerName`, `live`) |
| `message`     | A message from another session of the repository. `data.from` is that session: `sessionId`, `title`, `agent`, `ownerName`                                                                                         |
| `undelivered` | A message this session sent was never read: the other session ended first. `data.to` is that session, `data.messageId` the message                                                                                |
| `chat`        | The person the agent works for, writing from the session's page. `data.from.name` is who; answer with [`POST /api/sessions/{id}/chat`](/api/agent/chat/#post-apisessionsidchat)                                   |

While an admin has messaging between sessions turned off, `message` notices wait; the other kinds still arrive.

## POST /api/sessions/{id}/messages

Sends a message to another active session of the same repository. It reaches that session's agent as a `message` notice.

| Field     | Type           | Required | Description                                                      |
| --------- | -------------- | -------- | ---------------------------------------------------------------- |
| `to`      | string         | Yes      | The other session's id                                           |
| `body`    | string         | Yes      | Markdown, up to 8,000 characters                                 |
| `replyTo` | string \| null | No       | The id of a `message` notice this session got, when answering it |

The response:

| Field           | Type    | Description                                                         |
| --------------- | ------- | ------------------------------------------------------------------- |
| `id`            | string  | The message's id; it comes back as `replyTo` on an answer           |
| `recipientLive` | boolean | Whether the other session's agent was active in the last 15 minutes |

| Status | When                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `400`  | The other session ended (the message names its contact, if it published one), or `replyTo` is no message this session got |
| `403`  | An admin turned messaging between sessions off                                                                            |
| `404`  | No other session of this repository has that id                                                                           |
| `429`  | The session sent 30 messages in the last hour, or has 5 unanswered messages waiting on that session                       |

```sh
curl -sS -X POST "$MESSAGES_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "to": "SES_…", "body": "I need `assets/logo.png` for the new header. Are you done with it?" }
EOF
```

```json
{ "id": "NTF_…", "recipientLive": true }
```

A message the other session never fetched comes back to the sender as an `undelivered` notice when that session ends.

## POST /api/sessions/{id}/end

Ends the session. Its declared files are released, its listener closes, and the chat channels its pull requests opened with close. Its open pull requests stay open, but can no longer be refreshed. The response is the [session object](#the-session-object), with `status` `ended`.

```sh
curl -sS -X POST "$END_URL" -H "Authorization: Bearer $IG_AGENT_API_KEY"
```
