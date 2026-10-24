// The Pawzoo MCP server: what Alexa+ calls. Every tool returns a line to speak plus a card to show.
// Cards are MCP Apps views (ui://pawzoo/card.html); buttons on a card call tools back through the host.

import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import {
  availableSlots,
  confirm,
  daySummary,
  dayReel,
  findMoments,
  foodProjection,
  quoteBooking,
  quoteOrder,
  quoteWalkPayment,
  remember,
  resolveAlert,
  walkReport,
  product,
} from './agent.js';
import { writeDigest } from './digest.js';
import type { Runtime } from './runtime.js';
import { clockLabel, localParts, weekdayName } from './time.js';

/** A caption as the end of a sentence: one closing full stop, never two. */
const sentence = (caption: string) => `${caption.replace(/[.!?]+$/, '')}.`;

export const CARD_URI = 'ui://pawzoo/card.html';
/** Where cards load snapshots from. The card view runs sandboxed, so it needs an absolute origin. */
export const PUBLIC_URL = (process.env.PAWZOO_PUBLIC_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`).replace(/\/$/, '');
const CARD_META = { ui: { resourceUri: CARD_URI } };

type Card = Record<string, unknown> & { card: string };

function reply(say: string, card: Card) {
  return {
    content: [{ type: 'text' as const, text: say }],
    structuredContent: { say, mediaBase: PUBLIC_URL, ...card },
  };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe('Local date YYYY-MM-DD. Defaults to today.');

export function createPawzooServer(rt: Runtime, cardHtmlPath: string): McpServer {
  const server = new McpServer(
    { name: 'pawzoo', title: 'Pawzoo', version: '1.0.0' },
    {
      instructions:
        "Pawzoo knows what the family's dog did today from their Ring cameras, and can reorder food, pay the dog walker and book care. " +
        'Speak the `say` field. Anything that spends money or books time returns a quote first: read it out and call confirm_action only after the person clearly says yes. ' +
        'Pawzoo gives no medical or veterinary advice.',
    },
  );

  const cardMeta = { ui: { csp: { resourceDomains: [PUBLIC_URL, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'] }, prefersBorder: false } };
  registerAppResource(server, 'Pawzoo card', CARD_URI, { description: 'Cards for Pawzoo answers', _meta: cardMeta }, async () => ({
    contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: await readFile(cardHtmlPath, 'utf8'), _meta: cardMeta }],
  }));

  registerAppTool(
    server,
    'get_pet_day',
    {
      title: "How was the dog's day",
      description: "Summarises the dog's day so far from the Ring cameras: walk, meals, naps, play, alerts, and food left. Use for 'How was Biscuit's day?'",
      inputSchema: z.object({ date: dateArg }),
      annotations: { readOnlyHint: true },
      _meta: CARD_META,
    },
    async ({ date }) => {
      const now = rt.now();
      const day = date ?? rt.today();
      const summary = await rt.read((s) => daySummary(s, day, now));
      const digest = await writeDigest(summary);
      return reply(digest.text, { card: 'day', summary, digestSource: digest.source, digestModel: digest.modelId ?? null });
    },
  );

  registerAppTool(
    server,
    'find_moment',
    {
      title: 'Find a moment',
      description: "Finds moments on camera, like 'when the walker came', 'the zoomies' or 'when Maya got home'.",
      inputSchema: z.object({ query: z.string().min(2), date: dateArg }),
      annotations: { readOnlyHint: true },
      _meta: CARD_META,
    },
    async ({ query, date }) => {
      const now = rt.now();
      const moments = await rt.read((s) => findMoments(s, query, date ?? rt.today(), now));
      if (!moments.length) return reply(`I didn't see that on camera today.`, { card: 'moments', query, moments });
      const first = moments[0];
      const say =
        moments.length === 1
          ? `At ${first.time} on the ${first.camera} camera: ${sentence(first.caption)}`
          : `I found ${moments.length} moments. The first was at ${first.time}: ${sentence(first.caption)}`;
      return reply(say, { card: 'moments', query, moments });
    },
  );

  server.registerTool(
    'play_on_tv',
    {
      title: 'Show on the TV',
      description: "Plays the dog's day reel, or one moment, on the family's Fire TV.",
      inputSchema: z.object({
        target: z.enum(['day_reel', 'moment']),
        event_id: z.string().optional().describe('Moment to play when target is moment (from find_moment).'),
      }),
    },
    async ({ target, event_id }) => {
      if (target === 'moment' && !event_id) return fail("I couldn't find that moment on camera today, so there's nothing to play.");
      const reel = await rt.read((s) => dayReel(s, rt.today(), rt.now()));
      if (target === 'day_reel' && !reel.chapters.length) return fail("Nothing's on camera yet today, so there's no reel to play.");
      rt.push({ type: 'cast', target, eventId: event_id, date: rt.today() });
      const say = target === 'day_reel' ? `Playing ${reel.title} on the TV. It's ${reel.totalSeconds} seconds.` : 'Playing it on the TV.';
      return { content: [{ type: 'text' as const, text: say }], structuredContent: { say, target, event_id: event_id ?? null } };
    },
  );

  registerAppTool(
    server,
    'check_food',
    {
      title: 'Food check',
      description: 'How much dog food is left, when it runs out, and whether to order now.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
      _meta: CARD_META,
    },
    async () => {
      const f = await rt.read((s) => foodProjection(s, rt.now()));
      let say: string;
      if (f.status === 'covered' && f.incoming) say = `You're covered. A new bag arrives ${weekdayName(f.incoming.arrivesOn)}, before she runs out ${f.runsOutDay}.`;
      else if (f.status === 'ok') say = `About ${f.daysLeft} days of food left, enough until ${f.runsOutDay}.`;
      else say = `About ${f.cupsLeft} cups left at ${f.dailyCups} a day, so she runs out ${f.runsOutDay}. To get it in time, order by ${f.orderByDay}. Want me to reorder the ${f.product.sizeLabel}?`;
      return reply(say, { card: 'food', food: f });
    },
  );

  registerAppTool(
    server,
    'quote_food_order',
    {
      title: 'Quote a food order',
      description: 'Prepares a dog food order and returns the price and delivery date for the person to approve. Buys nothing.',
      inputSchema: z.object({
        product_id: z.string().optional().describe('Defaults to the food she eats now.'),
        quantity: z.number().int().min(1).max(4).default(1),
      }),
      _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] } },
    },
    async ({ product_id, quantity }) => {
      const now = rt.now();
      const { action, food } = await rt.withState((s) => ({
        action: quoteOrder(s, product_id ?? s.food.productId, quantity, now),
        food: foodProjection(s, now),
      }));
      const p = product(action.productId);
      const say = `${quantity > 1 ? `${quantity} bags of ` : ''}${p.name}, ${p.sizeLabel}, is $${action.totalUsd.toFixed(2)} and arrives in ${p.deliveryDays} days, before she runs out ${food.runsOutDay}. Shall I place the order?`;
      return reply(say, { card: 'confirm', action, product: p });
    },
  );

  registerAppTool(
    server,
    'get_walk_report',
    {
      title: 'Walk report',
      description: "Checks the dog walker's visit against what the Ring front door camera saw: start, end, minutes versus booked, and the week so far.",
      inputSchema: z.object({ date: dateArg }),
      annotations: { readOnlyHint: true },
      _meta: CARD_META,
    },
    async ({ date }) => {
      const day = date ?? rt.today();
      const report = await rt.read((s) => walkReport(s, day));
      if (!report) return reply(`No walk on camera ${day === rt.today() ? 'yet today' : `on ${weekdayName(day)}`}.`, { card: 'walk', report: null });
      const tz = 'America/Chicago';
      const w = report.walk;
      let say = `The front door camera saw ${w.walker} leave with her at ${clockLabel(w.startAt, tz)} and bring her back at ${clockLabel(w.endAt, tz)}: ${w.minutes} minutes of the ${w.bookedMinutes} booked.`;
      if (report.week.short.length) {
        const s = report.week.short[0];
        say += ` This week's only short one was ${s.day}, at ${s.minutes} minutes.`;
      }
      if (!w.paid) say += ` The walk is $${report.amountDueUsd}. Want to pay${report.suggestedTipUsd ? ` with a $${report.suggestedTipUsd} tip` : ''}?`;
      return reply(say, { card: 'walk', report });
    },
  );

  registerAppTool(
    server,
    'quote_walk_payment',
    {
      title: 'Quote the walk payment',
      description: "Prepares payment for a verified walk, with an optional tip, for the person to approve. Pays nothing.",
      inputSchema: z.object({
        walk_id: z.string().optional().describe("Defaults to today's walk."),
        tip_usd: z.number().min(0).max(50).default(0),
      }),
      _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] } },
    },
    async ({ walk_id, tip_usd }) => {
      try {
        const now = rt.now();
        const action = await rt.withState((s) => quoteWalkPayment(s, walk_id ?? `walk-${rt.today()}`, tip_usd, now));
        const total = action.amountUsd + action.tipUsd;
        return reply(`That's $${total.toFixed(2)} to Leash & Lead${action.tipUsd ? `, including a $${action.tipUsd} tip` : ''}. Shall I pay it?`, { card: 'confirm', action });
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  registerAppTool(
    server,
    'find_care_slots',
    {
      title: 'Find grooming, vet or walk slots',
      description: 'Lists open slots for grooming, a routine vet check-up or an extra walk. Uses what the family told Pawzoo, like preferring Saturday mornings at the groomer.',
      inputSchema: z.object({ service: z.enum(['grooming', 'vet_checkup', 'extra_walk']) }),
      annotations: { readOnlyHint: true },
      _meta: CARD_META,
    },
    async ({ service }) => {
      const now = rt.now();
      const { slots, facts } = await rt.read((s) => ({ slots: availableSlots(s, now, service), facts: s.facts.map((f) => f.text) }));
      const tz = 'America/Chicago';
      // What the family said ("Saturday mornings are calmer") moves those slots to the top; the rest stay in date order.
      const preferSaturdayMorning = service === 'grooming' && facts.some((f) => /saturday mornings? (are|is) calmer/i.test(f));
      const isSaturdayMorning = (at: string) => weekdayName(localParts(at, tz).date) === 'Saturday' && localParts(at, tz).time < '12:00';
      const ordered = preferSaturdayMorning ? [...slots].sort((a, b) => Number(isSaturdayMorning(b.startAt)) - Number(isSaturdayMorning(a.startAt))) : slots;
      if (!ordered.length) return reply('No open slots this week.', { card: 'slots', service, slots: [] });
      const first = ordered[0];
      const when = `${weekdayName(localParts(first.startAt, tz).date)} at ${clockLabel(first.startAt, tz)}`;
      const because = preferSaturdayMorning && isSaturdayMorning(first.startAt) ? ', since you said Saturday mornings are calmer for her' : '';
      const say = `${first.provider} has ${when}${because}. $${first.priceUsd}. Want it?`;
      return reply(say, { card: 'slots', service, slots: ordered, recommended: first.id });
    },
  );

  registerAppTool(
    server,
    'quote_booking',
    {
      title: 'Quote a booking',
      description: 'Holds a care slot for the person to approve. Books nothing.',
      inputSchema: z.object({ slot_id: z.string() }),
      _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] } },
    },
    async ({ slot_id }) => {
      try {
        const now = rt.now();
        const { action, slot } = await rt.withState((s) => {
          const a = quoteBooking(s, slot_id, now);
          return { action: a, slot: availableSlots(s, now).find((x) => x.id === slot_id) };
        });
        const tz = 'America/Chicago';
        const say = `${slot?.provider}, ${weekdayName(localParts(slot!.startAt, tz).date)} at ${clockLabel(slot!.startAt, tz)}, $${slot?.priceUsd}. Shall I book it?`;
        return reply(say, { card: 'confirm', action, slot });
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  registerAppTool(
    server,
    'confirm_action',
    {
      title: 'Confirm',
      description:
        'Carries out a quoted order, payment or booking. Call ONLY after the person explicitly says yes to that exact quote, passing its confirmation_id.',
      inputSchema: z.object({ confirmation_id: z.string() }),
      annotations: { destructiveHint: false, idempotentHint: false },
      _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] } },
    },
    async ({ confirmation_id }) => {
      try {
        const now = rt.now();
        const done = await rt.withState((s) => confirm(s, confirmation_id, now));
        rt.push({ type: 'state', reason: done.kind });
        const tz = 'America/Chicago';
        let say: string;
        switch (done.kind) {
          case 'order':
            say = `Ordered. ${done.product.name} arrives ${weekdayName(done.order.arrivesOn)}.`;
            break;
          case 'walk_payment':
            say = `Paid. ${done.walk.walker} gets $${(done.walk.paid!.amountUsd + done.walk.paid!.tipUsd).toFixed(2)}.`;
            break;
          case 'booking':
            say = `Booked: ${done.booking.slot.provider}, ${weekdayName(localParts(done.booking.slot.startAt, tz).date)} at ${clockLabel(done.booking.slot.startAt, tz)}.`;
            break;
        }
        return reply(say, { card: 'done', done });
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  registerAppTool(
    server,
    'remember',
    {
      title: 'Remember',
      description: "Remembers something about the dog for later, like 'she's on two and a half cups a day now' or 'Saturday mornings are calmer at the groomer'. Feeding amounts update the food forecast.",
      inputSchema: z.object({ fact: z.string().min(3) }),
      _meta: CARD_META,
    },
    async ({ fact }) => {
      const now = rt.now();
      const { result, food } = await rt.withState((s) => {
        const r = remember(s, fact, now);
        return { result: r, food: r.updatedDailyCups ? foodProjection(s, now) : null };
      });
      if (food) {
        return reply(`Got it, ${result.updatedDailyCups} cups a day. At that rate her food lasts until ${food.runsOutDay}.`, { card: 'food', food, remembered: fact });
      }
      return reply("Got it, I'll remember that.", { card: 'done', remembered: fact });
    },
  );

  server.registerTool(
    'get_alerts',
    {
      title: 'Alerts',
      description: 'Open alerts, such as the dog leaving the house alone.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const alerts = await rt.read((s) => s.alerts.filter((a) => !a.resolvedAt));
      const say = alerts.length ? alerts.map((a) => a.message).join(' ') : 'No alerts. All quiet at home.';
      return { content: [{ type: 'text' as const, text: say }], structuredContent: { say, alerts } };
    },
  );

  server.registerTool(
    'resolve_alert',
    {
      title: 'Resolve an alert',
      description: "Marks an alert handled, for example once the dog is back inside.",
      inputSchema: z.object({ alert_id: z.string() }),
    },
    async ({ alert_id }) => {
      try {
        const alert = await rt.withState((s) => resolveAlert(s, alert_id, rt.now()));
        rt.push({ type: 'state', reason: 'alert_resolved' });
        rt.push({ type: 'cast', target: 'home' });
        const say = 'Marked as handled. Glad she is back.';
        return { content: [{ type: 'text' as const, text: say }], structuredContent: { say, alert } };
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  return server;
}
