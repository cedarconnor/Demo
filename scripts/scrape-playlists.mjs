// =============================================================================
// scrape-playlists.mjs
// Regenerates src/data/projects.json to mirror the YouTube playlists in
// playlists.config.json — WITHOUT a YouTube API key. It reads each playlist's
// public/unlisted page, paginates through every video via the InnerTube
// continuation API, and writes videos in playlist order.
//
// Run:  node scripts/scrape-playlists.mjs
// Then: node scripts/fetch-thumbs.mjs    (self-host thumbnails for any new videos)
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../src/data");
const CONFIG_PATH = resolve(DATA_DIR, "playlists.config.json");
const OUT_PATH = resolve(DATA_DIR, "projects.json");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" };

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const existing = JSON.parse(readFileSync(OUT_PATH, "utf8"));
const playlists = (config.playlists || []).filter((p) => p.id && !/^PUT_/.test(p.id));

const SKIP_TITLE = /^\[?(private|deleted|unavailable)\s*video\]?$/i;

// Pull the first balanced {...} object following a marker string.
function extractObject(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let i = html.indexOf("{", start);
  if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(i, j + 1));
    }
  }
  return null;
}

// Depth-first search for the first value under `key`.
function findKey(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const k of Object.keys(obj)) {
    const r = findKey(obj[k], key);
    if (r != null) return r;
  }
  return null;
}

// Collect all every-key matches (videos appear once per lockup).
function findAll(obj, key, out = []) {
  if (!obj || typeof obj !== "object") return out;
  if (Object.prototype.hasOwnProperty.call(obj, key)) out.push(obj[key]);
  for (const k of Object.keys(obj)) findAll(obj[k], key, out);
  return out;
}

// YouTube's current playlist layout renders each video as a lockupViewModel.
function videosFrom(tree) {
  const vids = [];
  for (const lv of findAll(tree, "lockupViewModel")) {
    if (lv?.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") continue;
    const videoId = lv.contentId;
    const title = (lv.metadata?.lockupMetadataViewModel?.title?.content || findKey(lv.metadata, "title")?.content || "").trim();
    if (videoId && title && !SKIP_TITLE.test(title)) vids.push({ videoId, title });
  }
  return vids;
}

// The "load more" token lives in a continuationCommand; the playlist's own token
// base64-decodes to contain its playlist id (other tokens are for comments etc.).
function tokenFrom(tree, playlistId) {
  for (const c of findAll(tree, "continuationCommand")) {
    const t = c?.token;
    if (!t) continue;
    try { if (Buffer.from(t, "base64").toString("latin1").includes(playlistId)) return t; } catch {}
  }
  return findKey(tree, "continuationItemRenderer")?.continuationEndpoint?.continuationCommand?.token || null;
}

async function browse(token, apiKey, clientVersion) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion } },
      continuation: token,
    }),
  });
  if (!res.ok) throw new Error(`InnerTube browse ${res.status}`);
  return res.json();
}

async function scrapePlaylist(id) {
  const html = await (await fetch(`https://www.youtube.com/playlist?list=${id}`, { headers: HEADERS })).text();
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion =
    html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1] ||
    html.match(/"clientVersion":"([^"]+)"/)?.[1];
  const initial = extractObject(html, "var ytInitialData =") || extractObject(html, 'ytInitialData"] =');
  if (!initial) throw new Error(`could not parse ytInitialData for ${id}`);

  const all = videosFrom(initial);
  const seen = new Set(all.map((v) => v.videoId));
  let token = tokenFrom(initial, id);
  let guard = 0;
  while (token && apiKey && clientVersion && guard++ < 80) {
    const json = await browse(token, apiKey, clientVersion);
    for (const v of videosFrom(json)) {
      if (!seen.has(v.videoId)) { seen.add(v.videoId); all.push(v); }
    }
    const next = tokenFrom(json, id);
    if (next === token) break; // no progress
    token = next;
  }
  return all;
}

function slugify(t) {
  const s = String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "video";
}

// Preserve descriptions already written for a video (keyed by youtube id).
const descById = new Map((existing.videos || []).map((v) => [v.youtubeId, v.description || ""]));

const categories = {};
for (const pl of playlists) categories[pl.category] = pl.label;

const seen = new Set();
const slugs = new Set();
const videos = [];

for (const pl of playlists) {
  let items;
  try {
    items = await scrapePlaylist(pl.id);
  } catch (err) {
    console.error(`[scrape] ${pl.label}: ${err.message} — aborting (projects.json left unchanged).`);
    process.exit(1);
  }
  let added = 0;
  for (const it of items) {
    if (seen.has(it.videoId)) continue; // a video lives in its first playlist (config order)
    seen.add(it.videoId);
    let slug = slugify(it.title);
    let base = slug, n = 2;
    while (slugs.has(slug)) slug = `${base}-${n++}`;
    slugs.add(slug);
    videos.push({
      slug,
      title: it.title,
      description: descById.get(it.videoId) || "",
      category: pl.category,
      playlist: pl.category,
      youtubeId: it.videoId,
    });
    added++;
  }
  console.log(`[scrape] ${pl.label}: ${items.length} in playlist, ${added} added`);
}

const site = { ...existing.site };
writeFileSync(OUT_PATH, JSON.stringify({ site, categories, videos }, null, 2) + "\n");
console.log(`[scrape] wrote ${videos.length} videos across ${playlists.length} playlists to projects.json`);
