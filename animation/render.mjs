// Renders Biscuit's day: every scene in biscuit.js becomes media/clips/<name>.mp4 and media/snapshots/<name>.jpg.
// Run from the repo root: node animation/render.mjs [scene ...]   (needs ffmpeg and Playwright's Chromium)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const media = join(here, '..', 'media');
mkdirSync(join(media, 'clips'), { recursive: true });
mkdirSync(join(media, 'snapshots'), { recursive: true });

const FPS = 24;
const SECONDS = 6;
const SNAPSHOT_AT = { 'walk-start': 2, 'walk-end': 3.6, 'walker-arrive': 2.6, 'family-home': 3.2, escape: 3, wake: 3.4 };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`file://${join(here, 'studio.html')}`);
const all = await page.evaluate(() => window.SCENES.filter((s) => s !== 'sheet'));
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;

for (const name of wanted) {
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(media, 'clips', `${name}.mp4`)]);
  for (let f = 0; f < FPS * SECONDS; f++) {
    await page.evaluate(([n, t]) => window.draw(n, t), [name, f / FPS]);
    const png = await page.locator('canvas').screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
  await page.evaluate(([n, t]) => window.draw(n, t), [name, SNAPSHOT_AT[name] ?? 2]);
  await page.locator('canvas').screenshot({ type: 'jpeg', quality: 88, path: join(media, 'snapshots', `${name}.jpg`) });
  console.log('rendered', name);
}

// Biscuit's portrait for the pet profile.
await page.evaluate(() => window.draw('sheet', 0.4));
await page.locator('canvas').screenshot({ type: 'jpeg', quality: 88, path: join(media, 'snapshots', 'biscuit.jpg'), clip: { x: 20, y: 170, width: 260, height: 240 } });
await browser.close();
