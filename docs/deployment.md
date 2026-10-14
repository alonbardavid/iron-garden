# Deployment

Two long-lived Workers, plus one preview per branch:

| Target         | Worker                                             | D1                                    | Deploys                                         |
| -------------- | -------------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| **production** | `iron-garden`                                      | `iron-garden-prod`                    | push to `main` (`prod-deploy.yml`)              |
| **staging**    | `iron-garden-staging`                              | `iron-garden-staging`                 | push to `main` (`staging-deploy.yml`)           |
| **preview**    | `iron-garden-staging`, a Worker Preview per branch | `iron-garden-preview-<branch>-<hash>` | push to any other branch (`preview-deploy.yml`) |

`e2e.yml` runs Playwright on every PR and on `main`.

## Generated deploy configs

No deploy uses `wrangler.jsonc` directly. After `pnpm build`, `scripts/gen-wrangler-config.mjs`
stamps a target onto the build-emitted `apps/backend/dist/worker/wrangler.json` and writes it
beside it; every deploy and migrate command passes `--config dist/worker/<outFile>`.

- Static per-target settings (worker name, extra allowed auth hosts, output file) live in
  `scripts/lib/environments.mjs`. Nothing in the repo names an instance.
- Per-deploy values come from env: `TARGET`, `DB_NAME`, `DB_ID` and `DEPLOY_ORIGIN` (the
  canonical origin).
- Every target gets the git-hosting binding, `ARTIFACTS`, with an Artifacts namespace named
  after the target's D1. The deploy token needs Artifacts: Edit (Workers Paid): the
  `cloudflare-env` action probes it and fails the deploy when it cannot, so no target runs
  without git hosting. Only `preview-teardown.yml` tolerates a token without it.
- Every target, previews included, gets the server-side processing bindings: Workers AI, a
  Worker Loader and the `PROCESSING` Durable Object, none of which needs creating. Agents
  group pull requests until an admin switches processing to the server.
- The committed config has no `database_id`, but the generated one must:
  `wrangler d1 migrations apply --remote` needs it. Each workflow resolves the id by name.

## Instance settings

What differs between instances lives in GitHub repo variables, read by the deploy workflows:

| Variable    | Used by              | Meaning                                                                          |
| ----------- | -------------------- | -------------------------------------------------------------------------------- |
| `PROD_HOST` | production, optional | Production hostname, no scheme; unset uses `iron-garden.<subdomain>.workers.dev` |

Local `pnpm run deploy` and `pnpm db:migrate:remote` read the same names from the shell.

Each Worker also reads two secrets, set with `wrangler secret put`: `BETTER_AUTH_SECRET`, and
`SETUP_TOKEN` (4 characters or more), which unlocks the first-run form until the first admin
exists.

## Preview

Every push to a non-`main` branch gets its own environment:

1. A stable per-branch D1 name and preview name are computed from the branch.
2. If that D1 does not exist, it is created and the `iron-garden-staging` D1 is cloned
   into it, and staging's git repositories are copied into the preview's Artifacts
   namespace (`scripts/artifacts-repos.mjs`). An existing preview D1 is
   reused, so a re-push keeps its data and repositories.
3. Migrations are applied, and `wrangler preview` deploys the branch as a
   [Worker Preview](https://developers.cloudflare.com/workers/previews/) of the staging
   Worker, at `<preview name>-iron-garden-staging.<subdomain>.workers.dev`. Not a version
   upload: Cloudflare gives no version URL to a Worker with Durable Objects, and a version
   upload cannot apply their migrations. Each preview gets its own Durable Object namespace.
4. The stable preview URL is commented on the PR, with the Worker's size.

A preview inherits none of the Worker's own settings: `gen-wrangler-config.mjs` repeats
its bindings and vars in a `previews` block, and its secrets come from the Previews base
config. Its URL exists only while the staging Worker has Preview URLs on, which a new
Worker does not: the staging target sets `preview_urls: true`, so the first staging deploy
turns them on, and a preview deploy fails until then. Set them once, with staging's values (GitHub tokens are encrypted with
`BETTER_AUTH_SECRET`, and a preview's D1 is a copy of staging's):

```sh
pnpm --filter @app/backend exec wrangler preview base-config secret put BETTER_AUTH_SECRET --worker-name iron-garden-staging
pnpm --filter @app/backend exec wrangler preview base-config secret put SETUP_TOKEN --worker-name iron-garden-staging
```

A preview takes the base secrets when it is created; one created before they were set
gets them with `wrangler preview secret put <NAME> --name <preview name>`.

`preview-teardown.yml` deletes a branch's Worker Preview, D1 and git repositories when the
branch is deleted, and weekly prunes orphan D1s and repositories.

The PR comment's "Worker size" section is parsed by `scripts/worker-size-comment.mjs` from
wrangler's own `Total Upload` line. The limit and growth warning live as env in
`preview-deploy.yml`; the main baseline is the `worker-size-main` artifact that
`staging-deploy.yml` uploads, and is best-effort.

