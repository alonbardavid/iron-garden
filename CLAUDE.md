# Project Rules

IronGarden — an edge-stack pnpm + Turbo monorepo on Cloudflare Workers: a Hono API, a git
proxy and one React SPA served from one Worker, on D1 and Cloudflare Artifacts, with Playwright
e2e.

## Maintaining this file

This file is loaded into **every** session, so its length is a permanent tax on context.
It is a rulebook, not a changelog.

- **Budget: 100 lines.** To add something once it is full, delete or relocate something.
  Raise the budget only as a deliberate, stated decision — never to accommodate a drift.
- **Prefer a tool to a rule.** If ESLint, the type-checker or a test can enforce a
  convention, enforce it there and leave it out of this file. Put the reasoning in the
  rule's own message or a comment beside it.
- **Leave out traps something else already catches** — anything lint, the compiler or a
  test rejects, anything you would hit and diagnose in the same sitting, and anything
  unlikely to come up again. A trap earns a line only when it is silent, costly, and
  likely to recur.
- **Edit in place; never append.** A new fact overwrites the line it contradicts. State
  only what is true now, in the present tense. History belongs in git.
- **Never belongs here:** how a feature works, change logs, issue/PR numbers, post-mortems,
  or anything one `grep` would answer. Put it in the right doc and link to it: `README.md`
  indexes them — architecture, development, deployment and emails live under `docs/`, a lib's
  reference in its own `README.md`, test traps in `tests/README.md`, code-review rules in
  `.claude/commands/check-conventions.md`.
- Memory goes in this project file, not per-user memory (`~/.claude/…`).

## Working practices

- Given an issue number, read the whole issue before starting: `gh issue view <n>`.
- Use `pnpx`, never `npx`. Drive the running app with `pnpx @playwright/cli@latest <command>`.
- Never add an ADR (`docs/adrs/`) unless asked for one.
- **Every PR with a user-visible change carries screenshots**, uploaded into its
  "Screenshots / video" section — plus a video only when an interaction needs showing.

## Architecture boundaries

- **Admins are users with `role: "admin"`** (better-auth admin plugin); admin pages live in
  the one SPA. Admin-only procedures go on the `adminApi` implementer.
- **Access is decided in the domain libs**, never in routes or the UI: repository levels in
  `@lib/forge`, sessions in `@lib/collab`, pull requests in `@lib/review`. Every call takes the
  request's `Principal` (a user, or an agent acting for its owner).
- **The API is contract-first** (oRPC): declare a procedure in `@lib/contract` before
  implementing it on the `api` implementer, which admits a signed-in user or an API key
  (`publicApi` only for what a signed-out visitor needs). See `docs/architecture.md`.
- **API keys are created only server-side** (`createKey` in `@lib/identity`): their metadata
  tells agent keys from personal keys, so better-auth's client key endpoints stay blocked.
- **Every email goes through `sendEmail`** in `@lib/email-service`, rendered from a
  react-email template with inline `style` objects — never `<Tailwind>`, which trips
  workerd's startup CPU limit on deploy.
- **Optional features are read only from `@lib/capabilities`** (`getBindings()` for what the
  deploy binds, `getCapabilities()` for what works now); a feature asks it and must still
  work, degraded, without them (email and AI processing are admin settings, off by default;
  git needs the Artifacts binding; Artifacts and Workers AI have no local simulator, see
  `docs/development.md`). Every deploy binds every binding: never make one depend on what
  the deploy token can do.
- Never hardcode the product name; use `PRODUCT_DISPLAY_NAME` from `@lib/contract/constants`.
- Every table has an `id` column, except join tables with a composite key. Its value is
  `newEntityId("<ENTITY>")` from `@lib/db-models`; a new table adds its uppercase prefix to
  `ENTITY_PREFIXES` there first.
- Server code logs a **constant message** with everything variable as a property
  (`log.info("user created", { userId })`); never put emails, passwords or tokens in a
  property.

## Traps

- A Hono middleware must **`return withContext(…, next)`** — LogTape's context is a scope,
  not a store, so fields added outside it are silently dropped.
- `turbo.json`'s backend `build` outputs must include `.wrangler/deploy/**`, or a cache hit
  restores `dist/` without the redirect and deploy-config generation fails.
- `kysely` is pinned in `pnpm.overrides` because better-auth statically imports its kysely
  adapter even on the Drizzle path, and 0.29 dropped the root export it needs.
