// The browser side of MCP: connects to Pawzoo over Streamable HTTP and records every JSON-RPC exchange
// so the "Under the hood" panel can show initialize, tools/list and tools/call as they happen.

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export interface WireEntry {
  at: number;
  method: string;
  ms: number;
  status: number;
  request: unknown;
  response: unknown;
}

type Listener = (e: WireEntry) => void;

const listeners = new Set<Listener>();
export function onWire(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function loggingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const started = performance.now();
  let request: unknown = null;
  try {
    request = init?.body ? JSON.parse(String(init.body)) : null;
  } catch {
    request = init?.body ?? null;
  }
  const res = await fetch(input, init);
  const copy = res.clone();
  const method = Array.isArray(request)
    ? request.map((r: { method?: string }) => r.method ?? 'response').join(', ')
    : ((request as { method?: string } | null)?.method ?? (init?.method ?? 'GET'));
  void (async () => {
    let response: unknown = null;
    const type = copy.headers.get('content-type') ?? '';
    if (type.includes('application/json')) response = await copy.json().catch(() => null);
    else if (type.includes('text/event-stream')) {
      const text = await copy.text().catch(() => '');
      const data = text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .filter(Boolean);
      response = data.length === 1 ? JSON.parse(data[0]) : data.map((d) => JSON.parse(d));
    }
    const entry = { at: Date.now(), method, ms: Math.round(performance.now() - started), status: res.status, request, response };
    listeners.forEach((l) => l(entry));
  })();
  return res;
}

export async function connect(endpoint: URL): Promise<Client> {
  const client = new Client({ name: 'pawzoo-alexa-plus-simulator', version: '1.0.0' }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(endpoint, { fetch: loggingFetch }));
  return client;
}
