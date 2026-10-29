---
title: Repositories
description: Read repositories, their files, branches and commits; change their settings and members; and manage their rules.
---

Reading a repository takes Read, with any key. Changing its settings and members takes Admin and a person: an agent key gets `403`, whatever its level. Rules take Admin, from a person or an agent.

## The repository object

| Field           | Type                         | Description                     |
| --------------- | ---------------------------- | ------------------------------- |
| `id`            | string                       | Starts with `REPO_`             |
| `name`          | string                       | The name in its URLs            |
| `description`   | string \| null               |                                 |
| `defaultBranch` | string                       |                                 |
| `level`         | `read` \| `write` \| `admin` | The caller's level on it        |
| `cloneUrl`      | string                       | `https://<instance>/<name>.git` |
| `createdAt`     | number                       |                                 |
| `updatedAt`     | number                       |                                 |

## GET /api/repositories

Every repository the caller can read, each with `stats`: `openPullRequests`, `activeSessions`, `members`, and `github`, `{ owner, repo }` or null.

```sh
curl -sS https://<instance>/api/repositories -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

## GET /api/repositories/{name}

The [repository](#the-repository-object), with `head`: the default branch's commit, or null when it has none or git hosting is off.

## GET /api/repositories/{name}/contents

What a path names at a branch or commit.

| Query  | Type   | Required | Description                                          |
| ------ | ------ | -------- | ---------------------------------------------------- |
| `ref`  | string | No       | A branch or commit; the default branch when left out |
| `path` | string | No       | The path; the root when empty                        |

A directory answers `{ "kind": "directory", "entries": [{ name, type }] }`, directories first, where `type` is `directory`, `file`, `symlink` or `submodule`. A file answers `{ "kind": "file", "file": {...} }`, with `file` as on [a pull request's file](/api/user/pull-requests/#get-apirepositoriesnamepull-requestsnumberfile).

```sh
curl -sS "https://<instance>/api/repositories/billing/contents?ref=main&path=src/routes" \
  -H "Authorization: Bearer $IG_PERSONAL_KEY"
