# Deployment and self-hosting

The repo carries two deploy paths that share one build:

- **Development pipeline**: the edge-stack GitHub Actions workflows (per-branch preview,
  staging, prod) that we use to develop IronGarden itself. One repo secret,
  `CLOUDFLARE_API_TOKEN`, as edge-stack requires.
- **Adopter path**: a [Deploy to Cloudflare button](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
  that anyone can click to get their own instance.

## What the button does

It clones the repo into the adopter's GitHub or GitLab account, provisions the D1 database, R2
bucket, Durable Objects and Workers AI binding from the wrangler config, asks for the
secrets listed in `.dev.vars.example`, runs our `build` and `deploy` scripts through Workers
Builds, and redeploys on every push to their fork.

## What we add on top of edge-stack

1. **A deploy-button wrangler config at the repo root.** The button reads the root config, but
   edge-stack's `apps/backend/wrangler.jsonc` is local-dev only (named `<slug>-local`, built by
   vite into `dist/worker/wrangler.json`). A root `wrangler.jsonc` carries production defaults
   (Worker `IronGarden`, D1 `IronGarden-db`, R2 `IronGarden-packs`) and no resource
   ids, matching edge-stack's no-ids rule; the button fills them in on the adopter's fork.
2. **Root `build` and `deploy` scripts the button can run as-is.** `deploy` applies D1
   migrations by binding name, then `wrangler deploy` on the built worker. Phase 0 proves this
   end to end on a fresh Cloudflare account.
3. **One input, no CLI steps after the click.** edge-stack's `pnpm admin:create` and
   `wrangler secret put` do not exist for a button user. The button asks for a single secret,
   `SETUP_TOKEN` (declared in `.dev.vars.example`, described in `package.json`
   `cloudflare.bindings` as "any long random string; you type it once to create the admin").
   The first visit to a fresh instance shows a setup screen that requires `SETUP_TOKEN`,
   creates the first admin, and then disables itself permanently. The session-signing secret
   (`BETTER_AUTH_SECRET` in edge-stack) is generated on first boot and stored in D1 instead of
   being asked for; an operator can still override it with a Worker secret.
4. **Canonical URL from the request.** The button user never edits `REPLACE_WITH_PROD_URL`;
   the instance uses its `workers.dev` host until the admin sets a custom domain in instance
   settings.
5. **Updates.** Adopters pull upstream into their fork; Workers Builds redeploys and the deploy
   script migrates D1. Durable Object migrations are declared in the wrangler config so they
   apply on deploy.

## Optional resources

Email sending, custom domains, external AI keys and external CI are optional; the instance
deploys and works without them. What each one unlocks, and the fallback, is listed in
[guidelines.md](./guidelines.md#1-one-click-deployable).

## Plan requirements

Cloudflare Artifacts, which stores every repository, needs the **Workers Paid** plan, so an
instance needs it too. The Artifacts binding names a namespace, which Artifacts creates on the
first repository, so the deploy button needs nothing else for it. Artifacts has no local
simulator: local development and the e2e suite use the real service through a Cloudflare API
token with **Artifacts: Edit**.

## Licensing

MIT `LICENSE` at the repo root from the first commit, plus a short `CONTRIBUTING.md`.
