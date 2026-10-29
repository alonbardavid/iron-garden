---
title: Pull request processing
description: What a pull request shows while it is processed, and the two processing modes.
---

A new pull request, and each new revision of one, is processed before it opens for review.
Processing splits the change into [brackets](/code-review/brackets/), among other things.

## While a pull request processes

The **Pull requests** list shows a **Processing** badge in place of review progress. On the
pull request, the **Brackets** tab shows **Processing this pull request**, says who is
processing it, and offers **Review by file meanwhile**. The **Files** tab works throughout, and
the brackets appear as soon as processing ends.

![A pull request in processing state on its Brackets tab](../../../assets/screenshots/pr-processing.png)

## Processing modes

An admin picks the mode under **Admin › Agent config › Pull request processing**:

- **The agent that opened it**, the default: your own agent processes its pull request.
- **This server, with Workers AI**: the server processes it, with a model an admin picks. See
  [Server agent setup](/administration/server-agent-setup/).

Each revision is processed in the mode set when it was stored.
