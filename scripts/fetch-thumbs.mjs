// =============================================================================
// fetch-thumbs.mjs
// Self-hosts YouTube thumbnails so the site never depends on i.ytimg.com at
// runtime (propagation lag + aggressive caching can otherwise leave stale gray
// placeholders). For each video it downloads the best real thumbnail to
// public/thumbs/<id>.jpg and records which videos got one in src/data/thumbs.json.
// Videos without a usable thumbnail fall back to a clean branded card on the site.
//
// Notes:
//   • maxresdefault is 16:9 and best quality; hqdefault is the reliable fallback.
//   • YouTube returns a tiny (~1KB) blank when a video has no thumbnail, and
//     occasionally a ~10KB generic gray placeholder while a custom thumbnail is
//     still propagating across its CDN. We reject the tiny blank outright and
//     reject any image whose hash is a known gray placeholder, retrying a few
//     times to ride out propagation before giving up.
//   • Reusing one custom thumbnail across several videos is fine — those are
//     real images and are kept (we do NOT treat "shared image" as a placeholder).
//
// Run:  node scripts/fetch-thumbs.mjs           (incremental — keeps thumbs already saved)
//       node scripts/fetch-thumbs.mjs --force    (re-download all, e.g. after editing thumbnails on YouTube)
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PROJECTS = resolve(ROOT, "src/data/projects.json");
const THUMBS_DIR = resolve(ROOT, "public/thumbs");
const MANIFEST = resolve(ROOT, "src/data/thumbs.json");

const FORCE = process.argv.includes("--force");
const CONCURRENCY = 6;
const MIN_BYTES = 1500; // YouTube's "no thumbnail" blank is ~1KB; real (even dark) frames are larger
const MAX_RETRIES = 8; // ride out CDN propagation inconsistency
const RETRY_DELAY = 400; // ms

// Known md5 hashes of YouTube's generic gray "no thumbnail" placeholder. Empty
// for now (none survived our checks once custom thumbnails propagated); kept as
// an easy denylist to extend if a stubborn gray image ever shows up.
const GRAY_HASHES = new Set([]);

const SIZES = ["maxresdefault", "hqdefault"];

const data = JSON.parse(readFileSync(PROJECTS, "utf8"));
const videos = (data.videos || []).filter((v) => v.youtubeId);

mkdirSync(THUMBS_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (buf) => createHash("md5").update(buf).digest("hex");

async function fetchSize(id, size) {
  try {
    const res = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES) return null;
    if (GRAY_HASHES.has(md5(buf))) return null;
    return buf;
  } catch {
    return null;
  }
}

// Best real image for a video, with retries to survive propagation flakiness.
async function fetchReal(id) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    for (const size of SIZES) {
      const buf = await fetchSize(id, size);
      if (buf) return buf;
    }
    await sleep(RETRY_DELAY);
  }
  return null;
}

const good = [];
let idx = 0;
async function worker() {
  while (idx < videos.length) {
    const v = videos[idx++];
    const file = resolve(THUMBS_DIR, `${v.youtubeId}.jpg`);
    if (!FORCE && existsSync(file)) {
      good.push(v.youtubeId);
      continue;
    }
    const buf = await fetchReal(v.youtubeId);
    if (buf) {
      writeFileSync(file, buf);
      good.push(v.youtubeId);
    } else if (existsSync(file)) {
      // Refresh fetch failed (usually transient CDN flakiness) but we already
      // have a good thumbnail on disk — keep it rather than regressing.
      good.push(v.youtubeId);
      console.warn(`[fetch-thumbs] keeping existing thumbnail for ${v.youtubeId} (refresh fetch failed)`);
    } else {
      console.warn(`[fetch-thumbs] no usable thumbnail for ${v.youtubeId} (${v.title})`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Remove orphaned thumb files for videos no longer in the data.
const keep = new Set(good.map((id) => `${id}.jpg`));
for (const f of readdirSync(THUMBS_DIR)) {
  if (f.endsWith(".jpg") && !keep.has(f)) rmSync(resolve(THUMBS_DIR, f));
}

good.sort();
writeFileSync(MANIFEST, JSON.stringify(good, null, 2) + "\n");
console.log(
  `[fetch-thumbs] ${good.length}/${videos.length} real thumbnails self-hosted; ` +
    `${videos.length - good.length} fall back to a branded card.`
);
