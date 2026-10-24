// The demo household and the replayed day. All people, pets, products and businesses are fictional.

import type { CareSlot, MomentTag, PetEvent, Product, State, Walk, CameraId } from './types.js';
import { addDays, zonedToUtc } from './time.js';

export const TIME_ZONE = 'America/Chicago';

export const PRODUCTS: Product[] = [
  {
    id: 'hh-salmon-24',
    name: 'Hearth & Hound Salmon & Rice',
    sizeLabel: '24 lb bag',
    cups: 96,
    priceUsd: 58.99,
    deliveryDays: 2,
  },
  {
    id: 'hh-salmon-12',
    name: 'Hearth & Hound Salmon & Rice',
    sizeLabel: '12 lb bag',
    cups: 48,
    priceUsd: 34.99,
    deliveryDays: 2,
  },
];

export interface ScenarioEvent {
  time: string; // HH:MM local
  cameraId: CameraId;
  ringType: PetEvent['ringType'];
  subjects: PetEvent['subjects'];
  tag: MomentTag;
  caption: string;
  clip: string;
  highlightSeconds: number;
}

/** Biscuit's Thursday, as the cameras see it. The escape is a separate script the presenter triggers. */
export const DAY_SCRIPT: ScenarioEvent[] = [
  { time: '07:12', cameraId: 'living-room', ringType: 'motion_detected', subjects: ['animal'], tag: 'wake', caption: 'Biscuit wakes up and stretches', clip: 'wake', highlightSeconds: 4 },
  { time: '07:31', cameraId: 'kitchen', ringType: 'motion_detected', subjects: ['animal', 'human'], tag: 'meal', caption: 'Breakfast, gone in a minute', clip: 'meal', highlightSeconds: 4 },
  { time: '08:04', cameraId: 'front-door', ringType: 'button_press', subjects: ['human'], tag: 'walker_arrive', caption: 'Dana from Leash & Lead rings the bell', clip: 'walker-arrive', highlightSeconds: 3 },
  { time: '08:06', cameraId: 'front-door', ringType: 'motion_detected', subjects: ['human', 'animal'], tag: 'walk_start', caption: 'Off on the morning walk', clip: 'walk-start', highlightSeconds: 5 },
  { time: '08:41', cameraId: 'front-door', ringType: 'motion_detected', subjects: ['human', 'animal'], tag: 'walk_end', caption: 'Back from the walk, tail going', clip: 'walk-end', highlightSeconds: 5 },
  { time: '08:43', cameraId: 'front-door', ringType: 'motion_detected', subjects: ['human'], tag: 'walker_leave', caption: 'Dana heads out', clip: 'walker-leave', highlightSeconds: 2 },
  { time: '11:20', cameraId: 'living-room', ringType: 'motion_detected', subjects: ['animal'], tag: 'couch', caption: 'Claims the couch. Again.', clip: 'couch', highlightSeconds: 4 },
  { time: '13:05', cameraId: 'living-room', ringType: 'motion_detected', subjects: ['animal'], tag: 'nap', caption: 'A long afternoon nap in the sun', clip: 'nap', highlightSeconds: 4 },
  { time: '15:32', cameraId: 'living-room', ringType: 'motion_detected', subjects: ['animal'], tag: 'window_watch', caption: 'On patrol: the delivery truck is here', clip: 'window-watch', highlightSeconds: 4 },
  { time: '16:10', cameraId: 'backyard', ringType: 'motion_detected', subjects: ['animal'], tag: 'zoomies', caption: 'Backyard zoomies', clip: 'zoomies', highlightSeconds: 6 },
  { time: '18:24', cameraId: 'front-door', ringType: 'motion_detected', subjects: ['human', 'animal'], tag: 'family_home', caption: 'Maya is home. Best moment of the day.', clip: 'family-home', highlightSeconds: 6 },
];

export const ESCAPE_SCRIPT: ScenarioEvent = {
  time: '14:20',
  cameraId: 'front-door',
  ringType: 'motion_detected',
  subjects: ['animal'],
  tag: 'escape',
  caption: 'Biscuit is outside the front door on her own',
  clip: 'escape',
  highlightSeconds: 5,
};

/** Past walks give the agent a week of history to reason over. Tuesday was cut short. */
const PAST_WALKS: Array<{ daysAgo: number; start: string; minutes: number }> = [
  { daysAgo: 1, start: '08:03', minutes: 33 },
  { daysAgo: 2, start: '08:07', minutes: 18 },
  { daysAgo: 3, start: '08:02', minutes: 34 },
  { daysAgo: 6, start: '08:05', minutes: 31 },
  { daysAgo: 7, start: '08:04', minutes: 35 },
];

