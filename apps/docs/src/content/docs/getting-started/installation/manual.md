---
title: Manual installation
description: Fork the repository and deploy production, staging and per-branch previews with its GitHub Actions workflows.
---

A manual installation forks the repository and deploys it with the GitHub Actions workflows it
ships. You get a production instance, a staging instance, a live preview for every branch, and
the end-to-end tests on every pull request.

## Requirements

- A Cloudflare account on the **Workers Paid** plan.
- A GitHub account for the fork.
- For the one-time commands: a clone of your fork with Node.js 22.22 or later and pnpm 9 or
  later, and `pnpm install` run once. Wrangler comes with the repository.

## What gets deployed

All Cloudflare resources are named after the product.

| Target     | Worker                                                | D1 database                           | Deployed by                |
| ---------- | ----------------------------------------------------- | ------------------------------------- | -------------------------- |
| Production | `iron-garden`                                         | `iron-garden-prod`                    | A push to `main`           |
| Staging    | `iron-garden-staging`                                 | `iron-garden-staging`                 | A push to `main`           |
| Preview    | A Worker Preview of `iron-garden-staging`, per branch | `iron-garden-preview-<branch>-<hash>` | A push to any other branch |

Each target keeps its git repositories in its own Artifacts namespace, named after its
database. Workers AI, the Worker Loader and the
Durable Objects are bound on every target and need no setup.

## 1. Fork and enable the workflows

1. Fork [alonbardavid/iron-garden](https://github.com/alonbardavid/iron-garden).
2. Open the fork's **Actions** tab and enable workflows.

## 2. Create a Cloudflare API token

In the Cloudflare dashboard, create an account API token scoped to the one account you deploy
to, with these permissions:

- Workers Scripts: Edit
- D1: Edit
- Artifacts: Edit

Every deploy first checks that the token can use Artifacts and fails if it cannot.

## 3. Add the repository secret

In the fork, open **Settings › Secrets and variables › Actions** and add the token from step 2
as the repository secret `CLOUDFLARE_API_TOKEN`.

## 4. Create the production database

The production deploy never creates its database. Create it once from your clone:

```sh
export CLOUDFLARE_API_TOKEN=...   # the token from step 2, or run `wrangler login`
pnpm --filter @app/backend exec wrangler d1 create iron-garden-prod
```

The staging deploy creates `iron-garden-staging` itself.

## 5. Deploy

Push to `main` (any commit will do). Two workflows run:

- **Staging Deploy** finds or creates the staging database, applies migrations and deploys
  `iron-garden-staging`. Its first run also turns on Preview URLs for that Worker.
- **Production Deploy** finds `iron-garden-prod`, applies migrations and deploys `iron-garden`.

Watch them in the **Actions** tab.

## 6. Set the setup token

Each Worker reads one secret, `SETUP_TOKEN`: any random string of 4 or more characters, which you
type once to create the first admin. Set it once the first deploy has created the Workers, for
production, staging and branch previews:

```sh
pnpm --filter @app/backend exec wrangler secret put SETUP_TOKEN --name iron-garden
pnpm --filter @app/backend exec wrangler secret put SETUP_TOKEN --name iron-garden-staging
pnpm --filter @app/backend exec wrangler preview base-config secret put SETUP_TOKEN --worker-name iron-garden-staging
```

The last command is for previews, which take their secrets from the staging Worker's Previews
base config when they are created, not from the staging Worker itself. Setting a secret deploys
a new version of that Worker.

## What each push does

| Event                            | Workflow                   | Result                                                                            |
| -------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Push to `main`                   | Staging Deploy             | Migrates and deploys staging.                                                     |
| Push to `main`                   | Production Deploy          | Migrates and deploys production. Fails if `iron-garden-prod` is missing.          |
| Push to any other branch         | Preview Deploy             | Deploys the branch as its own preview and comments its URL on the pull request.   |
| Pull request opened              | Preview Comment on PR Open | Posts the preview URL when the branch was pushed before its pull request existed. |
| Pull request, and push to `main` | E2E Tests                  | Build, type-check, lint, unit tests and the Playwright suite. Needs no secrets.   |
| Branch deleted, and weekly       | Preview Teardown           | Deletes the branch's preview, database and repositories; weekly, prunes orphans.  |
| Push to `main`                   | Docs to GitHub Pages       | Publishes these docs to GitHub Pages, once you turn Pages on.                     |

How to work with previews and staging is in
[Developing with staging](/customization/developing-with-staging/).

## Deploy from your machine

You can deploy production without GitHub Actions. Both commands build first and need
`PROD_HOST` in the shell and a Cloudflare login:

```sh
export CLOUDFLARE_API_TOKEN=...
export PROD_HOST=iron-garden.<subdomain>.workers.dev   # or your custom domain
pnpm db:migrate:remote   # apply migrations to iron-garden-prod
pnpm run deploy          # deploy the iron-garden Worker
```

`pnpm run deploy` does not apply migrations. Run `pnpm db:migrate:remote` first whenever the
update adds any. The next push to `main` deploys over a local deploy.

For more detail on the workflows, see
[deployment](https://github.com/alonbardavid/iron-garden/blob/main/docs/deployment.md) in
the contributor docs.
