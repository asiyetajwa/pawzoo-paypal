// One place for Claude calls (Anthropic Messages API), shared by the digest and the simulator's assistant.
// Claude Haiku 5.5 at low effort: the agent's jobs here are short (pick a tool, write two sentences).
// Every call passes a spend guard first: it reserves the call's worst case at Anthropic's published prices,
// records the real cost from the returned usage in a ledger, and refuses anything past PAWZOO_BUDGET_USD.

import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_MODEL = 'claude-haiku-5-5';
/** USD per million tokens (Anthropic first-party prices for prompts up to 100K tokens). */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
};

let client: Anthropic | null = null;

export function claudeModel(): string | null {
  if (process.env.PAWZOO_CLAUDE === 'off' || !process.env.ANTHROPIC_API_KEY?.trim()) return null;
  return process.env.PAWZOO_MODEL?.trim() || DEFAULT_MODEL;
}

export class BudgetError extends Error {}

const ledgerPath = () => process.env.PAWZOO_LEDGER ?? join(process.cwd(), '.pawzoo-ledger.jsonl');

/** Dollars spent so far, from the ledger. */
export function spentUsd(): number {
  const path = ledgerPath();
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .reduce((sum, line) => sum + (JSON.parse(line) as { usd: number }).usd, 0);
}

let reserved = 0;

function priceOf(model: string): { in: number; out: number } {
  const p = PRICES[model];
  if (!p) throw new BudgetError(`No price known for ${model}; add it to PRICES before using it.`);
  return p;
}

export type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>;

/** A guarded Messages API call. Throws BudgetError before sending if the call could pass the cap. */
export async function ask(params: CreateParams, step: string): Promise<Anthropic.Message> {
  const model = claudeModel();
  if (!model) throw new Error('ANTHROPIC_API_KEY is not set');
  const cap = Number(process.env.PAWZOO_BUDGET_USD ?? 0);
  if (!(cap > 0)) throw new BudgetError('PAWZOO_BUDGET_USD is not set: no model calls without a spending cap.');
  const price = priceOf(model);
  // Worst case: every character a token, plus the full output allowance.
  const inEstimate = JSON.stringify([params.system, params.messages, params.tools]).length;
  const worst = (inEstimate * price.in + params.max_tokens * price.out) / 1_000_000;
  if (spentUsd() + reserved + worst > cap) throw new BudgetError(`Budget cap $${cap.toFixed(2)} reached: refused ${step}.`);
  reserved += worst;
  try {
    client ??= new Anthropic({ timeout: Number(process.env.PAWZOO_TIMEOUT_MS ?? 30_000), maxRetries: 2 });
    const out = await client.messages.create({ ...params, model });
    const u = out.usage;
    const inTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
    const usd = (inTokens * price.in + u.output_tokens * price.out) / 1_000_000;
    appendFileSync(ledgerPath(), `${JSON.stringify({ at: new Date().toISOString(), step, model, in: u.input_tokens, out: u.output_tokens, usd })}\n`);
    return out;
  } finally {
    reserved -= worst;
  }
}

/** The text of a reply, ignoring thinking blocks. */
export function replyText(out: Anthropic.Message): string {
  return out.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('')
    .trim();
}

/** Low effort keeps short jobs cheap; Haiku 5.5 runs adaptive thinking by default. */
export const LOW_EFFORT = { output_config: { effort: 'low' as const } };
