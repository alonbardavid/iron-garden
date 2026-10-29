---
title: Developing with staging
description: Work on your customizations with per-branch previews, a staging instance, end-to-end tests and local development.
---

A [manual installation](/getting-started/installation/manual/) comes with the development
workflow of [edge-stack](https://github.com/alonbardavid/edge-stack): every branch you push gets a
live preview with its own database and repositories, every pull request runs the end-to-end
tests, and `main` deploys to staging and then production.

## The environments

| Environment | Address                                                              | Data                                                      | Updated by           |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| Local       | `http://localhost:5173`                                              | A local database on your machine                          | `pnpm dev`           |
| Preview     | `https://<preview name>-iron-garden-staging.<subdomain>.workers.dev` | A copy of staging's database and repositories, per branch | A push to the branch |
| Staging     | `https://iron-garden-staging.<subdomain>.workers.dev`                | Its own database and repositories                         | A push to `main`     |
| Production  | `PROD_HOST`, or `https://iron-garden.<subdomain>.workers.dev`        | Its own database and repositories                         | A push to `main`     |

## Branch previews

Push any branch other than `main` and the **Preview Deploy** workflow:

1. Works out a database name and a preview name from the branch.
2. The first time, creates the branch's database, copies staging's database into it, and copies
   staging's git repositories into the preview's own storage.
3. Applies the branch's migrations to that database.
4. Deploys the branch as a Worker Preview of the staging Worker, with a stable URL.
5. Comments on the pull request with the preview URL, the preview name, the database, and the
   Worker's size compared with `main`.

A later push to the same branch reuses its database, and data you create in a preview stays.
Pushing before the pull request exists is fine: the comment is posted when you open it.

**Signing in to a preview:** its database is a copy of staging's, so staging's users and
passwords work there. Its secrets come from the staging Worker's Previews base config, which you
set once during [manual installation](/getting-started/installation/manual/).

**Cleaning up:** deleting the branch deletes its preview, database and repositories. A weekly run
also removes any that were left behind.

:::note
A preview copies staging only when it is first created. To start a preview over from current
staging data, delete the branch and push it again.
:::

## Staging

Every push to `main` migrates and deploys staging, alongside production.

Staging is a full instance of its own. Create its first admin through
[Initial setup](/getting-started/installation/initial-setup/) at its own address.

## End-to-end tests

The **E2E Tests** workflow runs on every pull request and on `main`: build, type-check, lint, unit
tests, then the Playwright suite against a local server. It needs no secrets. Without Cloudflare
Artifacts it runs with git hosting off, and the tests that push real git skip themselves. The
Playwright report is attached to the run.

## Local development

```sh
pnpm install
pnpm dev          # builds, then runs the app at http://localhost:5173
pnpm test         # the Playwright suite; run `pnpm --filter tests exec playwright install` once
pnpm test:unit    # unit tests
```

The local first-run form takes the setup token `local-dev-setup-token-7c41e9a2b85d`. Apply new
migrations to the local database with `pnpm db:migrate`.

Two Cloudflare services have no local simulator, so they are off locally until you point the dev
server at the real ones:

| Feature       | Turn it on with                                      | Token permission |
| ------------- | ---------------------------------------------------- | ---------------- |
| Git hosting   | `ARTIFACTS_NAMESPACE=iron-garden-dev-$USER pnpm dev` | Artifacts: Edit  |
| AI processing | `WORKERS_AI=true pnpm dev`                           | Workers AI: Read |

Give the dev server credentials first, with an API token or `wrangler login`:

```sh
export CLOUDFLARE_API_TOKEN=...
ARTIFACTS_NAMESPACE=iron-garden-dev-$USER pnpm dev
```

Without git hosting, repositories, sessions and pull requests answer with an error. With
`WORKERS_AI=true`, **Admin › Agent config** can switch pull request processing to the server.

To work on the docs, run `pnpm --filter @app/docs dev` (at `http://localhost:4321/docs/`).

## A typical change

1. Branch from `main` and work locally with `pnpm dev`.
2. Push the branch and open a pull request. Check the preview from the comment, and the E2E
   Tests result.
3. Merge. Staging and production deploy, each applying migrations first.

For the build and the local database in more depth, see
[development](https://github.com/alonbardavid/iron-garden/blob/main/docs/development.md)
and [deployment](https://github.com/alonbardavid/iron-garden/blob/main/docs/deployment.md)
in the contributor docs.
