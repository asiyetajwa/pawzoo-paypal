// "How was Biscuit's day?" The facts come from agent.ts; Claude only phrases them.
// With no API key, or if the call fails or the budget is spent, the template answer is used and the demo still works.

import { ask, claudeModel, LOW_EFFORT, replyText } from './claude.js';
import type { DaySummary } from './agent.js';

export interface DigestResult {
  text: string;
  source: 'claude' | 'template';
  modelId?: string;
}

export function templateDigest(d: DaySummary): string {
  if (d.moments.length === 0) return `Nothing from ${d.pet} yet today. The cameras haven't seen her move.`;
  const parts: string[] = [];
  if (d.walk) {
    const w = d.walk;
    parts.push(
      `${d.pet} had a ${w.walk.minutes}-minute walk with ${w.walk.walker} this morning${w.walk.minutes >= w.walk.bookedMinutes ? ', the full booking' : `, short of the ${w.walk.bookedMinutes} you booked`}.`,
    );
    if (w.week.short.length) {
      const s = w.week.short[0];
      parts.push(`It's been a good week apart from ${s.day}, when the walk lasted ${s.minutes} minutes.`);
    }
  }
  const rest: string[] = [];
  if (d.napMoments) rest.push('napped through the afternoon');
  if (d.playMoments) rest.push('did backyard zoomies');
  if (rest.length) parts.push(`She ${rest.join(' and ')}.`);
  if (d.openAlerts.length) parts.push(`Heads up: ${d.openAlerts[0].message}`);
  const f = d.food;
  if (f.status === 'order_now' || f.status === 'order_soon') {
    parts.push(`Her food runs out ${f.runsOutDay}. Want me to reorder?`);
  } else if (f.status === 'covered' && f.incoming) {
    parts.push(`More food arrives before she runs out.`);
  }
  return parts.join(' ');
}

const SYSTEM = `You write the evening update a family hears from their smart speaker about their dog's day.
Use only the facts in the JSON. Never invent events, times or numbers.
Two to four short sentences, warm and plain, for speaking aloud. No lists, no emoji, no em dashes.
Mention the walk and anything unusual. If food status is order_now or order_soon, end by offering to reorder.
Never give medical or veterinary advice.`;

export async function writeDigest(d: DaySummary): Promise<DigestResult> {
  const fallback: DigestResult = { text: templateDigest(d), source: 'template' };
  const modelId = claudeModel();
  if (!modelId) return fallback;
  try {
    const facts = {
      pet: d.pet,
      day: d.dayName,
      moments: d.moments.map((m) => ({ time: m.time, camera: m.camera, what: m.caption })),
      walk: d.walk && {
        minutes: d.walk.walk.minutes,
        booked: d.walk.walk.bookedMinutes,
        walker: d.walk.walk.walker,
        weekAverage: d.walk.week.averageMinutes,
        shortWalksThisWeek: d.walk.week.short,
      },
      food: { status: d.food.status, runsOut: d.food.runsOutDay, daysLeft: d.food.daysLeft },
      openAlerts: d.openAlerts.map((a) => a.message),
    };
    const out = await ask(
      { max_tokens: 1200, ...LOW_EFFORT, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(facts) }] },
      'digest',
    );
    const text = replyText(out);
    if (!text) return fallback;
    return { text: text.replace(/—/g, ', '), source: 'claude', modelId };
  } catch (err) {
    console.warn('[digest] Claude unavailable, using template:', (err as Error).message);
    return fallback;
  }
}
