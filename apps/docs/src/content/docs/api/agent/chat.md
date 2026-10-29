---
title: Chat
description: How an agent listens for and answers chat on a pull request, and answers the person it works for in its session's chat.
---

An agent has two chats: a channel on each pull request it listens on, where people who own the agent ask about the change, and its session's chat with the person it works for, whose messages arrive as `chat` notices on the [session listener](/api/agent/sessions/#the-session-listener).

## Pull request chat

A channel is a set of URLs whose key is their only credential: only [`POST /api/pull-requests/{id}/chat`](#post-apipull-requestsidchat) takes an API key. Treat the URLs as secret as an API key, and keep them out of commits, comments and transcripts.

| URL                | Endpoint                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `chat.url`         | [`DELETE`](#delete-apichatkey) to stop listening; `+ /working` is [`POST /api/chat/{key}/working`](#post-apichatkeyworking) |
| `chat.messagesUrl` | [`GET`](#get-apichatkeymessages) to poll, [`POST`](#post-apichatkeymessages) to reply                                       |
| `chat.socketUrl`   | [The WebSocket](#get-apichatkeysocket)                                                                                      |

Opening a pull request opens a channel for its agent and returns it as `chat`. Each person's message is delivered once. Save it before working on it. The agent shows as live while it polled, replied or held a socket in the last minute; messages wait for it otherwise.

### POST /api/pull-requests/{id}/chat

Starts listening on a pull request, or gives the agent new URLs on one it listens on. The old key stops working, and sockets open on it close. Only an agent key may call it; any agent that can read the repository may listen on a processing or open pull request. It takes no body. This is the pull request's `links.chatUrl`.

| Field         | Type   | Description                                  |
| ------------- | ------ | -------------------------------------------- |
| `url`         | string | `https://<instance>/api/chat/<key>`          |
| `messagesUrl` | string | `https://<instance>/api/chat/<key>/messages` |
| `socketUrl`   | string | `wss://<instance>/api/chat/<key>/socket`     |

| Status | When                                              |
| ------ | ------------------------------------------------- |
| `403`  | Not an agent key                                  |
| `404`  | No such pull request, or the agent cannot read it |
| `410`  | The pull request is merged or closed              |

```sh
curl -sS -X POST "$CHAT_URL" -H "Authorization: Bearer $IG_AGENT_API_KEY"
```

A channel the pull request opened with closes when its session ends. One started or renewed with this call is not tied to a session.

### GET /api/chat/{key}/messages

People's messages the agent has not had yet, marked delivered as they are returned. It answers at once; poll every 25 seconds.

| Field         | Type                                | Description                        |
| ------------- | ----------------------------------- | ---------------------------------- |
| `pullRequest` | `{ id, number, repository, title }` | The pull request the channel is on |
| `messages`    | array                               | Empty when nobody wrote            |

| Message field | Type           | Description                                                        |
| ------------- | -------------- | ------------------------------------------------------------------ |
| `id`          | string         | Starts with `CHM_`; send it as `replyTo`                           |
| `from`        | `{ id, name }` | The person who wrote                                               |
| `body`        | string         | Markdown                                                           |
| `context`     | object \| null | What they were looking at; see [Message context](#message-context) |
| `sentAt`      | number         |                                                                    |

```sh
curl -sS "$CHAT_MESSAGES_URL"
```

```json
{
  "pullRequest": {
    "id": "PR_…",
    "number": 12,
    "repository": "billing",
    "title": "Meter API calls"
  },
  "messages": [
    {
      "id": "CHM_…",
      "from": { "id": "U_…", "name": "Maya Cohen" },
      "body": "Why does this skip free-tier teams?",
      "context": {
        "page": "files",
        "path": "src/usage/record.ts",
        "start": 20,
        "end": 24
      },
      "sentAt": 1760000000000
    }
  ]
}
```

#### Message context

| Field          | Type   | Description                                                     |
| -------------- | ------ | --------------------------------------------------------------- |
| `page`         | string | The tab: `overview`, `groups` (Brackets), `files` or `activity` |
| `path`         | string | The file, when there is one                                     |
| `start`, `end` | number | Lines on it, in the new version of the file                     |
| `group`        | string | The bracket open on the Brackets tab                            |
| `selectedText` | string | Text selected on the page, up to 10,000 characters              |

### POST /api/chat/{key}/working

Tells the person the agent is working on their message. They see thinking dots until the answer arrives, or for five minutes. Send it as soon as the message is read, before the answer.

| Field     | Type   | Required | Description                                             |
| --------- | ------ | -------- | ------------------------------------------------------- |
| `replyTo` | string | No       | The message; without it, the latest message anyone sent |

The response is `{ "ok": true }`. It answers `400` when nobody has written yet, and `404` when `replyTo` names no message sent on this channel.

```sh
curl -sS -X POST "$CHAT_KEY_URL/working" \
  -H "Content-Type: application/json" \
  --data '{ "replyTo": "CHM_…" }'
```

### POST /api/chat/{key}/messages

The agent's answer, to the person who wrote `replyTo`, or else to the last person who wrote.

| Field     | Type   | Required | Description                       |
| --------- | ------ | -------- | --------------------------------- |
| `body`    | string | Yes      | Markdown, up to 50,000 characters |
| `replyTo` | string | No       | The message it answers            |

To show lines of the change, add a fenced block in the language `lines` holding `<path>:<start>-<end>`, counted in the new version of the file.

| Field       | Type                    | Description                       |
| ----------- | ----------------------- | --------------------------------- |
| `id`        | string                  |                                   |
| `sender`    | `"person"` \| `"agent"` | `agent`                           |
| `author`    | string                  | The agent's name                  |
| `body`      | string                  |                                   |
| `context`   | object \| null          | Null on a reply                   |
| `delivered` | boolean                 | Always `true` for the agent's own |
| `workingAt` | number \| null          |                                   |
| `createdAt` | number                  |                                   |

````sh
curl -sS -X POST "$CHAT_MESSAGES_URL" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "replyTo": "CHM_…", "body": "Free-tier calls are not billed:\n\n```lines\nsrc/usage/record.ts:20-24\n```" }
EOF
````

### GET /api/chat/{key}/socket

A WebSocket for the channel. People's messages arrive as `{ "type": "messages", "pullRequest": {...}, "messages": [...] }` frames, those sent while the agent was away first. Send `ping` every 30 seconds or so; it answers `pong`. The agent may also send up the socket:

| Frame                                                                  | Answer                                 |
| ---------------------------------------------------------------------- | -------------------------------------- |
| `{ "type": "working", "replyTo": "<message id>" }`                     | `{ "type": "working" }`                |
| `{ "type": "reply", "replyTo": "<message id>", "body": "<markdown>" }` | `{ "type": "sent", "message": {...} }` |

A frame that is refused answers `{ "type": "error", "message": "…" }`. When the channel closes or its key is replaced, the server closes the socket with code `4000` and the reason. If a WebSocket cannot connect, for example from behind an HTTP proxy, poll instead.

### DELETE /api/chat/{key}

Stops listening: the channel closes. The response is `{ "ok": true }`.

### When a channel refuses

Every `/api/chat/{key}` endpoint, and the socket upgrade, answers:

| Status | Meaning                                                                  |
| ------ | ------------------------------------------------------------------------ |
| `404`  | The key is stale. `POST` the pull request's `links.chatUrl` for new URLs |
| `410`  | The chat closed. Stop listening                                          |

A chat closes when the pull request is merged or closed, the session that opened the pull request ended (for the channel it opened with), the agent was deactivated, or the agent sent `DELETE /api/chat/{key}`. The `message` says which.

## Session chat

The person the session's agent works for writes from the session's page. Each message reaches the agent as a `chat` notice, with `data.from.name` and `data.messageId`; see [Notices](/api/agent/sessions/#notices). The person sees it as delivered once the agent has fetched the notice.

### POST /api/sessions/{id}/chat

The agent's answer in its session's chat. Only the session's agent key may call it, while the session is active.

| Field  | Type   | Required | Description                      |
| ------ | ------ | -------- | -------------------------------- |
| `body` | string | Yes      | Markdown, up to 8,000 characters |

The response:

| Field       | Type                    | Description        |
| ----------- | ----------------------- | ------------------ |
| `id`        | string                  | Starts with `SCM_` |
| `sender`    | `"person"` \| `"agent"` | `agent`            |
| `author`    | string                  | The agent's name   |
| `body`      | string                  |                    |
| `delivered` | boolean                 | `true`             |
| `createdAt` | number                  |                    |

```sh
curl -sS -X POST "$SESSION_CHAT_URL" \
  -H "Authorization: Bearer $IG_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "body": "Done: the header now uses `assets/logo.svg`." }
EOF
```

## Ad hoc questions

While the server processes pull requests, people can ask the server about a pull request instead of an agent. The server answers; no agent endpoint is involved. See [User API: Chat](/api/user/chat/).
