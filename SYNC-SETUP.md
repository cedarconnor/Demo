# Auto-sync from YouTube playlists

Your site's video library is generated from your YouTube playlists. Sort a video
into a playlist on YouTube, and it shows up in the matching section of the site on
the next build. Remove it from the playlist, and it disappears. You never edit a
list of videos by hand.

## How it works

1. `scripts/sync-playlists.mjs` reads `src/data/playlists.config.json` (which
   playlist maps to which on-site section).
2. It calls the YouTube Data API, pulls every video in each playlist, and rewrites
   `src/data/projects.json`.
3. `npm run build` runs this automatically (via the `prebuild` script), then Astro
   builds the static site.
4. A GitHub Action rebuilds **once a day** (and on every push), so playlist changes
   reach the live site within ~24h without you touching anything.

If no API key is present (e.g. local dev), the build keeps the committed
`projects.json` — so it never breaks. The site currently ships with all 216 videos
already baked in, so it works today even before you do the steps below.

## One-time setup (about 10 minutes)

### 1. Get a YouTube Data API key (free)

1. Go to <https://console.cloud.google.com/> and create a project (or pick one).
2. **APIs & Services → Library → "YouTube Data API v3" → Enable.**
3. **APIs & Services → Credentials → Create credentials → API key.** Copy it.
4. (Optional, recommended) Restrict the key to the YouTube Data API.

Read-only access to your own public **or unlisted** playlists needs only this key —
no OAuth, no login.

### 2. Find your four playlist IDs

Open each playlist on YouTube. The URL looks like:

```
https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxx
```

The `PL...` part after `list=` is the playlist ID. Each playlist must be **Public
or Unlisted** (not Private) for the API key to read it.

> Note: the videos *inside* the playlist can stay **Unlisted** — they still embed
> on your site fine. It's the *playlist* that needs to be Public/Unlisted.

### 3. Fill in `src/data/playlists.config.json`

Replace the `PUT_..._HERE` placeholders with your IDs. The order here is the order
sections appear on the site. Example:

```json
{
  "channelUrl": "https://www.youtube.com/@cedarconnor",
  "reelId": "xUer7Y42WIY",
  "playlists": [
    { "id": "PLabc...", "category": "finals",        "label": "Finals" },
    { "id": "PLdef...", "category": "before-after",  "label": "Before & After" },
    { "id": "PLghi...", "category": "wip",            "label": "Work in Progress" },
    { "id": "PLjkl...", "category": "experiments",   "label": "Experiments" }
  ]
}
```

- `reelId` is the 11-char video ID used for the big hero reel on the home page.
- You can add, remove, or rename playlists here. Add a new entry and it becomes a
  new filter on `/work` and a new strip on the home page automatically. (Home-page
  strips are listed in `src/pages/index.astro` → the `strips` array.)

### 4. Add the API key as a GitHub secret

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

- Name: `YOUTUBE_API_KEY`
- Value: the key from step 1

That's it. The next scheduled run (or push, or a manual **Actions → Deploy → Run
workflow**) will sync and deploy.

## Test it locally

```bash
cd site
npm install
YOUTUBE_API_KEY=your_key_here npm run sync   # regenerates projects.json
npm run dev                                   # http://localhost:4321/Demo/
```

## Changing the daily schedule

Edit the `cron` line in `.github/workflows/deploy.yml` (it's in UTC). For example,
`0 9 * * *` is 09:00 UTC daily. Remove the whole `schedule:` block if you only want
rebuilds when you push.
