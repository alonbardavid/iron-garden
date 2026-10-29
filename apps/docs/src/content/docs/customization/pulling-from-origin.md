---
title: Pulling from origin
description: Keep your copy up to date with the upstream repository, and deploy the update.
---

Your instance runs from your own copy of the repository, which never updates itself. To take in
new releases, merge the upstream repository,
[alonbardavid/iron-garden](https://github.com/alonbardavid/iron-garden), into your
copy's `main` and push. The push redeploys the instance.

## A Deploy-button copy

The Deploy to Cloudflare button creates a new repository, not a GitHub fork, so GitHub offers no
**Sync fork** button. Add the upstream repository as a remote and merge it:

```sh
git remote add upstream https://github.com/alonbardavid/iron-garden.git   # once
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

If git refuses with `refusing to merge unrelated histories`, your copy was created without the
upstream history. Merge once with `git merge upstream/main --allow-unrelated-histories`, and take
the upstream version of every file you never changed. Later merges are ordinary.

## A fork

On your fork's GitHub page, select **Sync fork** › **Update branch**. GitHub merges upstream
`main` into yours, which triggers the deploys. When your changes conflict with upstream, GitHub
cannot sync; merge from a clone with the commands above instead.

## What the push does

A release's D1 migrations must be applied before its code runs.

| Install                                                      | What a push to `main` does                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [Manual installation](/getting-started/installation/manual/) | Staging and production each apply their D1 migrations, then deploy. A failed migration stops that deploy. |
| [Quick start](/getting-started/installation/quick-start/)    | Workers Builds rebuilds and redeploys the Worker with the repository's build and deploy commands.         |

:::caution
The repository's `deploy` script deploys without applying migrations. On a Deploy-button copy,
check whether the update adds files under `migrations/`. If it does, apply them before the new
code runs, from a clone with your Cloudflare credentials:

```sh
export CLOUDFLARE_API_TOKEN=...
export PROD_HOST=<your instance's hostname>
pnpm install
pnpm db:migrate:remote
```

`pnpm db:migrate:remote` targets the D1 database named `iron-garden-prod`. If your database has
another name, apply the migrations to it with `wrangler d1 migrations apply`.
:::

## Try the update first

With the forked workflows, merge upstream into a branch before `main`:

```sh
git fetch upstream
git checkout -b update-upstream main
git merge upstream/main
git push -u origin update-upstream
```

The branch gets its own preview, with a copy of staging's data and repositories, and the
end-to-end tests run on its pull request. Merge to `main` once both look right. See
[Developing with staging](/customization/developing-with-staging/).

## Resolving conflicts in a customized copy

Conflicts come from files both you and upstream changed.

- **Add rather than edit.** Put your features in new files, screens and procedures, and keep
  edits to upstream files to the few lines that wire them in.
- **Read upstream's intent.** Before resolving a conflict, read the upstream commit that caused
  it (`git log upstream/main -- <file>`). Keep its change and re-apply yours on top.
- **The lockfile:** do not hand-merge `pnpm-lock.yaml`. Take upstream's version, run
  `pnpm install`, and commit the result.
- **Migrations:** never edit, rename or delete a migration that has run on any of your
  databases. Add your own schema changes as new files under `migrations/`.
- **Check before you push:** run `pnpm build`, `pnpm type-check`, `pnpm lint` and `pnpm test`,
  the same checks the E2E Tests workflow runs.

An update keeps your secrets, repository variables and Cloudflare resources as they are.
