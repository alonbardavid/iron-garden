---
title: Chat
description: Talk to your own agents listening on a pull request, and ask the server ad hoc questions, with a personal key.
---

On a pull request, you talk to your own agents listening there, one conversation per agent, and to the server on the ad hoc channel while it processes pull requests. Nobody reads or writes to someone else's agent. Every endpoint here is for people only: an agent key gets `403`. The agent's side is in [Agent API: Chat](/api/agent/chat/); a session's chat with its agent is in [Sessions](/api/user/sessions/#post-apirepositoriesnamesessionsidchat).

## GET /api/repositories/{name}/pull-requests/{number}/chat

Your agents listening on the pull request, and the ad hoc channel while the server processes pull requests.

| Field        | Type           | Description                                                                               |
| ------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `channel`    | string         | The channel id, for the endpoints below; `ad-hoc` for the server                          |
| `agent`      | `{ id, name }` | The agent; `Ad hoc` for the server                                                        |
| `madeThis`   | boolean        | The agent opened this pull request                                                        |
| `adHoc`      | boolean        | The server answers here                                                                   |
| `live`       | boolean        | The agent polled, replied or held its socket in the last minute; always `true` for ad hoc |
| `lastSeenAt` | number \| null |                                                                                           |

```sh
curl -sS https://<instance>/api/repositories/billing/pull-requests/12/chat -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

```json
[
  {
    "channel": "CHC_…",
    "agent": { "id": "AGT_…", "name": "deps-claude" },
    "madeThis": true,
    "adHoc": false,
    "live": true,
    "lastSeenAt": 1760000000000
  }
]
```

## GET /api/repositories/{name}/pull-requests/{number}/chat/{channel}

Your conversation on the channel, oldest first. On `ad-hoc`, your own ad hoc thread.

| Field       | Type                    | Description                                                                       |
| ----------- | ----------------------- | --------------------------------------------------------------------------------- |
| `id`        | string                  |                                                                                   |
| `sender`    | `"person"` \| `"agent"` |                                                                                   |
| `author`    | string                  | Your name, or the agent's (`Ad hoc` for the server)                               |
| `body`      | string                  | Markdown; an answer may hold `lines` blocks                                       |
| `context`   | object \| null          | What you were looking at; see [Message context](/api/agent/chat/#message-context) |
| `delivered` | boolean                 | Whether the agent has had your message                                            |
| `workingAt` | number \| null          | When the agent said it was working on your message                                |
| `createdAt` | number                  |                                                                                   |

## POST /api/repositories/{name}/pull-requests/{number}/chat/{channel}

Writes to the agent on the channel. It reaches an open socket at once, and the agent's next poll otherwise. On `ad-hoc`, it asks the server, which answers in your thread in the background.

| Field     | Type   | Required | Description                                                                                                            |
| --------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `body`    | string | Yes      | Markdown, up to 20,000 characters                                                                                      |
| `context` | object | No       | [Message context](/api/agent/chat/#message-context); `start` and `end` come together, with `path`, and `start` ≤ `end` |

The response is the message.

| Status | When                                                         |
| ------ | ------------------------------------------------------------ |
| `400`  | On `ad-hoc`, while the server does not process pull requests |
| `404`  | None of your agents listens on that channel                  |
| `410`  | The channel closed                                           |

```sh
curl -sS -X POST https://<instance>/api/repositories/billing/pull-requests/12/chat/CHC_… \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "body": "Why does this skip free-tier teams?", "context": { "page": "files", "path": "src/usage/record.ts", "start": 20, "end": 24 } }
EOF
```

## DELETE /api/repositories/{name}/pull-requests/{number}/chat/{channel}/messages/{message}

Takes back a message of yours the agent has not had yet. It answers `{ "ok": true }`, and `409` once the agent has it.
