# Product

## Vision

AI agents now write a large share of code, often several at once on the same codebase. Two
things break: agents step on each other without knowing it, and humans cannot review the
volume of changes file by file. IronGarden is a git forge built for that world:

- **Agents coordinate through the forge.** Sessions say what they are working on, get told
  when they collide or when a merge affects them, and can talk to each other.
- **Review happens per line, not per file.** Automation groups related lines, links moved and
  precedent code, auto-reviews what rules allow, and escalates what needs a human, so reviewers
  spend their attention only where it matters.

## Goals

- **Own your forge in one click.** Deploy to your own Cloudflare account with the Deploy to
  Cloudflare button. No servers, no Docker, scales to zero.
- **Works with every git client.** Standard clone, fetch and push over HTTPS; everything agents
  can do through the API they can also signal with commit trailers.
- **Agent collaboration** as specified in [agent-collaboration.md](./agent-collaboration.md):
  session context, working sets, overlap and exclusive-path rules, competition, messaging,
  post-merge impact notifications.
- **Line-level review** as specified in [code-review.md](./code-review.md): reviewed marks per
  line range that survive updates, automated groups, references, review rules, multi-repo
  change requests, competing changes, artifacts and visual evidence.
- **Useful without AI, better with it.** Everything deterministic works with no AI provider;
  AI adds grouping, classification and impact analysis.
- **Small and hackable.** MIT licensed, one TypeScript monorepo, easy to fork and extend.

## Non-goals for v1

- SSH access. Workers cannot accept raw TCP connections; access is HTTPS with tokens only.
- Running CI builds on the platform. External runners report checks and upload artifacts.
- Issues, wikis, project boards, packages, static-site hosting.
- Federation between instances, and GitHub-scale public hosting.
- Very large repos (see [risks.md](./risks.md) for the target size).

## Users, roles and core concepts

One deployment is one **instance**. Everything below lives inside it.

| Concept        | What it is                                                                   | Spec                                               |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Instance admin | Runs the instance from `/admin`: users, agents, instance-wide rules          |                                                    |
| User           | A human with a login, created by an admin (invite-only)                      |                                                    |
| Agent          | A non-human identity owned by a user; acts only through tokens               |                                                    |
| Token          | Secret for git, API and MCP, scoped to repos and permissions, with an expiry | [guidelines.md](./guidelines.md)                   |
| Organization   | Users and agents with roles (owner, maintainer, writer, reader)              |                                                    |
| Repository     | A git repo plus its settings                                                 | [git-engine.md](./git-engine.md)                   |
| Session        | One agent working session with context and a working set                     | [agent-collaboration.md](./agent-collaboration.md) |
| Change request | The unit of review; may span branches in several repos                       | [code-review.md](./code-review.md)                 |
| Line range     | The unit of review marks, references and rules                               | [code-review.md](./code-review.md)                 |
| Group          | Related line ranges, found automatically                                     | [code-review.md](./code-review.md)                 |
| Review rule    | Matches line ranges and auto-reviews, escalates or flags them                | [code-review.md](./code-review.md)                 |
| Artifact       | A metric, image, video or file uploaded to a change request revision         | [code-review.md](./code-review.md)                 |
| Check          | A pass/fail result reported by CI or an agent for a commit                   |                                                    |
