---
title: Working with edge-stack
description: A map of the repository for customizers, and where each kind of change goes.
---

%PRODUCT_NAME% is built on [edge-stack](https://github.com/alonbardavid/edge-stack), an
opinionated foundation for products on Cloudflare and GitHub. It sets the shape of the
repository, the conventions, and the development workflow of previews, staging and end-to-end
tests. This page is a map of where things live, and where a customization goes.

## What edge-stack includes

- **One TypeScript monorepo**, managed with pnpm and Turbo.
- **One Cloudflare Worker** that serves the API (Hono), the git endpoints, the web app (React
  with Mantine) and these docs.
- **A contract-first API** with [oRPC](https://orpc.dev): every procedure is declared once and
  shared by the server and the web app.
- **D1 with numbered SQL migrations**, and Drizzle for queries.
- **better-auth** for sign-in, users, admins and API keys.
- **react-email** templates for transactional email.
- **GitHub Actions** for per-branch previews, staging, production and end-to-end tests. See
  [Developing with staging](/customization/developing-with-staging/).

## The layout

```text
apps/
  backend/     the Worker: API routes, git endpoints, and the assets it serves
  frontend/    the web app, admin pages included, served at /
  docs/        these docs, served at /docs/
libs/
  contract/    the API contract shared by backend and frontend; product constants
  db-models/   the database schema and entity ids
  identity/    users, admins, API keys, agents, first-run setup
  forge/       repositories, members, access levels, git hosting
  collab/      agent sessions and the session prompt
  review/      pull requests, brackets, rules, accepted changes
  github/      GitHub tokens, mirroring, workflow runs, webhooks
  capabilities/ which optional features this deploy has
  email-service/ sending email; email-ds: the email layout
  ds/          the web app's design system and form components
migrations/    D1 SQL migrations, applied in order
scripts/       build and deploy helpers
tests/         Playwright end-to-end tests
```

The domain libraries decide who may do what. Routes and screens stay thin: they pass the signed-in
user, or the agent acting for its owner, to a library and show the answer.

## Where a change goes

| You want to add       | Where                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A page in the web app | A screen under `apps/frontend/src/screens/`, and its route in `apps/frontend/src/App.tsx`. Account and admin pages also get a link in the side navigation.                                                            |
| An API procedure      | Declare it in `libs/contract/src/` first, then implement it in `apps/backend/src/routes/`, calling a domain library for the logic and the access decision. Admin-only procedures go on the admin implementer.         |
| A database table      | The table in `libs/db-models`, and a new numbered SQL file in `migrations/`. Apply it locally with `pnpm db:migrate`.                                                                                                 |
| An email              | A react-email template beside the library that sends it, sent through the email service. Preview templates with `pnpm email:dev`. See [emails](https://github.com/alonbardavid/iron-garden/blob/main/docs/emails.md). |
| An optional feature   | Ask `libs/capabilities` whether the deploy has what it needs, and keep working, degraded, without it.                                                                                                                 |
| A docs page           | A Markdown file in `apps/docs/src/content/docs/`, listed in the sidebar in `apps/docs/astro.config.mjs`.                                                                                                              |
| A new product name    | `PRODUCT_DISPLAY_NAME` in `libs/contract/src/constants.ts`. The app, emails, prompts and docs read it. Cloudflare resource names are separate (see below).                                                            |

:::caution
Changing the display name is safe. Renaming the Cloudflare resources (`iron-garden`, its
databases and Artifacts namespaces) is a migration of live data; follow
[Renaming the instance](https://github.com/alonbardavid/iron-garden/blob/main/docs/deployment.md#renaming-the-instance)
in the contributor docs.
:::

## Conventions

The repository's rules are written for both people and coding agents:

- [`CLAUDE.md`](https://github.com/alonbardavid/iron-garden/blob/main/CLAUDE.md): the
  architecture boundaries and traps. Coding agents load it in every session.
- [`.claude/commands/check-conventions.md`](https://github.com/alonbardavid/iron-garden/blob/main/.claude/commands/check-conventions.md):
  the code-review rules.
- Lint, the type-checker and the tests enforce the rest. `pnpm lint`, `pnpm type-check`,
  `pnpm test:unit` and `pnpm test` run what the E2E Tests workflow runs.

## Contributor docs

The code itself is documented in the repository:

- [Architecture](https://github.com/alonbardavid/iron-garden/blob/main/docs/architecture.md):
  the layout, the API contract, identity and keys, git hosting, sessions, GitHub.
- [Development](https://github.com/alonbardavid/iron-garden/blob/main/docs/development.md):
  local development, the build, the local database.
- [Deployment](https://github.com/alonbardavid/iron-garden/blob/main/docs/deployment.md):
  previews, staging and production.
- [Tests](https://github.com/alonbardavid/iron-garden/blob/main/tests/README.md): traps in
  the end-to-end suite.

To keep your copy current as both upstream and edge-stack move on, see
[Pulling from origin](/customization/pulling-from-origin/).
