// The Pawzoo agent: turns Ring events into a pet's day, and turns the day into things worth doing.
// Every function here is deterministic. Language models only phrase the results (see digest.ts).

import { randomUUID } from 'node:crypto';
import type { Alert, Booking, CareSlot, MomentTag, Order, PendingAction, PetEvent, Product, State, Walk } from './types.js';
import { PRODUCTS, careSlots } from './seed.js';
import { addDays, clockLabel, daysBetween, localParts, weekdayName } from './time.js';

export type AgentNotice =
  | { type: 'event'; event: PetEvent }
  | { type: 'walk'; walk: Walk }
  | { type: 'alert'; alert: Alert };

// ---------- Ingest ----------

/** Adds a Ring event and derives walks, meals and alerts from it. Returns what changed, for live pushes. */
export function ingestEvent(state: State, event: PetEvent): AgentNotice[] {
  if (state.events.some((e) => e.id === event.id)) return [];
  state.events.push(event);
  state.events.sort((a, b) => a.at.localeCompare(b.at));
  const notices: AgentNotice[] = [{ type: 'event', event }];
  const tz = state.household.timeZone;
  const date = localParts(event.at, tz).date;

  if (event.tag === 'meal') {
    state.feedings.push({ at: event.at, cups: state.food.dailyCups / 2, source: 'camera' });
  }

  if (event.tag === 'walk_end') {
    const start = [...state.events]
      .reverse()
      .find((e) => e.tag === 'walk_start' && e.at < event.at && localParts(e.at, tz).date === date);
    if (start) {
      const minutes = Math.round((Date.parse(event.at) - Date.parse(start.at)) / 60_000);
      const walk: Walk = {
        id: `walk-${date}`,
        date,
        startAt: start.at,
        endAt: event.at,
        minutes,
        walker: state.walkBooking.walker,
        bookedMinutes: state.walkBooking.minutes,
        verified: true,
        evidence: [start.id, event.id],
      };
      state.walks = state.walks.filter((w) => w.id !== walk.id);
      state.walks.push(walk);
      state.walks.sort((a, b) => a.date.localeCompare(b.date));
      notices.push({ type: 'walk', walk });
    }
  }

  if (event.tag === 'escape') {
    const alert: Alert = {
      id: `alert-${event.id}`,
      kind: 'escape',
      at: event.at,
      eventId: event.id,
      message: `${state.pet.name} went out the ${cameraName(state, event.cameraId)} alone at ${clockLabel(event.at, tz)}. No person was with her.`,
    };
    state.alerts.push(alert);
    notices.push({ type: 'alert', alert });
  }

  return notices;
}

export function cameraName(state: State, id: string): string {
  return state.cameras.find((c) => c.id === id)?.name ?? id;
}

// ---------- The day ----------

export interface Moment {
  eventId: string;
  time: string;
  camera: string;
  tag: MomentTag;
  caption: string;
  clip: string;
  snapshot: string;
  seconds: number;
}

export function eventsOn(state: State, date: string, until?: Date): PetEvent[] {
  const tz = state.household.timeZone;
  return state.events.filter(
    (e) => localParts(e.at, tz).date === date && (!until || Date.parse(e.at) <= until.getTime()),
  );
}

export function toMoment(state: State, e: PetEvent): Moment {
  return {
    eventId: e.id,
    time: clockLabel(e.at, state.household.timeZone),
    camera: cameraName(state, e.cameraId),
    tag: e.tag,
    caption: e.caption,
    clip: e.clip,
    snapshot: e.snapshot,
    seconds: e.highlightSeconds,
  };
}

export interface DaySummary {
  pet: string;
  date: string;
  dayName: string;
  moments: Moment[];
  walk: WalkReport | null;
  meals: number;
  napMoments: number;
  playMoments: number;
  openAlerts: Alert[];
  food: FoodProjection;
  highlights: string[];
}

