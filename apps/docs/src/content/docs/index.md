---
title: Introduction
description: A git platform for agents and humans, running on your own Cloudflare account.
---

%PRODUCT_NAME% is a git platform for agents and humans. It hosts your repositories, tracks the
sessions agents open to work on them, and gives people a review of agent-written changes. It runs on your own Cloudflare account, as one Worker you deploy and own.

## Features

- **Agent sessions.** An agent opens a session on a repository with its agent key, and
  %PRODUCT_NAME% tracks what it does to the code there. Sessions see which files other sessions
  are working on. See
  [Managing agents and sessions](/agent-workflows/agents-and-sessions/).
- **Transcripts.** Agents upload their conversation, tied to the commits it produced, and
  reviewers read it beside the code. See [Transcripts](/agent-workflows/transcripts/).
- **Brackets.** A pull request is split into brackets of related changes, each with a short
  explanation, by its agent or by the server. See [Brackets](/code-review/brackets/).
- **Review by lines and chunks.** Accept a line, a chunk or a whole bracket. An accepted change
  stays accepted in later revisions while it is unchanged. See
  [Accepting changes](/code-review/accepting-changes/).
- **Chunk context.** A change shows the reference implementation it follows, or the code it was
  moved from. See [Chunk context](/code-review/chunk-context/).
- **Confidence levels.** Rules auto-accept matching changes, mark them as high impact, or make
  them wait on a named reviewer. See [Confidence levels](/code-review/confidence-levels/).
- **Chat with your agent.** Ask your own agent about the lines in front of you while you review.
  See [Agent chat](/code-review/agent-chat/).
- **GitHub integration.** Mirror a GitHub repository, see its workflow runs and merge through
  GitHub. See [GitHub integration](/capabilities/github-integration/).
- **Self-hosted on Cloudflare.** One Worker on your own Cloudflare account, with git over HTTPS.
  See [Quick start](/getting-started/installation/quick-start/).

## Where to next

- **Install an instance:** the [Quick start](/getting-started/installation/quick-start/) uses
  the Deploy to Cloudflare button. [Manual installation](/getting-started/installation/manual/)
  forks the repository and deploys with its GitHub Actions workflows.
- **Set it up:** [Initial setup](/getting-started/installation/initial-setup/) creates the first
  admin. [First run](/getting-started/first-run/) takes you from an empty
  repository to a reviewed pull request.
- **Work with agents:** [Managing agents and sessions](/agent-workflows/agents-and-sessions/)
  and [Prompting your agent](/agent-workflows/prompting-your-agent/).
- **Review code:** [Lines and chunks](/code-review/lines-and-chunks/) and
  [Brackets](/code-review/brackets/).
- **Connect GitHub:** [GitHub integration](/capabilities/github-integration/).
- **Run the instance:** [Server agent setup](/administration/server-agent-setup/),
  [Email](/administration/email/), [Rules](/administration/rules/) and
  [Monitoring and logs](/administration/monitoring-and-logs/).
- **Make it your own:** [Custom domain](/customization/custom-domain/),
  [Pulling from origin](/customization/pulling-from-origin/) and
  [Working with edge-stack](/customization/working-with-edge-stack/).

For working on the code itself, see the
[contributor docs on GitHub](https://github.com/alonbardavid/iron-garden#docs).
