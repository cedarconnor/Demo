// =============================================================================
// sync-playlists.mjs
// Pulls every video from your YouTube playlists and regenerates
// src/data/projects.json so the website mirrors how you sort on YouTube.
//
// How it works:
//   • Reads src/data/playlists.config.json (which playlist ID -> which category)
//   • If a YOUTUBE_API_KEY is available, it fetches each playlist's items and
//     rewrites projects.json. Anything you add to a playlist on YouTube shows
//     up on the site the next time this runs (a GitHub Action runs it daily).
//   • If there's NO API key (e.g. local dev without one), it leaves the existing
//     committed projects.json untouched, so the site still builds fine.
//
// Run manually:   YOUTUBE_API_KEY=xxxx node scripts/sync-playlists.mjs
// Runs in CI:     see .github/workflows/deploy.yml
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../src/data");
const CONFIG_PATH = resolve(DATA_DIR, "playlists.config.json");
const OUT_PATH = resolve(DATA_DIR, "projects.json");

const API_KEY = process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY || "";

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const existing = JSON.parse(readFileSync(OUT_PATH, "utf8"));

const configured = (config.playlists || []).filter(
  (p) => p.id && !/^PUT_/.test(p.id)
);

if (!API_KEY || configured.length === 0) {
  const why = !API_KEY ? "no YOUTUBE_API_KEY set" : "no playlist IDs filled in playlists.config.json";
  console.log(`[sync-playlists] Skipping live sync (${why}). Using committed projects.json (${existing.videos.length} videos).`);
  process.exit(0);
}

const SKIP_TITLES = new Set(["Private video", "Deleted video", "This video is private"]);

function slugify(t) {
  const s = String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "video";
}

async function fetchPlaylistItems(playlistId) {
  const items = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("key", API_KEY);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YouTube API ${res.status} for playlist ${playlistId}: ${body}`);
    }
    const json = await res.json();
    items.push(...(json.items || []));
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return items;
}

const categories = {};
for (const p of configured) categories[p.category] = p.label;

const seen = new Set();
const videos = [];

for (const pl of configured) {
  let items;
  try {
    items = await fetchPlaylistItems(pl.id);
  } catch (err) {
    console.error(`[sync-playlists] ${err.message}`);
    console.error(`[sync-playlists] Aborting; keeping existing projects.json untouched.`);
    process.exit(0); // never break the build over a transient API hiccup
  }

  for (const it of items) {
    const sn = it.snippet || {};
    const videoId = sn.resourceId?.videoId || it.contentDetails?.videoId;
    const title = (sn.title || "").trim();
    if (!videoId || SKIP_TITLES.has(title)) continue;

    let slug = slugify(title);
    let base = slug, n = 2;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.add(slug);

    videos.push({
      slug,
      title: title || "Untitled",
      description: (sn.description || "").split("\n")[0].trim(),
      category: pl.category,
      playlist: pl.category,
      youtubeId: videoId,
    });
  }
  console.log(`[sync-playlists] ${pl.label}: ${items.length} items`);
}

// Preserve site meta; keep featured slugs that still exist, else fall back to
// the first few "finals" pieces.
const slugSet = new Set(videos.map((v) => v.slug));
const site = { ...existing.site };
site.reelId = config.reelId || site.reelId || "";
let featured = (site.featuredSlugs || []).filter((s) => slugSet.has(s));
if (featured.length === 0) {
  featured = videos.filter((v) => v.category === "finals").slice(0, 8).map((v) => v.slug);
}
site.featuredSlugs = featured;

writeFileSync(
  OUT_PATH,
  JSON.stringify({ site, categories, videos }, null, 2) + "\n"
);
console.log(`[sync-playlists] Wrote ${videos.length} videos across ${configured.length} playlists to projects.json`);