export function daySummary(state: State, date: string, now: Date): DaySummary {
  const events = eventsOn(state, date, now);
  const moments = events.map((e) => toMoment(state, e));
  const walk = walkReport(state, date);
  const highlights: string[] = [];
  if (walk) highlights.push(walk.headline);
  const family = events.find((e) => e.tag === 'family_home');
  if (family) highlights.push(`${family.caption.replace(/\.$/, '')} (${clockLabel(family.at, state.household.timeZone)})`);
  const play = events.filter((e) => e.tag === 'zoomies').length;
  if (play) highlights.push('Backyard zoomies in the afternoon');
  return {
    pet: state.pet.name,
    date,
    dayName: weekdayName(date),
    moments,
    walk,
    meals: events.filter((e) => e.tag === 'meal').length,
    napMoments: events.filter((e) => e.tag === 'nap' || e.tag === 'couch').length,
    playMoments: play,
    openAlerts: state.alerts.filter((a) => !a.resolvedAt),
    food: foodProjection(state, now),
    highlights,
  };
}

export interface Reel {
  title: string;
  date: string;
  totalSeconds: number;
  chapters: Array<Moment & { startsAt: number }>;
}

/** The 7 PM recap: every moment worth seeing, in order, trimmed to its highlight. */
export function dayReel(state: State, date: string, now: Date): Reel {
  const moments = eventsOn(state, date, now)
    .filter((e) => e.tag !== 'walker_leave')
    .map((e) => toMoment(state, e));
  let t = 0;
  const chapters = moments.map((m) => {
    const c = { ...m, startsAt: t };
    t += m.seconds;
    return c;
  });
  return { title: `${state.pet.name}'s Day`, date, totalSeconds: t, chapters };
}

const QUERY_TAGS: Array<{ words: RegExp; tags: MomentTag[] }> = [
  { words: /walk|walker|dana|leash/i, tags: ['walker_arrive', 'walk_start', 'walk_end'] },
  { words: /breakfast|eat|food|meal|bowl/i, tags: ['meal'] },
  { words: /couch|sofa/i, tags: ['couch'] },
  { words: /nap|sleep|rest/i, tags: ['nap', 'couch'] },
  { words: /zoom|play|yard|run/i, tags: ['zoomies'] },
  { words: /home|maya|family|greet|door/i, tags: ['family_home'] },
  { words: /window|truck|delivery|bark|patrol/i, tags: ['window_watch'] },
  { words: /wake|morning|up/i, tags: ['wake'] },
  { words: /escape|out|alone|lost|got out/i, tags: ['escape'] },
];

export function findMoments(state: State, query: string, date: string, now: Date): Moment[] {
  const wanted = new Set<MomentTag>();
  for (const q of QUERY_TAGS) if (q.words.test(query)) q.tags.forEach((t) => wanted.add(t));
  const events = eventsOn(state, date, now);
  const hits = wanted.size
    ? events.filter((e) => wanted.has(e.tag))
    : events.filter((e) => e.caption.toLowerCase().includes(query.toLowerCase()));
  return hits.map((e) => toMoment(state, e));
}

// ---------- Walks ----------

export interface WalkReport {
  walk: Walk;
  headline: string;
  week: { walks: number; averageMinutes: number; short: Array<{ date: string; day: string; minutes: number }> };
  amountDueUsd: number;
  suggestedTipUsd: number;
}

export function walkReport(state: State, date: string): WalkReport | null {
  const walk = state.walks.find((w) => w.date === date);
  if (!walk) return null;
  const tz = state.household.timeZone;
  const weekStart = addDays(date, -6);
  const week = state.walks.filter((w) => w.date >= weekStart && w.date <= date);
  const average = Math.round(week.reduce((s, w) => s + w.minutes, 0) / week.length);
  const short = week
    .filter((w) => w.minutes < w.bookedMinutes * 0.8)
    .map((w) => ({ date: w.date, day: weekdayName(w.date), minutes: w.minutes }));
  const full = walk.minutes >= walk.bookedMinutes;
  return {
    walk,
    headline: `${walk.minutes}-minute walk with ${walk.walker}, ${clockLabel(walk.startAt, tz)} to ${clockLabel(walk.endAt, tz)}${full ? '' : ` (booked for ${walk.bookedMinutes})`}`,
    week: { walks: week.length, averageMinutes: average, short },
    amountDueUsd: state.walkBooking.priceUsd,
    suggestedTipUsd: full ? 3 : 0,
  };
}

