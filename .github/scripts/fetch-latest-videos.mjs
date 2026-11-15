// Fetches the 3 newest videos from Wasim Faizi's YouTube channel and writes them
// to data/latest-videos.json for the "Latest from Wisdom" section.
//
// Uses YouTube's public channel feed, so no API key or token is needed.
// Runs in GitHub Actions (.github/workflows/latest-videos.yml), or locally:
//   node .github/scripts/fetch-latest-videos.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT_FILE = 'data/latest-videos.json';
const CHANNEL_ID = 'UCNyTQk9225GfBmdlX7tFyaA'; // youtube.com/@wasimfaizi-c4e
const CHANNEL_URL = 'https://www.youtube.com/@wasimfaizi-c4e';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const COUNT = 3;

const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (latest-videos script)' } });
if (!res.ok) {
  console.error(`YouTube feed request failed: HTTP ${res.status}`);
  process.exit(1);
}
const xml = await res.text();

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
   .replace(/&amp;/g, '&');
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : '';
};

const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
  .map(([, e]) => {
    const id = tag(e, 'yt:videoId');
    const link = (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || '';
    return {
      id,
      title: tag(e, 'title'),
      published: tag(e, 'published'),
      url: `https://www.youtube.com/watch?v=${id}`,
      short: link.includes('/shorts/'),
    };
  })
  .filter((v) => /^[\w-]{11}$/.test(v.id))
  .sort((a, b) => new Date(b.published) - new Date(a.published))
  .slice(0, COUNT);

if (!videos.length) {
  console.error('No videos found in the YouTube feed; leaving the data file unchanged.');
  process.exit(1);
}

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
  JSON.stringify({ updated: new Date().toISOString(), channel: CHANNEL_URL, videos }, null, 2) + '\n'
);
console.log(`Wrote ${videos.length} video(s) to ${OUT_FILE}:`);
for (const v of videos) console.log(`  - ${v.published}  ${v.short ? '[short] ' : ''}${v.title}`);
