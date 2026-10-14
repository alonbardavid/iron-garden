# Tests

Playwright e2e, run with `pnpm test` (which builds first). Install browsers once with
`pnpm --filter tests exec playwright install`.

- e2e isolates its D1: `playwright.config.ts` starts `vite dev` with
  `WORKER_PERSIST_TO=.wrangler-test`, the directory `global-setup.ts` migrates and seeds.
- **A backend dev server already running is reused** — and writes no log file, so
  `e2e/logging/request-log.spec.ts` fails. Stop it before `pnpm test`. The config tees the
  worker's output into `tests/.logs/worker.log`.
- The dev server synthesises `Sec-Fetch-Mode: cors`, which makes better-auth reject a POST
  with no `Origin` (`403 MISSING_OR_NULL_ORIGIN`). Browsers always send one; a
  `request.post` to `/api/auth/*` must set it explicitly. Deployed workers are unaffected.
- Git hosting is off in e2e unless `ARTIFACTS_NAMESPACE` is set (Artifacts has no local
  simulator; see [docs/development.md](../docs/development.md#git-hosting-locally)).
  `e2e/git/` skips itself without it, so a green run without the variable has not pushed
  anything through git.
- Seeded users (`e2e/users.ts`) are shared across specs: a spec that changes a password or
  role uses its own user, as `forgot-password.spec.ts` does with `RESET_USER`.
