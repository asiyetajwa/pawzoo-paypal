// Pawzoo HTTP entry: the MCP endpoint, the camera webhook, PayPal's return pages, live pushes for the TV and the simulator,
// demo controls, and static media.

import './env.js';
import express from 'express';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { localhostOriginValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createPawzooServer, PUBLIC_URL } from './mcp.js';
import { gatewayFromEnv, StandInGateway } from './paypal.js';
import { cancelPayment } from './agent.js';
import { Runtime, type Push } from './runtime.js';
import { storeFromEnv } from './store.js';
import { dayReel, daySummary, foodProjection } from './agent.js';
import { assistantTurn } from './assistant.js';
import { claudeModel, spentUsd } from './claude.js';
import { speak, voiceConfig } from './voice.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const mediaDir = process.env.PAWZOO_MEDIA_DIR ?? join(root, 'media');
const webDir = join(root, 'web', 'dist');
const cardHtml = join(root, 'server', 'dist-views', 'card.html');

const cameraSecret = process.env.CAMERA_WEBHOOK_SECRET ?? 'pawzoo-replay-signing-key';
if (!process.env.CAMERA_WEBHOOK_SECRET) console.warn('[camera] CAMERA_WEBHOOK_SECRET not set: only replay webhooks will verify.');

export const rt = new Runtime({ store: storeFromEnv(), mediaDir, cameraSecret, demoDate: process.env.PAWZOO_DEMO_DATE });

export const app = express();
app.disable('x-powered-by');

// The signature covers the raw bytes, so this route must see them before any JSON parsing.
app.post('/camera/webhook', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const result = await rt.handleCameraWebhook(req.body as Buffer, req.header('x-signature'));
  res.status(result.status).json(result.body);
});

app.use(express.json({ limit: '1mb' }));

export const paypal = gatewayFromEnv(PUBLIC_URL);
const mcp = toNodeHandler(createMcpHandler(() => createPawzooServer(rt, cardHtml, paypal)));
// DNS rebinding protection: browsers may only reach /mcp from allowed origins (localhost by default).
const allowedOrigins = process.env.PAWZOO_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
const checkOrigin = allowedOrigins?.length ? originValidation(allowedOrigins) : localhostOriginValidation();
app.all('/mcp', (req, res) => {
  if (!checkOrigin(req, res)) return;
  void mcp(req, res, req.body);
});

// PayPal sends the person back here after they approve (or cancel) the order on PayPal. Pawzoo only notes it:
// the capture happens when the assistant calls capture_paypal_order, which checks the order with PayPal again.
const closePage = (title: string, line: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:500 18px/1.5 system-ui,sans-serif;background:#f6f3ee;color:#2b2622;text-align:center;padding:24px}b{display:block;font-size:24px;margin-bottom:6px}</style>
<div><b>${title}</b>${line}</div><script>setTimeout(() => window.close(), 1200)</script>`;

app.get('/paypal/return', (req, res) => {
  const orderId = String(req.query.token ?? '');
  if (orderId) rt.push({ type: 'paypal', status: 'approved', orderId });
  res.setHeader('cache-control', 'no-store');
  res.send(closePage('Approved on PayPal', 'Pawzoo will finish the payment now. You can close this window.'));
});

app.get('/paypal/cancel', async (req, res) => {
  const orderId = String(req.query.token ?? '');
  if (orderId) {
    await rt.withState((s) => cancelPayment(s, orderId)).catch(() => undefined);
    rt.push({ type: 'paypal', status: 'cancelled', orderId });
  }
  res.setHeader('cache-control', 'no-store');
  res.send(closePage('Cancelled', 'Nothing was charged.'));
});

// Without PayPal credentials, an offline stand-in plays PayPal's approval page. It says so, and moves no money.
app.get('/paypal/stand-in', (req, res) => {
  const orderId = String(req.query.token ?? '');
  res.setHeader('cache-control', 'no-store');
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PayPal Stand-In</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:500 17px/1.5 system-ui,sans-serif;background:#eef1f6;color:#1c2333;padding:24px}form{background:#fff;border-radius:18px;padding:28px;max-width:360px;box-shadow:0 10px 30px rgba(0,0,0,.08)}button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:12px 22px;margin:14px 8px 0 0;cursor:pointer}.ok{background:#1c2333;color:#fff}</style>
<form method="post" action="/paypal/stand-in/approve"><b>Offline stand-in for PayPal</b><p>No PayPal credentials are set, so this page plays PayPal's approval step. No money moves.</p>
<input type="hidden" name="token" value="${orderId.replace(/[^A-Z0-9-]/gi, '')}"><button class="ok">Approve</button><a href="/paypal/cancel?token=${encodeURIComponent(orderId)}">Cancel</a></form>`);
});

app.post('/paypal/stand-in/approve', express.urlencoded({ extended: false }), (req, res) => {
  const orderId = String((req.body as { token?: string }).token ?? '');
  if (paypal instanceof StandInGateway) paypal.approve(orderId);
  res.redirect(`/paypal/return?token=${encodeURIComponent(orderId)}`);
});

// Live pushes (server-sent events) for the TV view and the simulator.
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const send = (p: Push) => res.write(`data: ${JSON.stringify(p)}\n\n`);
  rt.bus.on('push', send);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  rt.pushClock();
  req.on('close', () => {
    clearInterval(ping);
    rt.bus.off('push', send);
  });
});

app.get('/api/day', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : rt.today();
  const now = rt.now();
  res.json(await rt.read((s) => ({ pet: s.pet, household: s.household, summary: daySummary(s, date, now), reel: dayReel(s, date, now) })));
});

app.get('/api/reel', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : rt.today();
  const now = rt.now();
  res.json(await rt.read((s) => dayReel(s, date, now)));
});

