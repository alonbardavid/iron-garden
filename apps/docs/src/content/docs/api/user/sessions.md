---
title: Sessions
description: Read a repository's sessions, act on your own agents' sessions with a personal key, chat with your agent, and clear unmerged work.
---

People do not start sessions: `POST /api/sessions` refuses a personal key with `403`. With a personal key, or signed in, you read every session of a repository you can read, and act on the sessions of agents you own.

## Your agents' sessions

The [agent session endpoints](/api/agent/sessions/) take the personal key of the person who owns the session's agent, with the same input and output. A session of someone else's agent answers `404`.

| Endpoint                               | With your personal key                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `GET /api/sessions/{id}`               | The session and its links                                                |
| `PATCH /api/sessions/{id}`             | Change its title, goal, context or contact                               |
| `POST /api/sessions/{id}/end`          | End it, such as when the agent stopped without ending it                 |
| `POST /api/sessions/{id}/token`        | A git token for its session repository; you need Write on the repository |
| `POST /api/sessions/{id}/activity`     | Report files as being edited for it                                      |
| `GET /api/sessions/{id}/notifications` | Take its waiting notices; the agent then no longer gets them             |
| `POST /api/sessions/{id}/listen`       | New listener URLs; the agent's stop working                              |
| `POST /api/sessions/{id}/messages`     | Message another session as this one                                      |
| `PUT /api/pull-requests/{id}/groups`   | Send the brackets of its pull request; you need Write                    |
| `POST /api/pull-requests/{id}/refresh` | Refresh its pull request; you need Write                                 |

Opening a pull request, uploading transcripts and answering in chat stay with the agent key.

```sh
curl -sS -X POST https://<instance>/api/sessions/SES_…/end \
  -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

## GET /api/repositories/{name}/sessions

Every session of the repository, newest first, whichever agent runs it. Anyone who can read the repository may call it, including agent keys.

| Field            | Type                                  | Description                                                                                   |
| ---------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`             | string                                |                                                                                               |
| `title`          | string \| null                        |                                                                                               |
| `goal`           | string \| null                        |                                                                                               |
| `client`         | string \| null                        | What the agent said it is, or its user agent                                                  |
| `status`         | `active` \| `ended`                   |                                                                                               |
| `live`           | boolean                               | Its agent called the API for it, pushed, listened or listened for chat in the last 15 minutes |
| `lastSeenAt`     | number \| null                        |                                                                                               |
| `agent`          | `{ name, ownerName }`                 |                                                                                               |
| `baseBranch`     | string                                |                                                                                               |
| `pullRequests`   | `{ number, title, status, branch }[]` |                                                                                               |
| `unmerged`       | boolean                               | A pull request processing or open, or a pushed branch with none                               |
| `fileCount`      | number                                | Files in its working set                                                                      |
| `collisionCount` | number                                | Its open collisions, either way                                                               |
| `createdAt`      | number                                |                                                                                               |
| `endedAt`        | number \| null                        |                                                                                               |

```sh
curl -sS https://<instance>/api/repositories/billing/sessions -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

## GET /api/repositories/{name}/sessions/{id}

One session as its page shows it: every field of the list, and:

| Field              | Type                                | Description                                                                                                                           |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `context`          | string \| null                      |                                                                                                                                       |
| `baseCommit`       | string \| null                      |                                                                                                                                       |
| `workingSet`       | `{ editing, committed, exclusive }` | `editing`: declared paths; `committed`: `{ branch, paths }[]` from pushed branches; `exclusive`: the ones a mark-exclusive rule marks |
| `unmergedBranches` | string[]                            | Pushed branches with no pull request processing or open                                                                               |
| `collisions`       | array                               | `{ id, path, rule, caused, other: { id, title, agent }, createdAt }`                                                                  |
| `contact`          | array \| null                       | Null while an admin has messaging between sessions turned off                                                                         |
| `messages`         | array \| null                       | Its messages with other sessions, as [notices](/api/agent/sessions/#notices); only for the agent's owner, else null                   |
| `transcripts`      | array                               | Its transcripts' summaries, newest first, committed or not                                                                            |
| `canChat`          | boolean                             | Whether you are the person its agent works for                                                                                        |
| `canDismiss`       | boolean                             | Whether you may [dismiss its unmerged work](#post-apirepositoriesnamesessionsiddismiss)                                               |

## GET /api/repositories/{name}/sessions/{id}/transcripts/{transcript}

One of the session's transcripts with its entries: the summary fields of [an upload's response](/api/agent/transcripts/#post-apisessionsidtranscripts) with `entries` as the list of [entries](/api/agent/transcripts/#the-entry-format). Anyone who can read the repository may call it.

## GET /api/repositories/{name}/sessions/{id}/chat

The chat between the session's agent and you, oldest first. Only the person the agent works for may call it, with a personal key or signed in; anyone else gets `403`.

| Field       | Type                    | Description                                 |
| ----------- | ----------------------- | ------------------------------------------- |
| `id`        | string                  |                                             |
| `sender`    | `"person"` \| `"agent"` |                                             |
| `author`    | string                  | Your name, or the agent's                   |
| `body`      | string                  | Markdown                                    |
| `delivered` | boolean                 | For yours: whether the agent has fetched it |
| `createdAt` | number                  |                                             |

## POST /api/repositories/{name}/sessions/{id}/chat

Writes to your agent in the session's chat. It reaches the agent as a `chat` notice on its listener. Only the person the agent works for may call it, while the session is active.

| Field  | Type   | Required | Description                      |
| ------ | ------ | -------- | -------------------------------- |
| `body` | string | Yes      | Markdown, up to 8,000 characters |

The response is the message, as in the list above.

| Status | When                                       |
| ------ | ------------------------------------------ |
| `403`  | You are not the person its agent works for |
| `409`  | The session ended                          |

```sh
curl -sS -X POST https://<instance>/api/repositories/billing/sessions/SES_…/chat \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "body": "Use the existing `formatMoney` helper rather than a new one." }
EOF
```

## POST /api/repositories/{name}/sessions/{id}/dismiss

Clears an ended session's pushed branches that never got a pull request, and their files leave its working set. Anyone with Write on the repository may call it. It takes no body and answers `{ "ok": true }`; a session that has not ended gets `400`.
