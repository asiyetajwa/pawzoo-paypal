// Captures every state the Pawzoo PayPal film shows, from the real app and the real PayPal sandbox checkout, at
// 1600 css px wide @2x, and records the on-screen box of each button the cursor clicks and of each answer the
// camera reads (public/pawzoo/boxes.json). The payments are real sandbox payments: the sandbox buyer logs in and
// approves on PayPal's own page, exactly as a person would. Start Pawzoo with PayPal sandbox credentials first
// (npm start in the repo root), then: npm run capture
// The sandbox buyer's login comes from PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD (never committed).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PAWZOO_URL ?? 'http://127.0.0.1:8787';
const BUYER = { email: process.env.PAYPAL_SANDBOX_BUYER_EMAIL, password: process.env.PAYPAL_SANDBOX_BUYER_PASSWORD };
if (!BUYER.email || !BUYER.password) throw new Error('Set PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD');
const OUT = new URL('../public/pawzoo/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const post = (path, body) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const status = await (await fetch(`${BASE}/api/status`)).json();
if (status.paypal !== 'sandbox') throw new Error('Pawzoo is not connected to the PayPal sandbox; the film shows real sandbox payments.');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const SIM_H = 1280;
const ctx = await browser.newContext({ viewport: { width: 1600, height: SIM_H }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await ctx.newPage();
const boxes = { size: { w: 1600, h: SIM_H }, paypal: { w: 480, h: 720 } };
const settle = (ms = 1700) => page.waitForTimeout(ms);

async function boxOf(key, locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`No box for ${key}`);
  boxes[key] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

/** A button inside the MCP Apps card iframe, in page coordinates. */
async function cardButtonBox(key, text) {
  const inner = await page.frameLocator('#card iframe').locator(`button:has-text("${text}")`).first().boundingBox();
  if (!inner) throw new Error(`No card button ${text}`);
  boxes[key] = { x: Math.round(inner.x), y: Math.round(inner.y), w: Math.round(inner.width), h: Math.round(inner.height) };
}

async function shot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > SIM_H) throw new Error(`${name} is ${String(height)}px tall; raise SIM_H so nothing is cut off`);
  await boxOf(`answer:${name}`, page.locator('.answer'));
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('captured', name);
}

const transcript = () => page.evaluate(() => document.querySelector('#transcript')?.textContent ?? '');
const chip = (say) => page.locator(`[data-say="${say}"]`);
/** Taps a suggestion chip and waits for the answer's line to land. */
async function ask(key, say, expect) {
  await boxOf(key, chip(say));
  await chip(say).click();
  await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('#transcript')?.textContent ?? ''), expect.source, { timeout: 60000 });
  await page.waitForSelector('#card iframe');
  await settle();
}

/** Approves on PayPal's own sandbox checkout, as the sandbox buyer, and captures PayPal's page for the film. */
async function approveOnPayPal(prefix) {
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), page.frameLocator('#card iframe').locator('button[data-link]').click()]);
  await popup.waitForLoadState();
  await popup.waitForTimeout(3000);
  if (await popup.locator('#email').count()) {
    await popup.locator('#email').fill(BUYER.email);
    if (await popup.locator('#btnNext').count()) await popup.locator('#btnNext').click();
    await popup.waitForTimeout(2500);
  }
  if (await popup.locator('#password').count()) {
    await popup.locator('#password').fill(BUYER.password);
    await popup.locator('#btnLogin').click();
  }
  const pay = popup.locator('[data-testid="submit-button-initial"], #payment-submit-btn').first();
  await pay.waitFor({ timeout: 45000 });
  await popup.waitForTimeout(2500);
  await popup.screenshot({ path: `${OUT}${prefix}-paypal.png` });
  const b = await pay.boundingBox();
  if (b) boxes[`${prefix}:pay`] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  boxes[`${prefix}:viewport`] = popup.viewportSize();
  console.log('captured', `${prefix}-paypal`);
  await pay.click();
  await page.waitForFunction(() => /Paid with PayPal/.test(document.querySelector('#transcript')?.textContent ?? ''), null, { timeout: 60000 });
  await settle(2200);
}

await post('/api/demo/reset');
await post('/api/demo/time', { time: '19:00' });
await page.goto(`${BASE}/?film=1`);
await page.waitForFunction(() => document.querySelector('#session')?.textContent?.includes('2025-11-25'));
// Silence in-app speech while capturing (the checkbox lives in the closed drawer).
await page.evaluate(() => {
  const box = document.querySelector('#speak');
  box.checked = false;
  box.dispatchEvent(new Event('change'));
});
await settle(1200);
await shot('sim-start');

await ask('chipFood', 'Do we need dog food?', /runs out/);
await shot('sim-food');

await ask('chipReorder', 'Reorder a bag of her food, with a $3 tip for the driver', /Shall I set it up\?/);
await shot('sim-propose');
await cardButtonBox('cardYes', 'Yes, Pay With PayPal');

await ask('chipYes', 'Yes', /Approve it on PayPal/);
await shot('sim-paypal');
await cardButtonBox('cardApprove', 'Approve on PayPal');
await approveOnPayPal('food');
await shot('sim-receipt');

await ask('chipWalk', 'How long was the walk?', /minutes/);
await shot('sim-walk');
await cardButtonBox('cardPayTip', 'Pay + $3 Tip');
await page.frameLocator('#card iframe').locator('button:has-text("Pay + $3 Tip")').click();
await page.waitForFunction(() => /Shall I set it up\?/.test(document.querySelector('#transcript')?.textContent ?? ''), null, { timeout: 60000 });
await settle();
await shot('sim-walkquote');
await ask('chipYes2', 'Yes', /Approve it on PayPal/);
await shot('sim-walkpaypal');
await approveOnPayPal('walk');
await shot('sim-walkreceipt');

await ask('chipReceipts', "Show me Biscuit's receipts", /receipts? for Biscuit/);
await shot('sim-receipts');

writeFileSync(`${OUT}boxes.json`, JSON.stringify(boxes, null, 2));
console.log('transcript:', (await transcript()).slice(0, 200));
await browser.close();
