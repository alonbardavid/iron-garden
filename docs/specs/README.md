# IronGarden specs

> **TODO:** "IronGarden" is a provisional name. Revisit before the first public release.

IronGarden is a self-hosted git forge for teams where AI agents write much of the code. It
does two things existing forges do not: **agents coordinate through it** (they declare what
they are working on, get told about collisions and relevant merges, and talk to each other),
and **review happens per line, not per file** (related lines are grouped, moved and precedent
code is linked, rules auto-review the routine and escalate the risky). One person or team
deploys it to their own Cloudflare account with one button. It starts from the
[edge-stack](https://github.com/alonbardavid/edge-stack) template and stores git in
Cloudflare Artifacts.

Status: **draft, awaiting decisions** (see below). License: MIT.

| Spec                                               | What it covers                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [guidelines.md](./guidelines.md)                   | Engineering rules: one-click deployable, minimal input, secure without obscurity, code shape                                         |
| [product.md](./product.md)                         | Vision, goals, non-goals, users, roles and core concepts                                                                             |
| [agent-collaboration.md](./agent-collaboration.md) | Sessions, context, working sets, overlap and exclusive paths, competition, messaging, post-merge impact                              |
| [code-review.md](./code-review.md)                 | Multi-repo change requests, line-level review marks, groups, references, review rules, competing changes, artifacts, visual evidence |
| [features.md](./features.md)                       | Functional spec by area, with the release each feature lands in                                                                      |
| [architecture.md](./architecture.md)               | Runtime architecture, storage split, git push/fetch paths, package layout                                                            |
| [git-engine.md](./git-engine.md)                   | The TypeScript git engine: protocol, packfiles, Durable Object storage                                                               |
| [testing.md](./testing.md)                         | Real-git and real-Cloudflare test layers, fixture repos, scenarios, per-PR previews, staging                                         |
| [deployment.md](./deployment.md)                   | Deploy to Cloudflare button, self-hosting, plan limits                                                                               |
| [poc-scope.md](./poc-scope.md)                     | The POC: screens, settings, how it is built and the defaults picked                                                                  |
| [plan.md](./plan.md)                               | Phased implementation plan with gates                                                                                                |
| [risks.md](./risks.md)                             | Risks, limits, mitigations and open TODOs                                                                                            |

## Open decisions

Defaults in bold; implementation proceeds on them unless changed. The product angle is
settled: agent collaboration and line-level review are the initial feature set.

1. Who is it for first? **A self-hosted, invite-only instance per person or team**, or a
   public multi-tenant service with open sign-up.
2. CI? **External runners report checks and upload artifacts; `require-check` rules dispatch a
   webhook to them**, or running builds on the platform (Cloudflare Containers), which is much
   larger.
3. Default AI provider? **Workers AI (zero config), with an optional external key routed
   through AI Gateway**, or an external provider only.
4. Storage engine? Decided: **Cloudflare Artifacts** (open beta, Workers Paid). Our own
   engine on Durable Objects + R2 ([git-engine.md](./git-engine.md)) is the fallback behind the
   same interface.
5. Where review rules and collaboration settings live? **YAML files in the repo, read from the
   target or default branch so a change cannot loosen its own rules, plus instance-wide rules
   in the admin UI**, or the admin UI only.
6. Exclusive paths on push? **Reject agent pushes to a path another session holds; allow human
   pushes and notify the holder**, or only warn.
7. Multi-repo merge? **Merge every repo in order and roll back already-merged repos if a later
   one fails**, or require each repo to be merged by hand.
8. Overlap thresholds? **Notify when sessions share at least 2 files and at least 30% of the
   smaller working set**, or other defaults.
