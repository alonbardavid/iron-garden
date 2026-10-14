# Testing, previews and scenarios

Two goals drive this spec:

1. **Test with real git on real Cloudflare.** Every git behaviour is proven with the real `git`
   binary, and every storage behaviour on real D1, R2 and Durable Objects, not mocks.
2. **Reviewing a change should take one click.** Every pull request gets a live environment
   preloaded with named scenarios, so a reviewer can see and try a feature without cloning,
   pushing or seeding anything by hand.

## Test layers

| Layer                      | Runs where                                  | Talks to                       | What it proves                                                                                                                    | When                      |
| -------------------------- | ------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Unit                       | Vitest in Node                              | Nothing                        | `libs/git-core` against fixture repos; review carry-over, move detection, rules, overlap maths in `libs/review` and `libs/collab` | Every push                |
| Worker integration         | `@cloudflare/vitest-pool-workers` (workerd) | Local D1, R2, Durable Objects  | Repo Durable Object, storage, permissions, API handlers in the real runtime                                                       | Every push                |
| Git interop (local)        | Real `git` binary                           | `vite dev` (workerd)           | clone, fetch, push, shallow, force-push rules, large and odd repos                                                                | Every push                |
| UI e2e (local)             | Playwright                                  | `vite dev`                     | User flows, each starting from a scenario                                                                                         | Every push                |
| Git interop + e2e (remote) | Real `git` + Playwright                     | The PR's preview on Cloudflare | Same suites against real D1, R2, Durable Objects and Workers AI                                                                   | After each preview deploy |
| Soak (remote)              | Real `git`                                  | Staging                        | Big repos, many pushes, repack, concurrency                                                                                       | Nightly                   |

Git interop runs on a version matrix: the oldest supported git (target 2.34) and the latest
release, so protocol v0 and v2 are both exercised.

## Fixture repos

Fixture repos are the foundation of every layer, so they are versioned, deterministic and
produced by real git.

- **Generated, not hand-made.** `tests/fixtures/repos/<name>/build.sh` builds each repo with real
  git commands, with fixed author, committer and dates (`GIT_AUTHOR_DATE`,
  `GIT_COMMITTER_DATE`), so the same script always produces the same object ids.
- **Committed as bundles.** The output is committed as `<name>.bundle` (a single git file that
  any test can clone from), plus `expected.json` with the ref tips and object counts tests
  assert on. A CI check rebuilds every bundle and fails if any object id changed.
- **Catalogue.** Each fixture exists for a reason a test names:

  | Fixture                | Covers                                                                                                                                                           |
  | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `tiny`                 | One commit, one file: the smallest happy path                                                                                                                    |
  | `linear-history`       | 500 commits on one branch: negotiation, logs, shallow depth                                                                                                      |
  | `merges`               | Criss-cross merges, octopus merge: merge-base, graph walks                                                                                                       |
  | `renames-and-modes`    | Renames, executable bit, symlinks, empty dirs via `.gitkeep`                                                                                                     |
  | `unicode-paths`        | Non-ASCII, spaces and very long paths                                                                                                                            |
  | `binary-large`         | Large binary blobs, near the per-push size limit                                                                                                                 |
  | `deltas`               | Many similar file versions: deep delta chains, `ofs-delta` and `ref-delta`                                                                                       |
  | `tags`                 | Lightweight and annotated tags, tag pointing at a tag                                                                                                            |
  | `conflict-pair`        | Two branches that conflict on purpose, and two that merge cleanly                                                                                                |
  | `agent-authored`       | Commits with `Agent-Session`, `Session-Context`, `Code-Moved` and `Code-Precedent` trailers                                                                      |
  | `moved-and-renamed`    | A function moved between files, a rename refactor across many files, and a revision that edits part of a moved block: move detection and review carry-over       |
  | `multi-repo-pair`      | Two repos (an API and its client) with matching branches: multi-repo change requests and merge rollback                                                          |
  | `overlapping-branches` | Several branches touching the same files in different proportions, an exclusive-path file, and a later merge to `main`: overlap thresholds and post-merge impact |
  | `self`                 | A snapshot of the IronGarden repo itself, as a realistic mid-size repo                                                                                           |

## Scenarios

A **scenario** is a named, reproducible state of an instance: users, agents, organizations,
repos (loaded from fixture bundles) and change requests in specific states. Scenarios are the
single source of truth for e2e tests **and** for manual review.

- Defined in `tests/scenarios/<name>.ts` as code that calls the public API and pushes fixture
  bundles through the real git endpoint, so loading a scenario also exercises the product.
