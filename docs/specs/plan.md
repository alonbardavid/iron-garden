# Implementation plan

Phases, each ending in a gate that must pass before the next starts. Each phase is one or
more pull requests on `alonbardavid/IronGarden-dev`, kept green on edge-stack's five checks
(install, type-check, lint, build, Playwright) plus the unit, interop and remote suites in
[testing.md](./testing.md).

| Phase | Name                | Gate                                                                                                                      | Release |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- |
| 0     | Foundation          | Button deploy reaches setup; PR previews come up seeded with scenarios                                                    |         |
| 1     | POC                 | An agent starts a session, pushes to its Artifacts fork, opens a pull request and groups it; a person reviews it by group |         |
| 2     | Line-level review   | A multi-repo change request is reviewed line by line, survives an update, and merges                                      | v0.1    |
| 3     | Agent collaboration | Two agent sessions get overlap and exclusive-path notifications, message each other, and get a post-merge notice          | v0.2    |
| 4     | Evidence            | Artifacts, image-approved lines and competing changes side by side on a seeded scenario                                   | v0.3    |
| 5     | AI layer            | AI groups, classifier rules, precedents and post-merge impact on seeded scenarios, with and without an AI key             | v0.4    |

Deterministic features come before AI ones, so every phase is usable without an AI provider.

## Phase 0: Foundation

- Scaffold the repo with `create-edge-stack` (slug `IronGarden`); add MIT `LICENSE`,
  README with the name TODO, and these specs under `docs/specs/`.
- Test foundations per [testing.md](./testing.md): Vitest (Node and workerd pools), the
  fixture-repo builder with the first bundles, the scenario framework with `empty-instance`,
  and a git version matrix in CI.
- Replace edge-stack's aliased preview uploads with Workers Previews (needed for Durable
  Objects), seed scenarios after each preview deploy, and post the scenario links in the PR
  comment. Put previews and staging behind Cloudflare Access.
- Harden the repo for going public per [guidelines.md](./guidelines.md#3-secure-without-obscurity):
  audit the edge-stack workflows (least-privilege permissions, SHA-pinned actions, no secrets
  for fork PRs), add `SECURITY.md`, `CODEOWNERS`, Dependabot, and ESLint boundary rules.
- **Spike A:** the deploy button on a clean Cloudflare account with D1, R2, a SQLite Durable
  Object and Workers AI bound; confirm root-config and `deploy`-script behaviour with
  the monorepo layout.
- **Gate:** a button deploy reaches the setup screen and admin login; a PR preview comes up
  behind Access with the `empty-instance` scenario loaded and linked from the PR comment.

## Phase 1: POC on Cloudflare Artifacts

Replaces the earlier git engine and hosting phases: Cloudflare Artifacts provides git storage
and the git protocol, so the TypeScript engine (`libs/git-core`) is only a fallback. Scope and
screens are in [poc-scope.md](./poc-scope.md); the agent flow is _POC: session start and pull
requests_ in [agent-collaboration.md](./agent-collaboration.md).

- **Identity on better-auth.** Remove edge-stack's admin app and admin tables; add the admin
  plugin (roles, ban), the username plugin and the API key plugin (personal and agent keys told
  apart by metadata). First admin from `SETUP_TOKEN`.
- **Repositories on Artifacts** (`libs/git-host`, `libs/forge`): create, rename, delete,
  members and levels, agent access capped at the owner's, `can()`, and the git proxy at
  `/<name>.git` with API keys.
- **Agent sessions** (`libs/collab`): start a session (fork, session token, instructions),
  update, refresh the token, end.
- **Pull requests** (`libs/review`): create from a session branch, changed files from a tree
  diff, the processing state, groups sent by the agent, refresh after a push, and the grouping
  prompt as an admin setting with a restorable default.
- **UI**: the streamlined boards, setup and sign-in through account, admin and the pull
  request list, Overview and Groups.
- **Gate:** a real `git` client clones through the proxy with an API key; a scripted agent
  starts a session against real Artifacts, pushes a branch, opens a pull request and submits
  groups; Playwright shows it in the list and by group.

## Phase 2: Line-level review (first usable release, v0.1)

- Minimal browse UI (tree, file, commits, branches) and organizations with roles.
- `libs/review`: change requests with multi-repo sources and revisions; line-range diff;
  per-reviewer marks; carry-over across revisions; move detection and references (API and
  trailers); deterministic groups; the rules engine with non-AI matchers.
- Review UI: navigate by file or group, mark ranges, see references beside changed lines, see
  why each rule fired, progress toward ready-to-merge.
- Merge (single and multi-repo with rollback); checks API and signed webhooks; setup screen.
- **Gate:** Playwright, starting from the `review-carryover` and `cross-repo-change`
  scenarios, reviews a change line by line, pushes an update that keeps unchanged marks and
  resets edited ones, and merges across two repos. We dogfood a button-deployed instance.

## Phase 3: Agent collaboration (v0.2)

- Agent identities, scoped expiring tokens, audit log.
- `libs/collab`: sessions and context (API and trailers), working sets, the per-repo
  coordination Durable Object (overlap, exclusive holds), competition and ignore,
  notifications (inbox, push output, webhooks), messaging, post-merge impact by file overlap.
- Remote MCP server over the review and collaboration APIs.
- **Gate:** in the `overlapping-agents` scenario, two agents (driven by test scripts over real
  git and MCP) get overlap and exclusive-path notifications, message each other, and the
  non-merging one is notified after the other merges.

## Phase 4: Evidence (v0.3)

- Artifact uploads and comparisons (metrics, images, videos, files).
- Images linked to line ranges, with approval reviewing their lines.
- Competing change requests side by side with metrics.
- **Gate:** in the `competing-changes` and `visual-evidence` scenarios, a reviewer compares
  two competitors' metrics and approves lines through an image.

## Phase 5: AI layer (v0.4)

- AI provider abstraction: Workers AI by default, optional Anthropic or OpenAI-compatible key,
  routed through AI Gateway when configured.
- AI groups (flows, impact, session intent), precedent finder, prompt-defined classifier
  rules, AI judging of competitors, post-merge AI impact check.
- **Gate:** each AI feature has a scenario and an e2e test that runs against a recorded model
  response locally and the real provider on previews; with no AI configured, the same
  scenarios still pass with AI features hidden.