```

## GET /api/repositories/{name}/files

Every file path at `ref` (a branch or commit; the default branch when left out): `{ "paths": string[], "truncated": boolean }`. A very large tree is cut short, with `truncated` `true`.

## GET /api/repositories/{name}/branches

Every branch, the default one first: `{ name, commit, isDefault }[]`.

## GET /api/repositories/{name}/commits

A page of a branch's or commit's history, newest first.

| Query    | Type   | Required | Description                                          |
| -------- | ------ | -------- | ---------------------------------------------------- |
| `ref`    | string | No       | A branch or commit; the default branch when left out |
| `offset` | number | No       | Commits to skip; 0 by default                        |
| `limit`  | number | No       | 1 to 100; 30 by default                              |

The response is `{ "commits": [{ hash, message, author, committedAt, parents }], "hasMore": boolean }`.

## GET /api/repositories/{name}/commits/{hash}

One commit, by its full hash, and the files it changes against its first parent: `{ commit, files }`, with `files` as `{ path, change, oldLines, newLines }[]`.

## GET /api/repositories/{name}/commits/{hash}/file

A file the commit changes, before and after it. It takes `path` as a query parameter and answers like [a pull request's file](/api/user/pull-requests/#get-apirepositoriesnamepull-requestsnumberfile).

## PATCH /api/repositories/{name}

Changes the repository's settings. People with Admin only.

| Field           | Type           | Required | Description                                 |
| --------------- | -------------- | -------- | ------------------------------------------- |
| `newName`       | string         | No       | A new name, in the same shape as an agent's |
| `description`   | string \| null | No       | Up to 500 characters                        |
| `defaultBranch` | string         | No       | A valid git branch name                     |

The response is the [repository](#the-repository-object). A name already taken answers `409`.

## DELETE /api/repositories/{name}

Deletes the repository, its session repositories and everything recorded about it. People with Admin only. It answers `{ "ok": true }`.

## Members

### GET /api/repositories/{name}/members

| Field     | Type  | Description                                                                                                                              |
| --------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `members` | array | `{ user: { id, name, email, username, role, active }, level }`                                                                           |
| `agents`  | array | `{ agentId, agentName, ownerUserId, granted, effective }`: the level each agent was granted, and the one it has, never above its owner's |

### PUT /api/repositories/{name}/members/{userId}

Adds a person, or changes their level. People with Admin only.

| Field   | Type   | Required | Description                |
| ------- | ------ | -------- | -------------------------- |
| `level` | string | Yes      | `read`, `write` or `admin` |

It answers `{ "ok": true }`. Take user ids from [`GET /api/users`](/api/user/agents-and-keys/#get-apiusers).

### DELETE /api/repositories/{name}/members/{userId}

Removes a person. People with Admin only. Removing or lowering the last admin is refused.

## Rules

A pull request copies the rules when it is opened or refreshed. A change to a rule applies from the next revision. See [Rules](/administration/rules/) for what each action does.

| Field         | Type                         | Description                                                    |
| ------------- | ---------------------------- | -------------------------------------------------------------- |
| `id`          | string                       |                                                                |
| `name`        | string                       |                                                                |
| `match`       | object                       | See [A rule's input](#a-rules-input)                           |
| `action`      | string                       |                                                                |
| `reviewers`   | `{ id, name }[]`             | For `require-review`                                           |
| `workflow`    | `{ id, path, name }` \| null | For `run-workflow`                                             |
| `enabled`     | boolean                      |                                                                |
| `lastMatched` | `{ number, at }` \| null     | The latest pull request it matched                             |
| `recent`      | `{ matched, of }`            | How many of the repository's last ten pull requests it matched |
| `createdAt`   | number                       |                                                                |
| `updatedAt`   | number                       |                                                                |

### GET /api/repositories/{name}/rules

Every rule. Read.

### GET /api/repositories/{name}/rules/{id}

One rule. Read.

### POST /api/repositories/{name}/rules

Creates a rule, sent as `{ "rule": {...} }`. Admin.

### PUT /api/repositories/{name}/rules/{id}

Replaces a rule, sent as `{ "rule": {...} }`. Admin.

#### A rule's input

| Field       | Type                         | Required | Description                                                                        |
| ----------- | ---------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `name`      | string                       | Yes      | Up to 100 characters                                                               |
| `match`     | object                       | Yes      | One of the three below                                                             |
| `action`    | string                       | Yes      | `auto-accept`, `high-impact`, `require-review`, `run-workflow` or `mark-exclusive` |
| `reviewers` | string[]                     | No       | Up to 20 user ids, for `require-review`                                            |
| `workflow`  | `{ id, path, name }` \| null | No       | A GitHub Actions workflow, for `run-workflow`                                      |
| `enabled`   | boolean                      | No       | `true` by default                                                                  |

| `match.kind` | Other fields                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `files`      | `syntax`, `glob` or `regex`; `patterns`, 1 to 50, each up to 300 characters                               |
| `structure`  | `constructs`, one or both of `imports` and `comments`; `paths`, up to 50 patterns limiting where it looks |
| `prompt`     | `prompt`, what to look for in words, up to 5,000 characters; `paths`, up to 50 patterns                   |

A `mark-exclusive` rule takes only `files`.

```sh
curl -sS -X POST https://<instance>/api/repositories/billing/rules \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data @- <<'EOF'
{ "rule": { "name": "Images are exclusive", "match": { "kind": "files", "syntax": "glob", "patterns": ["assets/**/*.png"] }, "action": "mark-exclusive" } }
EOF
```

### PUT /api/repositories/{name}/rules/{id}/enabled

Turns a rule on or off: `{ "enabled": boolean }`. Admin. The response is the rule.

### DELETE /api/repositories/{name}/rules/{id}

Deletes a rule. Admin. It answers `{ "ok": true }`.

### POST /api/repositories/{name}/rules/copy

Copies rules from another repository into this one. Admin here, and Read on the other.

| Field  | Type     | Required | Description                 |
| ------ | -------- | -------- | --------------------------- |
| `from` | string   | Yes      | The other repository's name |
| `ids`  | string[] | Yes      | 1 to 100 rule ids there     |

The response is `{ "rules": [...], "dropped": string[] }`. `dropped` names the `run-workflow` rules left behind because this repository has no workflow at the same path.
