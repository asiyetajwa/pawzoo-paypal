// Claude path against a local stand-in for the Messages API: tool choice, thinking blocks ignored, and the spend guard.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const seen: Array<Record<string, any>> = [];
let fake: Server;

before(async () => {
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = JSON.parse(body) as Record<string, any>;
      seen.push({ path: req.url, ...json });
      const content = json.tools?.length
        ? [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 't1', name: 'get_pet_day', input: {} }]
        : [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Biscuit had a lovely day.' }];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: json.model, content, stop_reason: json.tools?.length ? 'tool_use' : 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 } }));
    });
  });
  fake.listen(0, '127.0.0.1');
  await new Promise((r) => fake.once('listening', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.PAWZOO_BUDGET_USD = '0.01';
  process.env.PAWZOO_LEDGER = join(mkdtempSync(join(tmpdir(), 'pawzoo-')), 'ledger.jsonl');
  delete process.env.PAWZOO_CLAUDE;
  delete process.env.PAWZOO_MODEL;
});

after(() => fake.close());

test('digest is phrased by Claude Haiku at low effort, ignoring thinking blocks', async () => {
  const { writeDigest } = await import('../src/digest.js');
  const { daySummary } = await import('../src/agent.js');
  const { initialState } = await import('../src/seed.js');
  const state = initialState('2026-10-22');
  const out = await writeDigest(daySummary(state, '2026-10-22', new Date('2026-10-23T00:00:00Z')));
  assert.equal(out.source, 'claude');
  assert.equal(out.modelId, 'claude-haiku-5-5');
  assert.equal(out.text, 'Biscuit had a lovely day.');
  assert.equal(seen[0]?.output_config?.effort, 'low');
  assert.equal(seen[0]?.temperature, undefined);
});

test('assistant picks tools through Claude, with the $schema keyword stripped', async () => {
  const { assistantTurn } = await import('../src/assistant.js');
  const plan = await assistantTurn(
    "How was Biscuit's day?",
    [{ name: 'get_pet_day', description: 'day', inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {} } }],
    [],
  );
  assert.equal(plan.source, 'claude');
  assert.equal(seen[1]?.tools[0].input_schema.$schema, undefined);
  assert.deepEqual(plan.calls.map((c) => c.name), ['get_pet_day']);
});

test('the spend guard records each call and refuses past the cap', async () => {
  const { ask, spentUsd, BudgetError } = await import('../src/claude.js');
  assert.ok(Math.abs(spentUsd() - 2 * (1000 * 0.1 + 100 * 0.5) / 1e6) < 1e-9, 'two calls in the ledger');
  await assert.rejects(ask({ max_tokens: 100_000, messages: [{ role: 'user', content: 'hi' }] }, 'too big'), BudgetError);
  assert.equal(seen.length, 2, 'the refused call was never sent');
});
