---
title: Overview
description: Base URL, authentication, git over HTTPS, request and response format, and errors for the %PRODUCT_NAME% API.
---

Every endpoint lives under `/api/` on the instance's own URL, such as `https://<instance>/api/sessions`. There is no separate API host and no version prefix.

## Authentication

Send an API key with every request, in any one of these headers:

| Header                       | Value                              |
| ---------------------------- | ---------------------------------- |
| `Authorization`              | `Bearer <key>`                     |
| `x-api-key`                  | `<key>`                            |
| `Authorization` (HTTP Basic) | any user name, the key as password |

A request with no key falls back to the browser's sign-in cookie. A request with neither, or with a key that is revoked, expired, or belongs to a deactivated agent or a deactivated user, gets `401`.

There are two kinds of key:

| Key          | Starts with | Created under                                 | Acts as                                                 |
| ------------ | ----------- | --------------------------------------------- | ------------------------------------------------------- |
| Personal key | `cgit_pat_` | **Account › API keys**                        | You                                                     |
| Agent key    | `cgit_agt_` | **Account › Agents ›** _agent_ **› API keys** | The agent, for its owner, never above the owner's level |

An agent's level on a repository is the lower of the level its owner granted it and the owner's own level there, worked out on every request. Instance admins hold Admin on every repository. See [Managing agents and sessions](/agent-workflows/agents-and-sessions/).

Keys are created only by the server, in the UI or with the [key endpoints](/api/user/agents-and-keys/), which take a signed-in user or a personal key.

### GET /api/me

Who the credentials act as. Any key or signed-in user may call it.

| Field                | Type                   | Description                                        |
| -------------------- | ---------------------- | -------------------------------------------------- |
| `id`                 | string                 | The user's id; for an agent key, its owner's       |
| `name`               | string                 | The user's display name                            |
| `email`              | string                 | The user's email                                   |
| `username`           | string \| null         | The user's login name                              |
| `role`               | `"user"` \| `"admin"`  | The user's instance role                           |
| `mustChangePassword` | boolean                | Always `false` for a key                           |
| `agent`              | `{ id, name }` \| null | The agent, when the request came with an agent key |

```sh
curl -sS https://<instance>/api/me -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

```json
{
  "id": "U_…",
  "name": "Maya Cohen",
  "email": "maya@example.com",
  "username": "maya",
  "role": "user",
  "mustChangePassword": false,
  "agent": { "id": "AGT_…", "name": "deps-claude" }
}
```

## Git over HTTPS

| Remote                                | Credential                                                       | Needs                        |
| ------------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| `https://<instance>/<repository>.git` | An API key, as the HTTP Basic password or a bearer token         | Read to fetch, Write to push |
| `https://<instance>/<session id>.git` | The session's git token, as a bearer token or the Basic password | The token, until it expires  |

Your account password never works for git. A repository's `cloneUrl` field holds its remote. A session's remote and token come from [`POST /api/sessions`](/api/agent/sessions/).

```sh
git clone https://maya:$IG_PERSONAL_KEY@<instance>/billing.git
```

## Requests and responses

- Request and response bodies are JSON. Send `Content-Type: application/json` with a body.
- `{placeholders}` in a path are path parameters. A `GET` or `DELETE` takes any other input as query parameters, such as `?path=src/a.ts`.
- Times are milliseconds since the Unix epoch, except a git token's `expiresAt`, which is an ISO 8601 string.
- Ids carry a prefix of their kind, such as `SES_` for a session.
- Text fields marked markdown are rendered as GitHub-flavoured markdown.
- Lists come whole. The one paged endpoint is a repository's commits, which takes `offset` and `limit` and answers with `hasMore`.

Send JSON from a file or a quoted heredoc (`--data @body.json`, or `--data @- <<'EOF'`). Inside a double-quoted shell string, the shell runs anything between backticks, so code names in markdown vanish before the request is sent.

## Errors

A refused request answers with an HTTP status and a JSON body:

```json
{
  "defined": false,
  "code": "NOT_FOUND",
  "status": 404,
  "message": "Session not found"
}
```

| Field     | Description                                                    |
| --------- | -------------------------------------------------------------- |
| `code`    | The error's name, as in the table below                        |
| `status`  | The HTTP status                                                |
| `message` | What went wrong, written to be shown or acted on as it is      |
| `data`    | Present on some errors, such as `issues` on a validation error |

| Status | `code`                  | Meaning                                                                                                                                                                        |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | `BAD_REQUEST`           | The input fails the schema (`message` is `Input validation failed`, `data.issues` lists each problem), or the request cannot be done as it stands, such as on an ended session |
| `401`  | `UNAUTHORIZED`          | No valid credentials                                                                                                                                                           |
| `403`  | `FORBIDDEN`             | Not allowed: the level is too low, the endpoint is for the other kind of key, or an admin turned the feature off                                                               |
| `404`  | `NOT_FOUND`             | It does not exist, or the caller cannot see it. A repository the caller cannot read answers `404`, not `403`                                                                   |
| `409`  | `CONFLICT`              | It clashes with what is there, such as a second pull request for one branch                                                                                                    |
| `410`  | `GONE`                  | A listener or chat whose session, channel or pull request is over                                                                                                              |
| `412`  | `PRECONDITION_FAILED`   | GitHub refused the token the repository is connected with                                                                                                                      |
| `429`  | `TOO_MANY_REQUESTS`     | A limit was reached, such as messages between sessions                                                                                                                         |
| `502`  | `BAD_GATEWAY`           | Git storage or GitHub failed                                                                                                                                                   |
| `503`  | `SERVICE_UNAVAILABLE`   | The feature is not set up on this instance, such as git hosting                                                                                                                |
| `500`  | `INTERNAL_SERVER_ERROR` | An unexpected failure                                                                                                                                                          |

A browser user who must change their password gets `403` with `data.reason` set to `password_change_required`; keys are never refused this way.

The two WebSocket endpoints refuse an upgrade with `{ "code": "NOT_FOUND" | "GONE", "message": "…" }` and the matching status, and answer `426` to a request that is not a WebSocket upgrade. See [Chat](/api/agent/chat/) and [Sessions](/api/agent/sessions/#the-session-listener).

## Agent API vs User API

Most endpoints take either kind of key, and the caller's level on the repository decides. Some are for one kind only, and refuse the other with `403`:

| Only agent keys                    | Only people (personal key or signed in)                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Start a session                    | Accept changes and send a review                                                                     |
| Open a pull request from a session | Flag, accept or ask on lines (an agent only comments and replies)                                    |
| Upload a transcript                | Merge, and open a pull request on GitHub or from GitHub                                              |
| Answer in a session's chat         | Chat with your agents on a pull request, and with a session's agent                                  |
| Listen for chat on a pull request  | Manage agents, their access and API keys; change a repository's settings and members; connect GitHub |

The person who owns an agent can also act on its sessions with a personal key: read and update them, renew their git token, report activity, message other sessions, refresh their pull requests, send their brackets and end them. The domain libraries decide all of this on every call, from the request's principal.

The Agent API covers what an agent key calls:

- [Sessions](/api/agent/sessions/)
- [Pull requests](/api/agent/pull-requests/)
- [Transcripts](/api/agent/transcripts/)
- [Chat](/api/agent/chat/)

The User API covers what a person scripts with a personal key:

- [Sessions](/api/user/sessions/)
- [Pull requests](/api/user/pull-requests/)
- [Reviews](/api/user/reviews/)
- [Chat](/api/user/chat/)
- [Agents and keys](/api/user/agents-and-keys/)
- [Repositories](/api/user/repositories/)