app.get('/api/food', async (_req, res) => {
  res.json(await rt.read((s) => foodProjection(s, rt.now())));
});

app.get('/api/clock', (_req, res) => {
  res.json({ now: rt.now().toISOString(), demoDate: rt.demoDate, pinned: rt.clock.isPinned() });
});

app.get('/api/status', (_req, res) => {
  const voice = voiceConfig();
  res.json({
    store: rt.store.kind,
    storeError: rt.storeError,
    model: claudeModel(),
    spentUsd: spentUsd(),
    paypal: paypal.mode,
    cameras: process.env.CAMERA_WEBHOOK_SECRET ? 'live webhooks and replay' : 'replay',
    voice: voice.enabled ? { provider: 'elevenlabs', voiceId: voice.voiceId, modelId: voice.modelId } : null,
  });
});

// Spoken answers (ElevenLabs). The browser never sees the API key.
const voiceCache = join(process.env.PAWZOO_DATA_DIR ?? 'data', 'voice');
app.post('/api/voice', async (req, res) => {
  const text = (req.body as { text?: string }).text?.trim();
  if (!text) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  if (!voiceConfig().enabled) {
    res.status(503).json({ error: 'ELEVENLABS_API_KEY is not set' });
    return;
  }
  try {
    const audio = await speak(text, voiceCache);
    res.set({ 'content-type': 'audio/mpeg', 'cache-control': 'no-store' }).send(audio);
  } catch (err) {
    console.warn('[voice]', (err as Error).message);
    res.status(502).json({ error: (err as Error).message });
  }
});

// The assistant brain behind the simulator: turns an utterance into tool calls.
app.post('/api/assistant', async (req, res) => {
  const body = req.body as { utterance?: string; tools?: unknown; history?: unknown };
  if (!body.utterance) {
    res.status(400).json({ error: 'utterance required' });
    return;
  }
  res.json(await assistantTurn(body.utterance, body.tools, body.history));
});

// Demo controls for presenters and judges. They drive the replayed camera day, never real devices.
app.post('/api/demo/time', async (req, res) => {
  const time = (req.body as { time?: string }).time;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    res.status(400).json({ error: 'time must be HH:MM' });
    return;
  }
  await rt.setLocalTime(time);
  res.json({ ok: true, now: rt.now().toISOString() });
});

app.post('/api/demo/escape', async (_req, res) => {
  await rt.triggerEscape();
  res.json({ ok: true });
});

app.post('/api/demo/reset', async (_req, res) => {
  await rt.reset();
  await startClock();
  res.json({ ok: true });
});

app.post('/api/tv/cast', (req, res) => {
  const b = req.body as { target?: 'day_reel' | 'moment' | 'alert' | 'home'; eventId?: string };
  if (!b.target) {
    res.status(400).json({ error: 'target required' });
    return;
  }
  rt.push({ type: 'cast', target: b.target, eventId: b.eventId, date: rt.today() });
  res.json({ ok: true });
});

app.use('/media', express.static(mediaDir, { maxAge: '1h' }));
if (existsSync(webDir)) app.use(express.static(webDir));

/**
 * The demo opens at 7 PM, with the whole recorded day behind it, so it never starts on an empty day
 * (whatever the hour in Chicago). PAWZOO_LIVE_CLOCK=1 follows the real time instead.
 */
async function startClock(): Promise<void> {
  if (process.env.PAWZOO_LIVE_CLOCK === '1') {
    rt.clock.release();
    rt.pushClock();
    await rt.catchUp();
    return;
  }
  await rt.setLocalTime(process.env.PAWZOO_START_TIME ?? '19:00');
}

const port = Number(process.env.PORT ?? 8787);
// --lan (npm run start:tv) listens on the network so a TV or phone on the same Wi-Fi can open the TV view.
const lan = process.argv.includes('--lan');
const host = lan ? '0.0.0.0' : (process.env.HOST ?? '127.0.0.1');

/** This computer's Wi-Fi and Ethernet addresses, for the TV app's Connect screen. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => Boolean(a && a.family === 'IPv4' && !a.internal))
    .map((a) => a.address);
}

if (process.env.PAWZOO_NO_LISTEN !== '1') {
  const server = app.listen(port, host, async () => {
    try {
      await startClock();
    } catch (err) {
      console.error('[startup] Could not replay the demo day:', (err as Error).message);
    }
    console.log(`Pawzoo on http://${host}:${port}  (MCP: /mcp, store: ${rt.store.kind}, demo date ${rt.demoDate})`);
    console.log(`PayPal: ${paypal.mode === 'sandbox' ? 'sandbox, through the PayPal Agent Toolkit' : 'offline stand-in (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env)'}`);
    console.log(`Claude: ${claudeModel() ?? 'off (rules and template answers; set ANTHROPIC_API_KEY and PAWZOO_BUDGET_USD in .env)'}`);
    console.log(`Voice: ${voiceConfig().enabled ? `ElevenLabs (voice ${voiceConfig().voiceId})` : 'off (set ELEVENLABS_API_KEY in .env)'}`);
    if (host === '0.0.0.0') {
      const addresses = lanAddresses();
      console.log(
        addresses.length
          ? `TV view: open ${addresses.map((a) => `http://${a}:${String(port)}/tv.html`).join(' or ')}`
          : 'TV view: no network address found. Is this computer on Wi-Fi?',
      );
    }
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${port} is already in use, most likely by another Pawzoo server that is still running.`);
      console.error('Stop it (Ctrl+C in its window, or close that window) and run npm start again. Or start on another port: PORT=8788 npm start\n');
      process.exit(1);
    }
    throw err;
  });
}
