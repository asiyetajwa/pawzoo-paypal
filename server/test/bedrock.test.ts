// Bedrock path against a local stand-in for the Converse API (HTTP/2, as the SDK speaks) that,
// like some models, rejects temperature.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Http2Server } from 'node:http2';
import type { AddressInfo } from 'node:net';

const seen: Array<Record<string, any>> = [];
let fake: Http2Server;

before(async () => {
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = JSON.parse(body) as Record<string, any>;
      seen.push({ path: req.url, ...json });
      if (json.inferenceConfig?.temperature !== undefined) {
        res.writeHead(400, { 'content-type': 'application/json', 'x-amzn-errortype': 'ValidationException' });
        res.end(JSON.stringify({ message: 'temperature is not supported for this model' }));
        return;
      }
      const tools = json.toolConfig?.tools as Array<{ toolSpec: { name: string } }> | undefined;
      const content = tools?.length
        ? [{ toolUse: { toolUseId: 't1', name: 'get_pet_day', input: {} } }]
        : [{ reasoningContent: { reasoningText: { text: 'thinking' } } }, { text: 'Biscuit had a lovely day.' }];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } }));
    });
  });
  fake.listen(0, '127.0.0.1');
  await new Promise((r) => fake.once('listening', r));
  process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.BEDROCK_MODEL_ID = 'test.reasoning-model-v1:0';
  delete process.env.PAWZOO_BEDROCK;
});

after(() => fake.close());

test('digest retries without temperature and ignores reasoning blocks', async () => {
  const { writeDigest } = await import('../src/digest.js');
  const { daySummary } = await import('../src/agent.js');
  const { initialState } = await import('../src/seed.js');
  const state = initialState('2026-10-22');
  const out = await writeDigest(daySummary(state, '2026-10-22', new Date('2026-10-23T00:00:00Z')));
  assert.equal(out.source, 'bedrock');
  assert.equal(out.modelId, 'test.reasoning-model-v1:0');
  assert.equal(out.text, 'Biscuit had a lovely day.');
  assert.equal(seen.length, 2, 'one rejected call, one retry');
  assert.equal(seen[1].inferenceConfig.temperature, undefined);
  assert.match(String(seen[1].path), /test\.reasoning-model-v1(:|%3A)0\/converse/);
});

test('assistant picks tools through Bedrock', async () => {
  const { assistantTurn } = await import('../src/assistant.js');
  const plan = await assistantTurn(
    "How was Biscuit's day?",
    [{ name: 'get_pet_day', description: 'day', inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {} } }],
    [],
  );
  assert.equal(plan.source, 'bedrock');
  assert.equal(plan.modelId, 'test.reasoning-model-v1:0');
  assert.equal(seen[2].toolConfig.tools[0].toolSpec.inputSchema.json.$schema, undefined, 'the $schema keyword is stripped');
  assert.deepEqual(plan.calls.map((c) => c.name), ['get_pet_day']);
  assert.equal(seen.length, 3, 'the model is remembered: no second rejected call');
});
