// Renders Biscuit's day in clay: every scene in clay/clay.js becomes media/clips/<name>.mp4 and media/snapshots/<name>.jpg.
// Run from the repo root: node animation/clay/render.mjs [scene ...]
//   STILLS=<dir> node animation/clay/render.mjs [scene ...]   writes one review still per scene instead.
// Serves animation/ over HTTP (ES modules do not load from file://) and draws with software WebGL, so no GPU is needed.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const media = join(root, '..', 'media');
const stills = process.env.STILLS;
mkdirSync(join(media, 'clips'), { recursive: true });
mkdirSync(join(media, 'snapshots'), { recursive: true });
if (stills) mkdirSync(stills, { recursive: true });

const FPS = 24;
const SECONDS = 6;
const SNAPSHOT_AT = { 'walk-start': 2, 'walk-end': 3.6, 'walker-arrive': 2.6, 'family-home': 3.2, escape: 3, wake: 3.4 };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = readFileSync(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${port}/clay/index.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });
const stage = page.locator('#stage');
const draw = (n, t) => page.evaluate(([a, b]) => window.draw(a, b), [n, t]);

const all = await page.evaluate(() => window.SCENES.filter((s) => !['sheet', 'portrait', 'hero'].includes(s)));
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;

if (stills) {
  for (const name of wanted) {
    await draw(name, SNAPSHOT_AT[name] ?? 2);
    await stage.screenshot({ type: 'png', path: join(stills, `${name}.png`) });
    console.log('still', name);
  }
} else {
  for (const name of wanted) {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(media, 'clips', `${name}.mp4`)]);
    for (let f = 0; f < FPS * SECONDS; f++) {
      await draw(name, f / FPS);
      const png = await stage.screenshot({ type: 'png' });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
    await draw(name, SNAPSHOT_AT[name] ?? 2);
    await stage.screenshot({ type: 'jpeg', quality: 88, path: join(media, 'snapshots', `${name}.jpg`) });
    console.log('rendered', name);
  }
  if (!process.argv.slice(2).length) {
    // Biscuit's portrait for the pet profile.
    await draw('portrait', 0.4);
    await stage.screenshot({ type: 'jpeg', quality: 88, path: join(media, 'snapshots', 'biscuit.jpg') });
  }
}
await browser.close();
server.close();
