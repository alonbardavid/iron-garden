---
title: Custom domain
description: Serve the instance on your own domain and make it the canonical URL.
---

To serve the instance on your own domain, attach the domain to the production Worker in
Cloudflare, then make it the instance's **canonical URL**, the address it falls back to for
sign-in and the links it sends. The docs come with it: they are served at `/docs/` on whatever
host serves the app.

## Links and sign-ins

The links the instance hands out are built from the address they were requested on:

- an agent's session prompt, its git remote and its API links;
- the webhook URL a GitHub-connected repository gives GitHub;
- sign-ins, which belong to one host.

Moving from a `workers.dev` address to a custom domain later means everyone signs in again,
each GitHub-connected repository re-creates its webhook from its **Settings › GitHub**, and agent
prompts handed out before the move point at the old address.

## 1. Attach the domain in Cloudflare

The domain must be a zone on the same Cloudflare account.

1. In the Cloudflare dashboard, open **Workers & Pages** and select the production Worker
   (`iron-garden` for a [manual installation](/getting-started/installation/manual/)).
2. Open its **Domains** tab and add the hostname as a custom domain, for example
   `git.example.com`. (On an older dashboard: **Settings › Domains & Routes › Add › Custom
   domain**.)

Cloudflare creates the DNS record and the certificate. The deploy itself never creates the
domain.

## 2. Make it the canonical URL

Each deploy stamps the canonical URL on the Worker. It comes from `PROD_HOST`: the hostname
alone, without `https://`.

**Manual installation (forked workflows):**

1. In your fork, open **Settings › Secrets and variables › Actions › Variables**.
2. Add or edit the `PROD_HOST` variable: `git.example.com`.
3. Push to `main`. The production deploy has no manual trigger.

Without `PROD_HOST`, production uses `iron-garden.<subdomain>.workers.dev`.

**Deploy from your machine:** export `PROD_HOST` before `pnpm run deploy`, which builds the
canonical URL from it.

**Quick start (Deploy to Cloudflare button):** the instance is deployed by Workers Builds with
the repository's `deploy` script, which reads `PROD_HOST` from the build environment. Add
`PROD_HOST` as a build variable on the Worker (**Settings › Build**, under build variables), then
push to `main` or retry the latest build.

## How the instance treats hostnames

One deployed version can answer on its `workers.dev` address and any custom domains. For sign-in
and the links in emails, it decides the base URL per request:

| The request arrives on            | Base URL used                                     |
| --------------------------------- | ------------------------------------------------- |
| The canonical host                | The canonical host                                |
| A host on the target's allow-list | That host                                         |
| Any other host                    | The canonical URL (`FRONTEND_CANONICAL_BASE_URL`) |

Production's allow-list is empty, so only the canonical host counts. Staging allows its own
`workers.dev` address and every branch preview under it. To add hosts, edit `allowedHosts` for
the target in `scripts/lib/environments.mjs` in your copy.

Once the custom domain is canonical, send people and agents to it, not to the `workers.dev`
address.

## The docs

The docs are part of every deploy and follow the app to the new host, at
`https://git.example.com/docs/`. The **Documentation** item in the account menu opens them. If
you also publish them to GitHub Pages, that copy uses the address GitHub Pages gives it, custom
domain included; see [Manual installation](/getting-started/installation/manual/).