- Each scenario declares its **personas** (e.g. `maintainer`, `reviewer`, `agent`) and the
  **pages worth opening** (e.g. "the conflicted change request").
- Idempotent: loading a scenario resets only that scenario's namespace, so scenarios do not
  interfere with each other.
- Every e2e test starts from a scenario; a new feature ships with the scenario that shows it.

Starting catalogue (grows with features):

| Scenario             | State                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `empty-instance`     | Fresh instance after setup, one admin                                                                           |
| `solo-dev`           | One user, three repos from fixtures, open and merged change requests                                            |
| `team-review`        | An org with roles, a change awaiting review, a change with requested changes                                    |
| `merge-states`       | Changes that are clean, conflicted, blocked by a failing required check or unreviewed lines, and ready to merge |
| `review-carryover`   | A change reviewed halfway, then updated with moved, edited and untouched ranges                                 |
| `rules-in-action`    | Rules that auto-review docs and imports, require an admin for migrations, and flag a new pattern                |
| `cross-repo-change`  | One change request spanning two repos, ready to merge, with one repo's target moved to force a rollback         |
| `overlapping-agents` | Three agent sessions: two overlapping, one holding an exclusive path, one competing pair                        |
| `competing-changes`  | Two competing change requests with coverage and performance metrics                                             |
| `visual-evidence`    | A UI change with screenshots linked to line ranges across three files                                           |

## Preview per pull request

Every pull request gets its own live preview on Cloudflare, loaded with every scenario.

- **Worker Previews, not aliased version uploads.** Cloudflare does not create version URLs
  for Workers that use Durable Objects, so each branch deploys a
  [Worker Preview](https://developers.cloudflare.com/workers/previews/) (`wrangler preview`),
  which gets its own Durable Object namespace automatically.
- **Isolated data.** Each preview gets its own D1 database (the edge-stack per-branch
  convention) and its own prefix in a shared preview R2 bucket. Durable Object storage is
  isolated by the platform. Teardown deletes all three when the branch is deleted.
- **Seeded automatically.** After deploy, CI loads every scenario into the preview, then runs
  the remote interop and e2e suites against it.
- **The PR comment is the review entry point.** It has the preview URL, a link per scenario
  with one-click sign-in as each persona, the scenarios this PR touched first, test results, and
  Playwright screenshots of each scenario's key pages, so most changes can be judged before
  opening anything.

## Scenario panel (preview and staging only)

Previews and staging show a **Scenarios** panel in the UI:

- List scenarios and their personas; **sign in as** any persona in one click.
- **Reset** a scenario to its starting state.
- **Act** without a terminal: buttons that push a commit to a branch, report a passing or
  failing check, open a change, start an agent session that claims files, send a session
  message, upload an artifact, or trigger the AI pass. They go through the same API and git
  engine as real clients (commits via the commit-files API).

Because the repo is public, the panel is protected by configuration, not obscurity:

- Its routes exist only when the deploy config sets `SCENARIOS=enabled`. Only the preview and
  staging configs generated by our workflows set it; the deploy-button config and production
  never do, and production refuses to start if it is set.
- Previews and staging sit behind [Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
  so only maintainers can open them. PR comments on a public repo are public, so the links in
  them must not grant access on their own. CI reaches previews with an Access service token,
  which adds two repo secrets to our own pipeline (`CF_ACCESS_CLIENT_ID`,
  `CF_ACCESS_CLIENT_SECRET`); adopters using the deploy button never need them.

## Staging

Staging is a long-lived instance that mirrors `main`. It has every scenario loaded, keeps
manual data between deploys, and resets scenarios nightly. It is where features are tried out
together after merge, and where the nightly soak tests run.

## Background jobs and previews

Cloudflare Queue consumers cannot target a Worker preview, so queue-driven work (webhooks, AI
review) would never run in previews. Background jobs therefore run in a Durable Object job
runner driven by alarms instead of Queues, which works the same in local dev, previews,
staging and production, and is one less resource for the deploy button to provision.

## Developer and reviewer experience

- `pnpm dev` starts with the `solo-dev` scenario loaded; `pnpm scenario <name>` loads another.
- `pnpm test:git` runs git interop against local dev; `pnpm test:remote <url>` runs the remote
  suites against any preview or staging URL.
- The PR template asks which scenario shows the change.
- Failing remote tests attach the git client's trace (`GIT_TRACE_PACKET`) and the Worker logs
  for that request to the CI run.