export function eventFromScript(s: ScenarioEvent, date: string, timeZone: string): PetEvent {
  const at = zonedToUtc(date, s.time, timeZone).toISOString();
  return {
    id: `evt-${date}-${s.time.replace(':', '')}-${s.cameraId}`,
    at,
    cameraId: s.cameraId,
    ringType: s.ringType,
    subjects: s.subjects,
    tag: s.tag,
    caption: s.caption,
    clip: `clips/${s.clip}.mp4`,
    snapshot: `snapshots/${s.clip}.jpg`,
    highlightSeconds: s.highlightSeconds,
    source: 'replay',
  };
}

/** Open slots this coming week, on the weekdays their ids name, whatever day the demo runs. */
export function careSlots(date: string, timeZone: string): CareSlot[] {
  const [y, m, d] = date.split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // Days until the next given weekday (0 = Sunday), always at least tomorrow.
  const next = (weekday: number) => ((weekday - today + 7) % 7) || 7;
  const slot = (id: string, service: CareSlot['service'], provider: string, weekday: number, time: string, minutes: number, priceUsd: number): CareSlot => ({
    id,
    service,
    provider,
    startAt: zonedToUtc(addDays(date, next(weekday)), time, timeZone).toISOString(),
    minutes,
    priceUsd,
  });
  return [
    slot('groom-sat-0930', 'grooming', 'Sudsy Paws Grooming', 6, '09:30', 90, 65),
    slot('groom-sat-1300', 'grooming', 'Sudsy Paws Grooming', 6, '13:00', 90, 65),
    slot('groom-tue-1000', 'grooming', 'Sudsy Paws Grooming', 2, '10:00', 90, 65),
    slot('vet-mon-0900', 'vet_checkup', 'Riverside Animal Clinic', 1, '09:00', 30, 70),
    slot('vet-wed-1530', 'vet_checkup', 'Riverside Animal Clinic', 3, '15:30', 30, 70),
    slot('walk-fri-1700', 'extra_walk', 'Leash & Lead', 5, '17:00', 30, 22),
    slot('walk-sat-1700', 'extra_walk', 'Leash & Lead', 6, '17:00', 30, 22),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function initialState(date: string, timeZone = TIME_ZONE): State {
  const walks: Walk[] = PAST_WALKS.map((w) => {
    const day = addDays(date, -w.daysAgo);
    const start = zonedToUtc(day, w.start, timeZone);
    const end = new Date(start.getTime() + w.minutes * 60_000);
    return {
      id: `walk-${day}`,
      date: day,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      minutes: w.minutes,
      walker: 'Dana',
      bookedMinutes: 30,
      verified: true,
      evidence: [],
      paid: { at: end.toISOString(), amountUsd: 22, tipUsd: w.minutes >= 30 ? 3 : 0 },
    };
  });

  return {
    version: 1,
    seededFor: date,
    household: {
      id: 'hh-rivera',
      name: 'The Rivera family',
      city: 'Austin, Texas',
      timeZone,
      members: ['Sam', 'Jo', 'Maya'],
    },
    pet: {
      id: 'pet-biscuit',
      name: 'Biscuit',
      species: 'dog',
      breed: 'Corgi mix',
      birthday: '2022-04-09',
      photo: 'snapshots/biscuit.jpg',
    },
    cameras: [
      { id: 'front-door', name: 'Front Door', kind: 'doorbell' },
      { id: 'living-room', name: 'Living Room', kind: 'indoor' },
      { id: 'kitchen', name: 'Kitchen', kind: 'indoor' },
      { id: 'backyard', name: 'Backyard', kind: 'outdoor' },
    ],
    events: [],
    food: {
      productId: 'hh-salmon-24',
      bagCups: 96,
      bagOpenedOn: addDays(date, -27),
      dailyCups: 3,
      rateSince: addDays(date, -27),
      cupsUsedBefore: 0,
      dailyCupsSource: 'the feeding guide on the bag',
    },
    feedings: [],
    walkBooking: {
      walker: 'Dana',
      company: 'Leash & Lead',
      weekdays: [1, 2, 3, 4, 5],
      startTime: '08:00',
      minutes: 30,
      priceUsd: 22,
    },
    walks,
    orders: [],
    bookings: [],
    alerts: [],
    facts: [
      { id: 'fact-1', at: zonedToUtc(addDays(date, -20), '19:00', timeZone).toISOString(), text: 'Biscuit gets anxious at the groomer; Saturday mornings are calmer.' },
    ],
    pending: [],
  };
}
