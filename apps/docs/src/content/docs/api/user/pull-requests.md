---
title: Pull requests
description: List and read pull requests, their files, references and activity, open them on GitHub or from GitHub, and merge them.
---

Reading a pull request takes Read on its repository, with any key. Merging, opening on GitHub and opening from GitHub are for people only: an agent key gets `403`. Pull requests from an agent's session are opened with [the agent API](/api/agent/pull-requests/).

## GET /api/repositories/{name}/pull-requests

Every pull request of the repository. Each item is a [pull request](/api/agent/pull-requests/#the-pull-request-object) without `description`, `baseCommit`, `headCommit`, `processingError`, `files`, `groups`, `github` and `merge`. `review.accepted` counts the changes you accepted.

```sh
curl -sS https://<instance>/api/repositories/billing/pull-requests -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

## GET /api/repositories/{name}/pull-requests/{number}

The [pull request](/api/agent/pull-requests/#the-pull-request-object), with its files and brackets.

## GET /api/repositories/{name}/pull-requests/{number}/file

A changed file before and after the pull request.

| Query  | Type   | Required | Description                     |
| ------ | ------ | -------- | ------------------------------- |
| `path` | string | Yes      | A file the pull request changes |

The response:

| Field    | Type           | Description                                                |
| -------- | -------------- | ---------------------------------------------------------- |
| `path`   | string         |                                                            |
| `before` | object \| null | The file at the base commit; null when the file is added   |
| `after`  | object \| null | The file at the head commit; null when the file is deleted |

Each side is one of:

| `kind`      | Other fields              |
| ----------- | ------------------------- |
| `text`      | `text`                    |
| `image`     | `type`, `base64`, `bytes` |
| `binary`    | `bytes`                   |
| `too-large` | `bytes`                   |

## GET /api/repositories/{name}/pull-requests/{number}/reference

A file as the review reads a reference: on the target branch, at the pull request's base commit. It need not be part of the change.

| Query  | Type   | Required | Description                             |
| ------ | ------ | -------- | --------------------------------------- |
| `path` | string | Yes      | The file's path; up to 1,000 characters |

The response:

| Field     | Type           | Description                                                                                                                           |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | string         |                                                                                                                                       |
| `version` | object \| null | `{ kind: "text", text }`, `{ kind: "binary", bytes }` or `{ kind: "too-large", bytes }`; null when the target branch has no such file |

```sh
curl -sS "https://<instance>/api/repositories/billing/pull-requests/12/reference?path=src/routes/credits.ts" \
  -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

```json
{
  "path": "src/routes/credits.ts",
  "version": { "kind": "text", "text": "import { Hono } from \"hono\";\n…" }
}
```

## GET /api/repositories/{name}/pull-requests/{number}/activity

The pull request's commits, with their transcripts, and the reviews people sent.

| Field     | Type  | Description                                                                                                                                      |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commits` | array | `{ sha, title, message, author, committedAt, transcript }`; `transcript` is a transcript summary or null                                         |
| `reviews` | array | `{ id, author, verdict, body, revision, accepted, total, createdAt }`, oldest first; `author` is `{ id, name }`, `verdict` `accept` or `changes` |

## GET /api/repositories/{name}/pull-requests/{number}/transcripts/{transcript}

A transcript of one of the pull request's commits, with its entries. See [Transcripts](/api/agent/transcripts/#the-entry-format) for the entry format.

## GET /api/repositories/{name}/pull-requests/{number}/github

What GitHub says about the pull request, on a repository connected to GitHub. It links the GitHub pull request for the same branch the first time it finds one.

| Field       | Type           | Description                                                                                                  |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `connected` | boolean        | Whether the repository is connected to GitHub; the rest is empty when not                                    |
| `pull`      | object \| null | `{ number, url, state, draft, mergeable, mergeableState, headSha }`; `state` is `open`, `closed` or `merged` |
| `checks`    | array          | `{ name, source, status, conclusion, url }` on the GitHub pull request's head                                |
| `runs`      | array          | Workflow runs on that head                                                                                   |

## POST /api/repositories/{name}/pull-requests/{number}/github

Pushes the reviewed head to a branch of the same name on GitHub and opens a GitHub pull request for it. People with Write only; the pull request must be open. It takes no body and answers `{ "ok": true }`.

| Status | When                                             |
| ------ | ------------------------------------------------ |
| `400`  | The pull request is processing, merged or closed |
| `409`  | A GitHub pull request already stands for it      |
| `412`  | GitHub refused the repository's token            |

## POST /api/repositories/{name}/pull-requests/{number}/merge

Merges an open pull request. On a repository connected to GitHub it merges there, once its GitHub pull request exists; otherwise in this instance's storage. People with Write only.

| Field    | Type   | Required | Description                                                                            |
| -------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| `method` | string | Yes      | `merge` (a merge commit), `squash` (one commit) or `rebase` (the branch's own commits) |

The response is the [pull request](/api/agent/pull-requests/#the-pull-request-object), with `merge` set.

| Status | When                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | The pull request is processing, merged or closed, or its session repository is gone                                                               |
| `403`  | An agent key, or less than Write                                                                                                                  |
| `409`  | The branch has commits the review has not seen (the agent refreshes first), or, merging here, the target branch moved on since the branch left it |

```sh
curl -sS -X POST https://<instance>/api/repositories/billing/pull-requests/12/merge \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "method": "squash" }'
```

## Opening from GitHub

On a repository connected to GitHub, while the server groups pull requests, people with Write open a pull request from a GitHub pull request or branch, with no agent. The server groups it.

### GET /api/repositories/{name}/pull-requests/from-github

`{ "available": boolean }`: whether you can open one here now. Always `false` for an agent key.

### GET /api/repositories/{name}/pull-requests/from-github/pulls

The open GitHub pull requests from the repository's own branches that no pull request here stands for yet: `{ number, title, branch, targetBranch, url, author }[]`.

### POST /api/repositories/{name}/pull-requests/from-github

| Field    | Type   | Required | Description                                                                                                   |
| -------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------- |
| `source` | object | Yes      | `{ "kind": "pull", "number": <GitHub number> }`, or `{ "kind": "branch", "branch", "targetBranch", "title" }` |

`branch` and `targetBranch` are up to 250 characters, `title` up to 300. The response is the [pull request](/api/agent/pull-requests/#the-pull-request-object), `status` `processing`. It answers `400` while the server does not group pull requests, or when the GitHub pull request is not open from a branch of the connected repository.

```sh
curl -sS -X POST https://<instance>/api/repositories/billing/pull-requests/from-github \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "source": { "kind": "pull", "number": 341 } }'
```
