# Features

The release column names the phase in [plan.md](./plan.md) that ships each feature.
**v0.1** (end of Phase 2) is the first usable release. **Later** is out of v1 scope.

## Platform

| Feature                                                                                                             | Release |
| ------------------------------------------------------------------------------------------------------------------- | ------- |
| Deploy button provisions Worker, D1, R2, Durable Objects, Workers AI; one-time setup screen creates the first admin | Phase 0 |
| Admin creates users; users manage profile, password and tokens                                                      | Phase 1 |
| Organizations with roles                                                                                            | Phase 2 |
| Repos: create, rename, delete, default branch                                                                       | Phase 1 |
| Clone, fetch, push over HTTPS (protocol v2 with v0 fallback), shallow clone                                         | Phase 1 |
| Browse: file tree, file view, README, commit log, branches, tags                                                    | Phase 2 |
| Checks API and HMAC-signed webhooks                                                                                 | Phase 2 |
| Remote MCP server exposing the agent and review APIs                                                                | Phase 3 |
| Open sign-up with email (edge-stack `email-sending` capability, optional)                                           | Later   |
| Partial clone, Git LFS, code search, issues                                                                         | Later   |

## Code review ([code-review.md](./code-review.md))

| Feature                                                                                                                                            | Release |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Change requests with one or more `{repo, source, target}` sources; revisions per push                                                              | Phase 2 |
| Line-range diff and per-reviewer reviewed marks                                                                                                    | Phase 2 |
| Reviewed marks carried across updates (unchanged, moved, edited, removed)                                                                          | Phase 2 |
| Deterministic move detection with `moved-from` references and trailers                                                                             | Phase 2 |
| References via API and `Code-Moved` / `Code-Precedent` trailers, shown beside changed lines                                                        | Phase 2 |
| Review rules from the target branch: path, pattern and group matchers; auto-review, require-review, require-role, require-check, flag, auto-deploy | Phase 2 |
| Deterministic groups: renames, moved code, imports, formatting, generated files                                                                    | Phase 2 |
| Multi-repo merge with rollback                                                                                                                     | Phase 2 |
| Artifacts (metrics, images, videos, files) with comparison to previous and target values                                                           | Phase 4 |
| Images linked to line ranges; approving an image reviews its lines                                                                                 | Phase 4 |
| Competing change requests side by side with a metrics comparison                                                                                   | Phase 4 |
| AI groups (flows, impact, session intent)                                                                                                          | Phase 5 |
| AI precedent finder                                                                                                                                | Phase 5 |
| AI classifier rules defined by prompt (e.g. boilerplate)                                                                                           | Phase 5 |
| AI judging of competing change requests against a prompt                                                                                           | Phase 5 |

## Agent collaboration ([agent-collaboration.md](./agent-collaboration.md))

| Feature                                                                                                     | Release |
| ----------------------------------------------------------------------------------------------------------- | ------- |
| Sessions owned by agent identities; session context via API or `Agent-Session` / `Session-Context` trailers | Phase 3 |
| Working sets via API or implied by pushed commits, with expiry                                              | Phase 3 |
| Overlap notifications with `minFiles` / `minPercent` thresholds                                             | Phase 3 |
| Exclusive paths with holds, conflicts and push rejection                                                    | Phase 3 |
| Competition groups and ignorable sessions                                                                   | Phase 3 |
| Notifications via inbox API, `git push` output, webhooks and MCP                                            | Phase 3 |
| Session-to-session messaging                                                                                | Phase 3 |
| Post-merge impact notifications by file overlap                                                             | Phase 3 |
| Post-merge AI impact check (contract-breaking changes)                                                      | Phase 5 |
