---
title: Quick start
description: Deploy your own instance to Cloudflare with the Deploy to Cloudflare button.
---

The Deploy to Cloudflare button deploys an instance to your Cloudflare account. It asks for one
secret, and the instance's URL works a few minutes later.

## Requirements

- A Cloudflare account on the **Workers Paid** plan.
- A GitHub account.

## Deploy

1. Open the
   [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/alonbardavid/iron-garden)
   link and sign in to Cloudflare and GitHub when asked.
2. Let Cloudflare create the new repository on your GitHub account. It also creates the
   database and the other resources, and deploys the Worker.
3. Fill in the secret it asks for (see below).
4. When the deploy finishes, open the Worker's URL,
   `https://<worker>.<your-subdomain>.workers.dev`.

The first visit shows the setup form. Continue with
[Initial setup](/getting-started/installation/initial-setup/).

## The setup token

The button asks for one secret, `SETUP_TOKEN`: any random string of 4 or more characters. You
type it once on the setup form to create the first admin, and the form closes after that.

## After the deploy

- Every push to your repository's `main` branch redeploys the instance. To take in new releases,
  see [Pulling from origin](/customization/pulling-from-origin/).
- The operating docs ship with the instance, at `/docs/` on its own URL.
- Email, server processing and GitHub are off until you set them up.

To run production, staging and per-branch previews from your own GitHub Actions instead, use
[Manual installation](/getting-started/installation/manual/).
