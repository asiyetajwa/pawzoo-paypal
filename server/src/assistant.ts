// Stand-in for the Alexa+ brain in the simulator: decides which Pawzoo tools an utterance needs.
// The browser then makes those calls itself over MCP, exactly as Alexa+ would.
// With Bedrock configured, a model picks the tools from the live tools/list. Without it, a small
// rule set does, so the simulator always works offline.

import type { Tool } from '@aws-sdk/client-bedrock-runtime';
import { bedrockModel, converse } from './bedrock.js';

export interface PlannedCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantPlan {
  calls: PlannedCall[];
  say?: string;
  source: 'bedrock' | 'rules';
  modelId?: string;
}

/** Values the browser fills in from earlier turns: the quote awaiting a yes, the last moments found, and so on. */
export const PLACEHOLDERS = ['$last_confirmation', '$first_moment', '$recommended_slot', '$open_alert', '$last_walk'] as const;

const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|do it|confirm|please do|go ahead|sounds good|book it|pay it|order it)\b/i;

function tipFrom(text: string): number {
  const m = /\$?(\d+(?:\.\d+)?)\s*(dollars?)?\s*tip|tip\s*(of\s*)?\$?(\d+(?:\.\d+)?)/i.exec(text);
  if (!m) return /tip/i.test(text) ? 3 : 0;
  return Number(m[1] ?? m[4]);
}

export function planWithRules(utterance: string): AssistantPlan {
  const u = utterance.trim();
  const plan = (calls: PlannedCall[], say?: string): AssistantPlan => ({ calls, say, source: 'rules' });
  const tv = /\b(tv|television|big screen)\b/i.test(u);

  if (YES.test(u)) return plan([{ name: 'confirm_action', arguments: { confirmation_id: '$last_confirmation' } }]);
  if (/\b(no|nope|cancel|never mind|not now)\b/i.test(u) && u.split(/\s+/).length <= 4) return plan([], "Okay, I won't.");
  if (/remember|she'?s on|now (eats|gets)|from now on|cups? a day|per day/i.test(u)) return plan([{ name: 'remember', arguments: { fact: u } }]);
  if (/(she'?s|biscuit'?s|he'?s) (back|inside|home safe)|found (her|him)|back inside/i.test(u))
    return plan([{ name: 'resolve_alert', arguments: { alert_id: '$open_alert' } }]);
  if (/alert|is (she|biscuit) (ok|okay|safe)|where is/i.test(u)) return plan([{ name: 'get_alerts', arguments: {} }]);

  if (/food|kibble|run(s|ning)? out|bag/i.test(u) || /\b(re)?order\b/i.test(u)) {
    if (/\b(re)?order|buy|get more|another bag/i.test(u)) return plan([{ name: 'quote_food_order', arguments: { quantity: 1 } }]);
    return plan([{ name: 'check_food', arguments: {} }]);
  }

  if (/groom|bath|haircut|nails/i.test(u)) {
    if (/\bbook\b/i.test(u) && /\b(that|it|the first one|recommended)\b/i.test(u)) return plan([{ name: 'quote_booking', arguments: { slot_id: '$recommended_slot' } }]);
    return plan([{ name: 'find_care_slots', arguments: { service: 'grooming' } }]);
  }
  if (/\bvet|check-?up/i.test(u)) return plan([{ name: 'find_care_slots', arguments: { service: 'vet_checkup' } }]);
  if (/extra walk|another walk|evening walk/i.test(u)) return plan([{ name: 'find_care_slots', arguments: { service: 'extra_walk' } }]);

  if (/\b(pay|tip)\b/i.test(u)) return plan([{ name: 'quote_walk_payment', arguments: { walk_id: '$last_walk', tip_usd: tipFrom(u) } }]);

  if (tv && /(day|recap|reel|highlights?)/i.test(u) && !/\bwhen\b/i.test(u)) return plan([{ name: 'play_on_tv', arguments: { target: 'day_reel' } }]);
  if (/\bwhen\b|show me|find|did (she|biscuit)/i.test(u)) {
    const query = u.replace(/^(alexa,?\s*)?(show me|find|play)\s*/i, '').replace(/\s*on the (tv|television)\s*$/i, '');
    const calls: PlannedCall[] = [{ name: 'find_moment', arguments: { query } }];
    if (tv) calls.push({ name: 'play_on_tv', arguments: { target: 'moment', event_id: '$first_moment' } });
    return plan(calls);
  }
  if (/walk|walker|dana/i.test(u)) return plan([{ name: 'get_walk_report', arguments: {} }]);
  if (/how('?s| is| was)|what did|update|today|day/i.test(u)) return plan([{ name: 'get_pet_day', arguments: {} }]);
  return plan([], "I can tell you about Biscuit's day, check her food, the walk, or book grooming.");
}

interface McpToolSummary {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const SYSTEM = `You are Alexa+, a home assistant, using the Pawzoo add-on for the family's dog, Biscuit.
Choose the Pawzoo tools that answer the person. Call tools; do not answer from your own knowledge.
Money or bookings: first call the quote_ tool; call confirm_action only when the person says yes, with confirmation_id "$last_confirmation".
To act on earlier results use these placeholders exactly: "$first_moment" (an event_id), "$recommended_slot" (a slot_id), "$open_alert" (an alert_id), "$last_walk" (a walk_id).
Use at most two tools. Never give medical or veterinary advice.`;

/** MCP tool schemas carry a "$schema" keyword some Bedrock models reject; the rest passes through. */
export function toolSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = schema ?? { type: 'object', properties: {} };
  return rest;
}

export async function planWithBedrock(utterance: string, tools: McpToolSummary[], history: unknown): Promise<AssistantPlan | null> {
  if (!bedrockModel() || !tools.length) return null;
  try {
    const toolConfig = {
      tools: tools.map(
        (t): Tool => ({
          toolSpec: {
            name: t.name,
            description: (t.description ?? t.name).slice(0, 600),
            inputSchema: { json: toolSchema(t.inputSchema) as never },
          },
        }),
      ),
    };
    const recent = Array.isArray(history) ? (history as Array<{ role: string; text: string }>).slice(-6) : [];
    const context = recent.map((h) => `${h.role}: ${h.text}`).join('\n');
    const out = await converse(
      {
        system: [{ text: SYSTEM }],
        messages: [{ role: 'user', content: [{ text: `${context ? `Conversation so far:\n${context}\n\n` : ''}Person: ${utterance}` }] }],
        toolConfig,
      },
      { maxTokens: 1500, temperature: 0 },
    );
    const content = out.output?.message?.content ?? [];
    const calls = content
      .filter((c) => c.toolUse)
      .map((c) => ({ name: c.toolUse!.name!, arguments: (c.toolUse!.input ?? {}) as Record<string, unknown> }))
      .slice(0, 2);
    const say = content.map((c) => c.text ?? '').join('').trim() || undefined;
    return { calls, say: calls.length ? undefined : say, source: 'bedrock', modelId: bedrockModel() ?? undefined };
  } catch (err) {
    console.warn('[assistant] Bedrock unavailable, using rules:', (err as Error).message);
    return null;
  }
}

export async function assistantTurn(utterance: string, tools: unknown, history: unknown): Promise<AssistantPlan> {
  const list = Array.isArray(tools) ? (tools as McpToolSummary[]) : [];
  return (await planWithBedrock(utterance, list, history)) ?? planWithRules(utterance);
}
