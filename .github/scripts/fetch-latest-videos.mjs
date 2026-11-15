// Fetches the 3 newest videos from the Wisdom Academy Layyah Facebook page
// and writes them to data/latest-videos.json for the "Latest from Wisdom" section.
//
// Runs in GitHub Actions (.github/workflows/latest-videos.yml). Needs one secret:
//   FB_PAGE_TOKEN  - a Page access token for the Wisdom Academy Layyah page
//                    with the pages_read_engagement permission.
// Optional:
//   GRAPH_VERSION  - Graph API version, e.g. "v23.0".
//
// Run locally:  FB_PAGE_TOKEN=... node .github/scripts/fetch-latest-videos.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT_FILE = 'data/latest-videos.json';
const PAGE_URL = 'https://www.facebook.com/wisdomacadmy';
const COUNT = 3;

const token = process.env.FB_PAGE_TOKEN;
const version = process.env.GRAPH_VERSION || 'v23.0';

if (!token) {
  console.error('FB_PAGE_TOKEN is not set. Add it under GitHub > Settings > Secrets and variables > Actions.');
  process.exit(1);
}

// With a Page token, "me" is the page itself.
const fields = 'id,title,description,created_time,permalink_url,format';
const apiUrl = `https://graph.facebook.com/${version}/me/videos?fields=${encodeURIComponent(fields)}&limit=10`;

const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
const body = await res.json().catch(() => ({}));
if (!res.ok || body.error) {
  const e = body.error || {};
  console.error(`Facebook API error (${res.status}): ${e.message || 'unknown'} [code ${e.code ?? '-'}]`);
  process.exit(1);
}

const firstLine = (s) => (s || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const videos = (body.data || [])
  .filter((v) => v.permalink_url)
  .sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
  .slice(0, COUNT)
  .map((v) => {
    // The last format entry is the original upload size; it sets the player's shape.
    const fmt = Array.isArray(v.format) && v.format.length ? v.format[v.format.length - 1] : {};
    const url = v.permalink_url.startsWith('http')
      ? v.permalink_url
      : `https://www.facebook.com${v.permalink_url}`;
    return {
      id: v.id,
      title: clip(v.title || firstLine(v.description), 120),
      created_time: v.created_time,
      url,
      width: fmt.width || null,
      height: fmt.height || null,
    };
  });

// Only rewrite the file when the video list changed, so the workflow doesn't commit every run.
let previous = null;
try {
  previous = JSON.parse(await readFile(OUT_FILE, 'utf8'));
} catch {}

if (previous && JSON.stringify(previous.videos) === JSON.stringify(videos)) {
  console.log('No change in latest videos.');
  process.exit(0);
}

await mkdir('data', { recursive: true });
await writeFile(
  OUT_FILE,
  JSON.stringify({ updated: new Date().toISOString(), page: PAGE_URL, videos }, null, 2) + '\n'
);
console.log(`Wrote ${videos.length} video(s) to ${OUT_FILE}:`);
for (const v of videos) console.log(`  - ${v.created_time}  ${v.title || '(untitled)'}`);
