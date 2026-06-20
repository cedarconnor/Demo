# Maintaining this site

A practical guide to how `cedarconnor/Demo` works and what to do when you change
things on YouTube. Written for future-you.

---

## What this is

A static **Astro** portfolio site, deployed to **GitHub Pages** at
**https://cedarconnor.github.io/Demo/**. Every push to `main` triggers a GitHub
Actions build (`.github/workflows/deploy.yml`) that publishes the site.

- Source lives in `src/` (pages, components, layouts, styles).
- Video data lives in `src/data/projects.json` (generated — don't hand-edit).
- Thumbnails are **self-hosted** in `public/thumbs/<videoId>.jpg` (generated).
- The base path is `/Demo/` (set in `astro.config.mjs`). Internal links use the
  `url()` helper in `src/lib/url.ts` so the base path is applied correctly.

## Requirements

- **Node 20+** and npm. That's it — no API keys needed for the current setup.

## Everyday commands

```bash
npm install            # first time only
npm run dev            # local preview at http://localhost:4321/Demo/
npm run build          # production build into dist/ (what CI runs)
```

---

## The two things that get stale: playlists and thumbnails

The site mirrors four **unlisted** YouTube playlists. It is NOT live — it's a
snapshot baked into the repo at build time. So when you change things on YouTube,
you must re-pull and push. There are two independent refreshes:

### 1. You changed a PLAYLIST (added/removed/reordered/renamed clips)

```bash
npm run playlists:refresh    # = scrape playlists  +  fetch any new thumbnails
git add -A && git commit -m "Refresh playlists" && git push
```

`playlists:refresh` runs `scripts/scrape-playlists.mjs` (rebuilds
`src/data/projects.json` from the live playlists) then `scripts/fetch-thumbs.mjs`
(downloads thumbnails for any new videos). **This is the step you'll forget.**
If the site doesn't match YouTube, this is almost always why.

### 2. You changed a THUMBNAIL on YouTube (but not the playlist)

```bash
npm run thumbs:refresh       # re-downloads ALL thumbnails (--force)
git add -A && git commit -m "Refresh thumbnails" && git push
```

Then **hard-refresh your browser** (Ctrl+Shift+R) — see the caching gotcha below.

---

## How the playlist scrape works (and why it's built this way)

`scripts/scrape-playlists.mjs` reads `src/data/playlists.config.json` (which maps
each **playlist ID → site category + label**) and scrapes each playlist's page —
**no YouTube API key required**, which matters because the playlists are unlisted.

- It parses the page's embedded `ytInitialData`, reads each video from a
  `lockupViewModel`, and paginates past the first 100 via YouTube's internal
  (InnerTube) continuation API.
- Private/deleted videos are skipped automatically.
- A video that appears in **multiple** playlists is placed in the **first** one
  by config order (Finals → Before & After → WIP → Experiments).
- It preserves any existing per-video `description`; new videos get an empty one.

**To change the nav tabs or playlist mapping**, edit
`src/data/playlists.config.json` (order there = order of the nav tabs and pages),
then run `npm run playlists:refresh`.

> Gotcha: YouTube changes its page structure periodically. This scraper depends
> on `lockupViewModel` / `continuationCommand` shapes. If a refresh suddenly
> returns 0 videos, YouTube changed the layout and the parser in
> `scrape-playlists.mjs` needs updating. The script **aborts and leaves
> `projects.json` untouched** if a playlist returns nothing, so a bad scrape
> won't silently wipe your data — but always eyeball the printed counts.

There's also an older API-key path (`scripts/sync-playlists.mjs`, run by
`prebuild`) that no-ops without a `YOUTUBE_API_KEY`. We don't use it; the scrape
script is the source of truth. If you ever want fully-automated daily syncing,
that's the file to wire up (plus the API key as a repo secret).

---

## How thumbnails work (and the YouTube CDN saga)

Thumbnails are **self-hosted** rather than hot-linked from YouTube, because
hot-linking was unreliable. `scripts/fetch-thumbs.mjs` downloads each video's best
real thumbnail into `public/thumbs/<id>.jpg` and records the good ones in
`src/data/thumbs.json`. `ProjectTile.astro` serves the local image (with a live
YouTube fallback), and shows a clean branded card for any video with no thumbnail.

Gotchas discovered the hard way:

- **CDN propagation is flaky.** Right after you set a custom thumbnail, the same
  `i.ytimg.com` URL randomly returns the real image OR an old gray placeholder
  depending on which edge server answers. `fetch-thumbs.mjs` retries to ride this
  out. If a fresh thumbnail still looks gray, wait a bit and re-run
  `npm run thumbs:refresh`.
- **Browser caching.** Your browser caches the gray placeholder hard. After any
  thumbnail change, hard-refresh (Ctrl+Shift+R) or you'll keep seeing the old one
  even though the site is correct. Self-hosting mostly fixes this for visitors.
- **Reused thumbnails are fine.** If you put the same custom thumbnail on several
  videos, that's kept (an early version wrongly treated identical images as
  placeholders and dropped them).
- **`--force` never regresses.** `thumbs:refresh` keeps an existing good thumbnail
  if a re-download transiently fails, so a flaky CDN response can't blank a card.
- **Blank threshold.** Images under ~1.5 KB are treated as YouTube's "no
  thumbnail" blank. Real (even very dark) frames are larger.
- **Private/deleted videos** have no thumbnail; they won't appear via the scrape
  anyway. (We removed one dead video, `JLafB65z3qk`, by hand earlier.)

The home page's "Selected work" cards are separate from the playlists — they're
defined in `src/data/featured.json` (label + YouTube ID per card) and also get
self-hosted thumbnails. Edit that file to change the highlighted projects; the
fetch-thumbs script picks up their thumbnails too.

---

## Page / nav map

Nav order is **Home · Code · Models · Finals · Before & After · WIP · Experiments
· About** (defined in `src/components/Header.astro`; the four playlist tabs are
generated from the categories in the data).

| Page | File | Notes |
|------|------|-------|
| Home | `src/pages/index.astro` | Bio tagline, tools list, Selected-work cards (from `featured.json`). No videos embedded. |
| Code | `src/pages/code.astro` | GitHub repos only (hand-maintained array). |
| Models | `src/pages/models.astro` | Hugging Face models only (hand-maintained array). |
| Finals / Before-After / WIP / Experiments | `src/pages/*.astro` → `CategoryListing.astro` | One playlist each, from `projects.json`. |
| Video detail | `src/pages/work/[slug].astro` | Embedded player per video. |
| About | `src/pages/about.astro` | Short bio + email. |

The GitHub repo list and Hugging Face model list are **hand-edited arrays** inside
`code.astro` and `models.astro` — update them there when you ship new repos/models.

Old routes redirect: `/work` and `/ai` → `/finals`, `/contact` → `/about`.

---

## Quick reference

| I changed… | Run this |
|------------|----------|
| A playlist (added/removed/reordered clips) | `npm run playlists:refresh`, then commit + push |
| A thumbnail on YouTube | `npm run thumbs:refresh`, then commit + push, then hard-refresh browser |
| Homepage highlighted projects | edit `src/data/featured.json`, run `npm run thumbs`, commit + push |
| GitHub repos / HF models shown | edit the arrays in `code.astro` / `models.astro` |
| Nav tabs / playlist mapping | edit `src/data/playlists.config.json`, run `npm run playlists:refresh` |
| Anything in `src/` | just commit + push; CI rebuilds |

> The videos and Python download scripts in the parent `D:\Demo` folder are NOT
> part of this site repo and are gitignored — they were one-time tooling to
> acquire the source clips.
