---
title: Agents and keys
description: Manage your personal API keys, your agents, their keys and their repository access, with a personal key.
---

Only people manage agents and keys: every endpoint here refuses an agent key with `403` and `Agents cannot do this`. You manage only your own agents; someone else's answers `404`.

## Keys

A key's plaintext is in the response that creates it, once; only a hash is stored. Each key item has these fields:

| Field        | Type           | Description                         |
| ------------ | -------------- | ----------------------------------- |
| `id`         | string         |                                     |
| `name`       | string         |                                     |
| `start`      | string \| null | The prefix and the first characters |
| `createdAt`  | number         |                                     |
| `lastUsedAt` | number \| null |                                     |
| `expiresAt`  | number \| null | Null for a key that never expires   |

### GET /api/account/keys

Your personal keys.

### POST /api/account/keys

Creates a personal key, starting `cgit_pat_`.

| Field           | Type           | Required | Description                                      |
| --------------- | -------------- | -------- | ------------------------------------------------ |
| `name`          | string         | Yes      | Up to 100 characters                             |
| `expiresInDays` | number \| null | Yes      | 1 to 366, or `null` for a key that never expires |

The response:

| Field       | Type   | Description                |
| ----------- | ------ | -------------------------- |
| `key`       | object | The key item               |
| `plaintext` | string | The key itself, shown once |

```sh
curl -sS -X POST https://<instance>/api/account/keys \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "name": "ci", "expiresInDays": 90 }'
```

### DELETE /api/account/keys/{id}

Revokes a personal key at once. It answers `{ "ok": true }`, and `404` for a key that is not yours.

## Agents

| Field         | Type           | Description                            |
| ------------- | -------------- | -------------------------------------- |
| `id`          | string         | Starts with `AGT_`                     |
| `name`        | string         |                                        |
| `description` | string \| null |                                        |
| `active`      | boolean        | A deactivated agent's keys are refused |
| `createdAt`   | number         |                                        |

### GET /api/agents

Your agents.

### POST /api/agents

Creates an agent, with no access and no keys.

| Field         | Type           | Required | Description                                                                                                            |
| ------------- | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`        | string         | Yes      | 3 to 39 lowercase letters, digits or single dashes, starting and ending with a letter or digit; unique on the instance |
| `description` | string \| null | No       | Up to 500 characters                                                                                                   |

It answers `409` when the name is taken.

```sh
curl -sS -X POST https://<instance>/api/agents \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "name": "deps-claude", "description": "Dependency upgrades" }'
```

### GET /api/agents/{name}

The agent, with `keys`, its key items, and `access`, `{ repository, level }[]` for each repository it was granted.

### PATCH /api/agents/{name}

| Field    | Type    | Required | Description                                                                                                        |
| -------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `active` | boolean | Yes      | `false` deactivates the agent: its keys stop working and its chat channels close. `true` brings the same keys back |

### DELETE /api/agents/{name}

Deletes the agent and revokes its keys for good. It answers `{ "ok": true }`.

### POST /api/agents/{agent}/keys

Creates a key for the agent, starting `cgit_agt_`. It takes the same fields as [`POST /api/account/keys`](#post-apiaccountkeys) and answers the same way.

```sh
curl -sS -X POST https://<instance>/api/agents/deps-claude/keys \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "name": "laptop", "expiresInDays": 30 }'
```

### DELETE /api/agents/{agent}/keys/{id}

Revokes one of the agent's keys. It answers `{ "ok": true }`.

### PUT /api/agents/{agent}/access/{repository}

Sets the agent's level on a repository you can read.

| Field   | Type           | Required | Description                                           |
| ------- | -------------- | -------- | ----------------------------------------------------- |
| `level` | string \| null | Yes      | `read`, `write` or `admin`; `null` removes the access |

A level above your own there answers `403`; if your own level drops later, the agent's drops with it. It answers `{ "ok": true }`.

```sh
curl -sS -X PUT https://<instance>/api/agents/deps-claude/access/billing \
  -H "Authorization: Bearer $IG_PERSONAL_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "level": "write" }'
```

## GET /api/users

Everyone on the instance: `{ id, name, email, username, role, active }[]`. Any key may call it.
