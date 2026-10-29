# Docs

The operating docs, for people who deploy, run and customize an instance (not for working on
the code, which is `docs/`). [Starlight](https://starlight.astro.build) builds them to static
HTML, which the Worker serves at `DOCS_PATH` (`/docs/`, from `@lib/contract/constants`):
`scripts/assemble-assets.mjs` copies `dist/` there. `main` also publishes them to GitHub Pages
(see [deployment](../../docs/deployment.md#docs-on-github-pages)).

```bash
pnpm --filter @app/docs dev      # live, at http://localhost:4321/docs/
pnpm --filter @app/docs build    # what `pnpm build` ships; search works only in a build
```

`pnpm dev` serves the last build at http://localhost:5173/docs/.

## Writing pages

Pages are Markdown in `src/content/docs/`; a folder is a sidebar group, listed in
`astro.config.mjs`.

- **Link from the site root, without the base**: `[Deploy](/getting-started/deploy/)`. The
  base differs between the app and a standalone build, so `remarkBaseLinks` adds it. The build
  fails on a link to a page or heading that does not exist.
- **Write `%PRODUCT_NAME%`, never the product name.** It is filled in body text and links,
  not in frontmatter, so titles leave it out.

## Screenshots

Pages show screenshots from `src/assets/screenshots/`, taken from a demo instance by
`tests/docs-screenshots/`: it starts a fresh local instance, creates people, agents and keys
through the API, seeds what git storage would hold (a billing API with one pull request holding
each kind of change), and captures each screen. It needs no Cloudflare account.

```bash
pnpm build                                   # the app the screenshots show
pnpm --filter tests docs:screenshots         # retakes every screenshot
DOCS_SCREENSHOTS_KEEP=1 pnpm --filter tests docs:screenshots 2-capture -g "brackets"
                                             # retakes some, on the last run's demo
```

The capture writes full-colour PNGs; before committing, cut them to a 256-colour palette
(`pngquant --ext .png --force src/assets/screenshots/*.png`, or any PNG optimizer), which
more than halves them with no visible change.

Embed one with a path relative to the page:
`![The Brackets tab](../../assets/screenshots/brackets-tab.png)`.

## A standalone site

Every link and asset URL in a build starts with its base, so a build is made for one address.
`DOCS_URL` builds for a standalone site instead of the app:

```bash
DOCS_URL=https://alonbardavid.github.io/iron-garden/ pnpm --filter @app/docs build
```
