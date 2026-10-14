# Development

```bash
pnpm dev          # builds first, then runs both dev servers
pnpm db:migrate   # apply migrations to the local D1
pnpm build        # bundle the worker and the SPA
pnpm test:unit    # Vitest: libs/*/src/**/*.test.ts
```

The backend runs under `vite dev` on port 8301 — the worker executes in workerd via
`@cloudflare/vite-plugin`, with hot reload — and the frontend dev server proxies `/api` and
`/<name>.git/` to it. Local dev binds the `iron-garden-local` D1 by name in
`apps/backend/wrangler.jsonc`, with local-dev `vars`; no remote Cloudflare resource is touched
unless you turn git hosting on.

## Git hosting locally

Repositories live in Cloudflare Artifacts, which has no local simulator. Without it the app
runs with git hosting off (`capabilities.git` is false): repositories, sessions and pull
requests answer `503`. To turn it on, give the backend a namespace and credentials for the
real service:

```bash
export CLOUDFLARE_API_TOKEN=...   # Artifacts: Edit (Workers Paid), or run `wrangler login`
ARTIFACTS_NAMESPACE=iron-garden-dev-$USER pnpm dev
```

`apps/backend/vite.config.ts` then adds a remote `ARTIFACTS` binding. The same variable runs
`tests/e2e/git/`, which clones and pushes with the real `git` client.

## Server-side processing locally

Local dev simulates the processing Durable Object and the Worker Loader, but Workers AI has no local
simulator, so `capabilities.ai` is false. `WORKERS_AI=true pnpm dev` binds the real service
(a token with Workers AI: Read, or `wrangler login`); then Admin > Agent config can switch
grouping to the server. Without it, the pure parts are unit-tested
(`libs/review/src/processing/`).

## The build

The backend is bundled by vite + `@cloudflare/vite-plugin`; `tsc` only type-checks.
Wrangler is the deploy and D1 CLI.

- `apps/backend/wrangler.jsonc` is the build's **input** (`main: "src/index.ts"`).
  `vite build` emits `apps/backend/dist/worker/wrangler.json` plus a redirect at
  `apps/backend/.wrangler/deploy/config.json`, which `scripts/gen-wrangler-config.mjs`
  follows to find it. `viteEnvironment: { name: "worker" }` keeps that dir stable.
- `scripts/assemble-assets.mjs` stages the frontend build into `apps/backend/public`
  before `vite build`, which copies it into `dist/client/`. So the backend devDepends on
  the frontend — that turbo `^build` edge is load-bearing — and an empty `public/` means
  no `ASSETS` binding. That is why `pnpm dev` and `pnpm test` build first.

## Local D1

Dev persists to `apps/backend/.wrangler/state`, where `wrangler d1 … --local` writes, so
`pnpm db:migrate` targets it. e2e uses its own state in
`.wrangler-test` — see [tests/README.md](../tests/README.md).