// ---------- Food ----------

export interface FoodProjection {
  product: Product;
  cupsLeft: number;
  daysLeft: number;
  runsOutOn: string;
  runsOutDay: string;
  orderBy: string;
  orderByDay: string;
  dailyCups: number;
  dailyCupsSource: string;
  status: 'ok' | 'order_soon' | 'order_now' | 'covered';
  incoming: Order | null;
}

export function product(id: string): Product {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown product ${id}`);
  return p;
}

/** Cups eaten from the open bag by the start of `today`, at whichever rate applied each day. */
function cupsUsed(state: State, today: string): number {
  const f = state.food;
  return f.cupsUsedBefore + Math.max(0, daysBetween(f.rateSince, today)) * f.dailyCups;
}

export function foodProjection(state: State, now: Date): FoodProjection {
  const tz = state.household.timeZone;
  const today = localParts(now, tz).date;
  const p = product(state.food.productId);
  const cupsLeft = Math.max(0, state.food.bagCups - cupsUsed(state, today));
  const daysLeft = Math.floor(cupsLeft / state.food.dailyCups);
  const runsOutOn = addDays(today, daysLeft);
  const orderBy = addDays(runsOutOn, -(p.deliveryDays + 1));
  const incoming = state.orders.find((o) => o.arrivesOn >= today && o.arrivesOn <= runsOutOn) ?? null;
  let status: FoodProjection['status'] = 'ok';
  if (incoming) status = 'covered';
  else if (orderBy <= today) status = 'order_now';
  else if (daysBetween(today, orderBy) <= 2) status = 'order_soon';
  return {
    product: p,
    cupsLeft,
    daysLeft,
    runsOutOn,
    runsOutDay: weekdayName(runsOutOn),
    orderBy: orderBy < today ? today : orderBy,
    orderByDay: weekdayName(orderBy < today ? today : orderBy),
    dailyCups: state.food.dailyCups,
    dailyCupsSource: state.food.dailyCupsSource,
    status,
    incoming,
  };
}

// ---------- Memory ----------

/** Stores a fact the family tells Pawzoo. Feeding amounts also update the food projection. */
export function remember(state: State, text: string, now: Date): { fact: string; updatedDailyCups?: number } {
  state.facts.push({ id: `fact-${randomUUID().slice(0, 8)}`, at: now.toISOString(), text });
  const cups = /(\d+(?:\.\d+)?|one|two|three|four)(?:\s+and\s+a\s+half)?\s+cups?/i.exec(text);
  if (cups && /day|daily|a day|per day/i.test(text)) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
    let n = words[cups[1].toLowerCase()] ?? Number(cups[1]);
    if (/and\s+a\s+half/i.test(cups[0])) n += 0.5;
    if (n > 0 && n < 20) {
      const today = localParts(now, state.household.timeZone).date;
      state.food.cupsUsedBefore = cupsUsed(state, today);
      state.food.rateSince = today;
      state.food.dailyCups = n;
      state.food.dailyCupsSource = `what you told me on ${weekdayName(localParts(now, state.household.timeZone).date)}`;
      return { fact: text, updatedDailyCups: n };
    }
  }
  return { fact: text };
}

// ---------- Actions that need a yes ----------

function pendingId(): string {
  return `confirm-${randomUUID().slice(0, 8)}`;
}

export function quoteOrder(state: State, productId: string, quantity: number, now: Date): PendingAction & { kind: 'order' } {
  const p = product(productId);
  const action = { id: pendingId(), kind: 'order' as const, productId, quantity, totalUsd: round2(p.priceUsd * quantity), createdAt: now.toISOString() };
  state.pending.push(action);
  return action;
}

export function quoteWalkPayment(state: State, walkId: string, tipUsd: number, now: Date): PendingAction & { kind: 'walk_payment' } {
  const walk = state.walks.find((w) => w.id === walkId);
  if (!walk) throw new Error("I don't see a walk to pay for yet today.");
  if (walk.paid) throw new Error(`The ${weekdayName(walk.date)} walk is already paid.`);
  const action = { id: pendingId(), kind: 'walk_payment' as const, walkId, amountUsd: state.walkBooking.priceUsd, tipUsd, createdAt: now.toISOString() };
  state.pending.push(action);
  return action;
}

export function quoteBooking(state: State, slotId: string, now: Date): PendingAction & { kind: 'booking' } {
  const slot = availableSlots(state, now).find((s) => s.id === slotId);
  if (!slot) throw new Error('That slot is no longer open. Ask again for open slots.');
  const action = { id: pendingId(), kind: 'booking' as const, slotId, createdAt: now.toISOString() };
  state.pending.push(action);
  return action;
}

export type Confirmed =
  | { kind: 'order'; order: Order; product: Product }
  | { kind: 'walk_payment'; walk: Walk }
  | { kind: 'booking'; booking: Booking };

/** Carries out a quoted action. Only a confirmation id the person saw can do this. */
export function confirm(state: State, confirmationId: string, now: Date): Confirmed {
  const action = state.pending.find((p) => p.id === confirmationId);
  if (!action) throw new Error('That confirmation has expired or was already used. Ask again for a fresh quote.');
  state.pending = state.pending.filter((p) => p.id !== confirmationId);
  const tz = state.household.timeZone;
  const today = localParts(now, tz).date;
  switch (action.kind) {
    case 'order': {
      const p = product(action.productId);
      const order: Order = {
        id: `order-${randomUUID().slice(0, 8)}`,
        productId: p.id,
        quantity: action.quantity,
        totalUsd: action.totalUsd,
        placedAt: now.toISOString(),
        arrivesOn: addDays(today, p.deliveryDays),
      };
      state.orders.push(order);
      return { kind: 'order', order, product: p };
    }
    case 'walk_payment': {
      const walk = state.walks.find((w) => w.id === action.walkId);
      if (!walk) throw new Error('That walk no longer exists.');
      if (walk.paid) throw new Error(`The ${weekdayName(walk.date)} walk is already paid.`);
      walk.paid = { at: now.toISOString(), amountUsd: action.amountUsd, tipUsd: action.tipUsd };
      return { kind: 'walk_payment', walk };
    }
    case 'booking': {
      const slot = careSlots(today, tz).find((s) => s.id === action.slotId);
      if (!slot || state.bookings.some((b) => b.slot.id === slot.id)) throw new Error('That slot was just taken. Ask again for open slots.');
      const booking: Booking = { id: `booking-${randomUUID().slice(0, 8)}`, slot, bookedAt: now.toISOString() };
      state.bookings.push(booking);
      return { kind: 'booking', booking };
    }
  }
}

export function availableSlots(state: State, now: Date, service?: CareSlot['service']): CareSlot[] {
  const tz = state.household.timeZone;
  const today = localParts(now, tz).date;
  const taken = new Set(state.bookings.map((b) => b.slot.id));
  return careSlots(today, tz).filter(
    (s) => !taken.has(s.id) && (!service || s.service === service) && Date.parse(s.startAt) > now.getTime(),
  );
}

export function resolveAlert(state: State, alertId: string, now: Date): Alert {
  const alert = state.alerts.find((a) => a.id === alertId);
  if (!alert) throw new Error(`No alert ${alertId}`);
  alert.resolvedAt = now.toISOString();
  return alert;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
