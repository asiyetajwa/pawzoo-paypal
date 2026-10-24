// End to end: a real MCP client over Streamable HTTP against the real server, driving the replayed Ring day.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.PAWZOO_NO_LISTEN = '1';
process.env.PAWZOO_DEMO_DATE = '2026-10-22';
process.env.PAWZOO_STATE_FILE = join(mkdtempSync(join(tmpdir(), 'pawzoo-')), 'state.json');
process.env.PAWZOO_BEDROCK = 'off';
process.env.PAWZOO_ENV_FILE = join(tmpdir(), 'pawzoo-no-env');
delete process.env.ELEVENLABS_API_KEY;

const { app, rt } = await import('../src/index.js');
const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
const { signRingBody } = await import('../src/ring.js');

let server: Server;
let base: string;
let client: InstanceType<typeof Client>;

type ToolOut = { say: string; [k: string]: any };

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolOut> {
  const res = await client.callTool({ name, arguments: args });
  assert.ok(!res.isError, `${name} failed: ${JSON.stringify(res.content)}`);
  return res.structuredContent as ToolOut;
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client = new Client({ name: 'pawzoo-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  server.close();
});

test('negotiates MCP 2025-11-25 over Streamable HTTP', () => {
  assert.equal(client.getNegotiatedProtocolVersion(), '2025-11-25');
  assert.equal(client.getServerVersion()?.name, 'pawzoo');
});

test('lists the tools and the MCP Apps card', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['get_pet_day', 'find_moment', 'play_on_tv', 'check_food', 'quote_food_order', 'get_walk_report', 'confirm_action', 'remember']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
  const day = tools.find((t) => t.name === 'get_pet_day')!;
  assert.equal((day._meta as any)?.ui?.resourceUri, 'ui://pawzoo/card.html');
  const card = await client.readResource({ uri: 'ui://pawzoo/card.html' });
  const content = card.contents[0] as { mimeType?: string; text?: string };
  assert.equal(content.mimeType, 'text/html;profile=mcp-app');
  assert.match(content.text ?? '', /<div id="root">/);
});

test('morning: the walk is verified from front door events', async () => {
  await rt.setLocalTime('09:00');
  const walk = await call('get_walk_report');
  assert.equal(walk.report.walk.minutes, 35);
  assert.equal(walk.report.walk.verified, true);
  assert.deepEqual(
    walk.report.week.short.map((s: any) => s.minutes),
    [18],
  );
  assert.match(walk.say, /8:06 AM.*8:41 AM.*35 minutes of the 30 booked/);
});

test('paying the walker needs a confirmation id', async () => {
  const quote = await call('quote_walk_payment', { tip_usd: 3 });
  assert.equal(quote.card, 'confirm');
  const bogus = await client.callTool({ name: 'confirm_action', arguments: { confirmation_id: 'confirm-nope' } });
  assert.equal(bogus.isError, true);
  const done = await call('confirm_action', { confirmation_id: quote.action.id });
  assert.match(done.say, /Paid\. Dana gets \$25\.00/);
  const again = await client.callTool({ name: 'confirm_action', arguments: { confirmation_id: quote.action.id } });
  assert.equal(again.isError, true, 'a confirmation can only be used once');
});

test('evening: the day, the reel and finding a moment', async () => {
  await rt.setLocalTime('19:00');
  const day = await call('get_pet_day');
  assert.equal(day.card, 'day');
  assert.equal(day.digestSource, 'template');
  assert.match(day.say, /35-minute walk with Dana/);
  assert.match(day.say, /Tuesday/);
  const moments = await call('find_moment', { query: 'when Maya got home' });
  assert.equal(moments.moments[0].tag, 'family_home');
  const reel = await (await fetch(`${base}/api/reel`)).json();
  assert.equal(reel.chapters.length, 10);
  assert.equal(reel.chapters[0].startsAt, 0);
});

test('food: projection, memory and a confirmed order', async () => {
  const before = await call('check_food');
  assert.equal(before.food.daysLeft, 5);
  assert.equal(before.food.status, 'order_soon');
  const remembered = await call('remember', { fact: "She's on two and a half cups a day now" });
  assert.equal(remembered.food.dailyCups, 2.5);
  assert.equal(remembered.food.daysLeft, 6);
  const quote = await call('quote_food_order', { quantity: 1 });
  const done = await call('confirm_action', { confirmation_id: quote.action.id });
  assert.equal(done.done.kind, 'order');
  const after = await call('check_food');
  assert.equal(after.food.status, 'covered');
});

test('grooming slots honour what the family said', async () => {
  const slots = await call('find_care_slots', { service: 'grooming' });
  assert.equal(slots.recommended, 'groom-sat-0930');
  assert.match(slots.say, /calmer/);
});

test('Ring webhooks must be signed', async () => {
  const body = JSON.stringify({ meta: {}, data: { id: 'x', type: 'motion_detected', attributes: { source: 'replay-front-door', timestamp: Date.now() } } });
  const res = await fetch(`${base}/ring/webhook`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-signature': 'sha256=00' } });
  assert.equal(res.status, 401);
  const signed = await fetch(`${base}/ring/webhook`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-signature': signRingBody(Buffer.from(body), 'pawzoo-replay-signing-key') },
  });
  assert.equal(signed.status, 202, 'a verified live webhook with no Ring credentials is accepted but ignored');
});

test('escape: an alert, a push to the TV, and resolving it', async () => {
  const pushes: any[] = [];
  const listener = (p: any) => pushes.push(p);
  rt.bus.on('push', listener);
  await rt.triggerEscape();
  rt.bus.off('push', listener);
  assert.ok(pushes.some((p) => p.type === 'alert'));
  assert.ok(pushes.some((p) => p.type === 'cast' && p.target === 'alert'));
  const alerts = await call('get_alerts');
  assert.match(alerts.say, /went out the Front Door alone at 2:20 PM/);
  await call('resolve_alert', { alert_id: alerts.alerts[0].id });
  const clear = await call('get_alerts');
  assert.match(clear.say, /No alerts/);
});

test('voice is off without an ElevenLabs key, and says so', async () => {
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.voice, null);
  const res = await fetch(`${base}/api/voice`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'hello' }) });
  assert.equal(res.status, 503);
});

test('the simulator brain maps speech to tools without Bedrock', async () => {
  const res = await fetch(`${base}/api/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ utterance: 'Show me when the walker came on the TV', tools: [] }),
  });
  const plan = await res.json();
  assert.equal(plan.source, 'rules');
  assert.deepEqual(plan.calls.map((c: any) => c.name), ['find_moment', 'play_on_tv']);
});