## Staging

`staging-deploy.yml` finds-or-creates the `iron-garden-staging` D1, migrates it, and
`wrangler deploy`s. Because previews clone this D1, staging keeps preview data and schema
current; preview versions on the same Worker are pinned to their aliases and unaffected.

## Production

`prod-deploy.yml` resolves `iron-garden-prod` by name and **fails if it is missing** — it
never creates it, so a misconfigured deploy cannot come up against an empty database. A
`PROD_HOST` hostname is attached to the `iron-garden` Worker as a
custom domain in Cloudflare; the deploy does not create the route. Locally,
`pnpm run deploy` and `pnpm db:migrate:remote` build, then take the button's path below.

## Deploy to Cloudflare button

The README's button deploys a production instance with
[Workers Builds](https://developers.cloudflare.com/workers/platform/deploy-buttons/), no
GitHub Actions involved. It reads the root `wrangler.jsonc` (the Worker `iron-garden` and
its D1 `iron-garden-prod`), the secrets in `.dev.vars.example` and their descriptions under
`cloudflare.bindings` in `package.json`; it lets the user rename the Worker and the database,
creates the database and writes its id into the root `wrangler.jsonc` of their copy. That
file is not deployed itself, since the build emits the real config.

Workers Builds runs `pnpm run build`, then `pnpm run deploy` (never `pnpm deploy`, pnpm's own
command), which runs `scripts/deploy-production.mjs`. It takes the name and database from the
root `wrangler.jsonc`, resolves the database by id, else by name, creating it when missing,
generates the production config as `gen-wrangler-config.mjs` does, applies migrations and
deploys. Its origin is `https://$PROD_HOST` when that build variable is set, else the
Worker's workers.dev address, read through the build's `CLOUDFLARE_API_TOKEN`, and then the
config sets `workers_dev: true` so that address is served. Run by hand, it needs one of the
two in the shell.

The button asks only for `SETUP_TOKEN`. The deploy script generates `BETTER_AUTH_SECRET` when
the Worker lacks it, which is on the first deploy, and uploads it with that version; later
deploys leave it alone. Its value is never shown and cannot be read back. Replacing it with
`wrangler secret put` signs everyone out and makes the stored GitHub tokens unreadable.

Leave Workers Builds' non-production branch builds off: their default command deploys the
root `wrangler.jsonc` directly, which cannot build this app. The GitHub workflows skip
in a copy without the `CLOUDFLARE_API_TOKEN` secret, so the two never deploy the same Worker
unless that secret is added.

## Renaming the instance

Every Cloudflare resource is named after the product (`iron-garden`, `iron-garden-staging`,
the D1s and Artifacts namespaces of the same names, and the preview resources prefixed
`iron-garden-preview-`), so a rename is a migration of live resources, not a text change.
The code side is the names in `scripts/lib/environments.mjs`, the four workflows,
the root `wrangler.jsonc`, `apps/backend/wrangler.jsonc` and this document. Cut
over in this order, with no pull request processing and no agent session running: a
processing job lives in a Durable Object on the old Worker, and a session's prompt carries
the old origin's URLs.

1. Tear down every open preview (merge or close its branch) so nothing is left under the old
   prefix; the teardown job only matches the new one afterwards.
2. Create the new D1s (`wrangler d1 create`), export the old ones (`wrangler d1 export`) and
   import the dumps (`wrangler d1 execute --file`). Production deploy refuses to run while
   its D1 is missing.
3. Copy the git repositories between Artifacts namespaces:
   `node scripts/artifacts-repos.mjs copy <old> <new>` for production and for staging.
4. Deploy once from the renamed branch to create the Workers (staging with the staging
   config, so the new Worker gets Preview URLs), then set `BETTER_AUTH_SECRET` and
   `SETUP_TOKEN` on each, and on the staging Worker's preview base config, with the
   commands under Preview and Production above. The values stay the same.
5. Merge, let the deploys run, and check both instances.
6. Move `PROD_HOST` to the new production Worker. With a custom domain the hostname does not
   change, so sessions, agent prompts and GitHub webhooks keep working. On a workers.dev
   hostname everyone signs in again, every GitHub-connected repository re-creates its webhook
   from its settings page, and agent prompts handed out before the move are stale.
7. The GitHub tokens and webhook secrets in D1 are encrypted under a salt named after the
   product (`libs/github/src/crypto.ts`), so the copied rows cannot be read under the new
   name: every person adds their GitHub tokens again under Account > GitHub tokens, and every
   connected repository is reconnected from its GitHub settings, which issues a new webhook
   secret.
8. Delete the old Workers, D1s and namespaces once the new ones are proven.

Local dev binds a D1 by name too, so it starts from an empty database after a rename.
