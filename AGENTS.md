# Agent guide — garrypolley.com

Personal Hugo site for Garry Polley. Live at https://garrypolley.com. Source: https://github.com/garrypolley/garrypolley.

## Stack & deploy

- **Hugo** static site, theme **anatole** (git submodule: `themes/anatole` → https://github.com/garrypolley/anatole.git)
- **Netlify** site `garrypolley` builds on push to `master`
  - Build: `hugo --gc --minify`
  - Publish dir: `public`
  - Deploy previews: `hugo -b $DEPLOY_PRIME_URL`
  - Deploy previews / branch deploys use `hugo -D` so draft posts are reviewable on Netlify preview URLs
- Production build stays `hugo --gc --minify` (drafts excluded)
- **DNSimple** for DNS
- No GitHub Actions / `.github` workflows — Netlify is CI/CD
- Contact form is a **Netlify Forms** form (`data-netlify="true"` on `content/contact.html`)

### Preview URLs (important)

When sharing a Netlify deploy preview with the user:

- Use **exactly** the URL Netlify reports — usually the `netlify/garrypolley/deploy-preview` status `target_url` on the PR. Example shape: `deploy-preview-<PR#>--garrypolley.netlify.app` (note the double hyphen).
- Do **not** invent hosts, rewrite the subdomain, or append path segments (`/tool/...`, `/post/...`, etc.) when giving “the preview URL.”
- Point people at that root preview link; they can use the site nav (Home / Posts / Recipes / Tools / Games / Contact) from there.
- Production remains `https://garrypolley.com` after merge to `master`.

**Chat / markdown link gotcha:** Netlify preview hostnames contain `--`. Many chat UIs and markdown linkifiers split or rewrite that, so the clickable link does not match the visible text. Avoid bare autolinked URLs. Prefer one of:

- Inline code (best for copy-paste): `` `https://deploy-preview-6--garrypolley.netlify.app` ``
- Angle brackets: `<https://deploy-preview-6--garrypolley.netlify.app>`

Do not use markdown links whose label text is a different URL than the href.

Redirects in `netlify.toml`:

- `blog.garrypolley.com` → `/post/`
- `recipe.garrypolley.com` → `/recipe/`
- `/polley-house` → `polley-house-pics.netlify.app` (proxy, 200)

## Local setup

```bash
git submodule update --init
brew install hugo   # or install Hugo ~0.85 to match Netlify
hugo server         # http://localhost:1313
hugo --gc --minify  # production-like build → public/
```

`public/` is gitignored. Always init the submodule before building — without `themes/anatole` the site will not render.

## Repo layout

| Path | Role |
|------|------|
| `config.toml` | Site config, menus, permalinks, theme params |
| `content/post/` | Blog posts (Markdown) |
| `content/recipe/` | Recipes (Markdown + structured front matter) |
| `content/tool/` | In-browser web tools (Markdown + shortcodes/JS) |
| `content/game/` | In-browser games (Markdown + shortcodes/JS) |
| `content/contact.html`, `thank-you.html` | Contact + form success (HTML content pages) |
| `layouts/` | Theme overrides (recipe/tool/game templates + shortcodes) |
| `static/` | CSS, images, JS, favicon (copied as-is) |
| `archetypes/` | `hugo new` templates for post/recipe/tool/game |
| `netlify.toml` | Build command, redirects, preview base URL |

## Content conventions

### Posts (`content/post/`)

- Prefer `hugo new post/my-slug.md` (uses `archetypes/default.md`)
- Typical front matter: `title`, `date`, optional `Description`, `Tags`, `Categories`, `DisableComments`, `draft`
- Permalinks: `/:year/:month/:day/:slug/`
- Images: put under `static/images/<slug-or-topic>/…` and reference as `/images/...`
- Interactive bits use shortcodes in `layouts/shortcodes/` (e.g. `{{< timesTable >}}`, `{{< sukoSolver >}}`, `{{< googleGroup id="…" >}}`, `{{< googleslide id="…" >}}`)
- If a post was written with AI assistance (Cursor, voice-to-text into an agent, etc.), end it with this line so that's clear:

  `*Post written with AI assistance.*`

### Recipes (`content/recipe/`)

- Prefer `hugo new recipe/my-slug.md` (uses `archetypes/recipe.md`)
- Front matter drives the page: `ingredients` (`name` / `amount`), `steps`, `image`, `short`, `slug`
- Image path expectation: `static/images/recipe/<slug>/<image>` (see `layouts/recipe/single.html` and `li.html`)
- Permalinks: `/recipe/:slug/`
- Custom CSS: `static/css/recipe.css` (wired via `params.customCss`)

### Tools (`content/tool/`)

- Prefer `hugo new tool/my-slug.md` (uses `archetypes/tool.md`)
- Front matter: `title`, `slug`, `date`, `short`, `draft`
- Permalinks: `/tool/:slug/`
- Keep interactive UI in shortcodes and/or `static/js/` + `static/css/tool.css`
- Existing tools: Suko Solver (`{{< sukoSolver >}}`), SVG to PNG (`{{< svgToPng >}}`), Interest Return (`{{< interestReturn >}}`)
- Tools are navigable via the Tools menu; they are not included in `mainSections` (home feed)

### Games (`content/game/`)

- Prefer `hugo new game/my-slug.md` (uses `archetypes/game.md`)
- Front matter: `title`, `slug`, `date`, `short`, `draft`
- Permalinks: `/game/:slug/`
- Interactive UI can reuse tool shortcodes/JS/CSS (`static/css/tool.css` is already global)
- Existing games: SumSwipe (`{{< sumSwipe >}}` — daily 5×5 fill-the-board; ENABLE word list)
- Word list: `static/data/sumswipe-words.txt` (ENABLE, public domain, lengths 3–8); rebuild with `node scripts/build-sumswipe-dict.js`
- Games are navigable via the Games menu; they are not included in `mainSections` (home feed)
- Old `/tool/sumswipe/` redirects to `/game/sumswipe/`

### Contact

- Keep Netlify form attributes (`name="contact"`, `data-netlify="true"`, honeypot) if editing the form
- Success page: `/thank-you/`

## What to change carefully

- Do not replace or vendor the theme into this repo; update the submodule pointer instead
- Do not remove Netlify redirects without a reason — old subdomains and `/polley-house` still matter
- `config.toml` `baseURL` is the production URL; preview builds override via Netlify context
- HTML content pages need `[security] allowContent` to include `text/html` on newer Hugo; keep that when changing security config
- Some posts include raw HTML; `[markup.goldmark.renderer] unsafe = true` is required for correct rendering on modern Hugo

## Useful checks

```bash
hugo --gc --minify          # must succeed before considering a change done
hugo server                 # spot-check post/recipe/contact locally
git submodule status        # theme should be checked out, not empty
node scripts/smoke-svg-to-png.js       # SVG→PNG helper smoke tests
node scripts/smoke-interest-return.js  # Interest Return calculator smoke tests
node scripts/smoke-sumswipe.js         # SumSwipe puzzle helper smoke tests
node scripts/build-sumswipe-dict.js    # rebuild ENABLE word list (optional)
```
