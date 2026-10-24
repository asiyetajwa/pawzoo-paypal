// Domain types shared by the agent, the Ring adapter, the MCP tools and the HTTP API.

export type CameraId = 'front-door' | 'living-room' | 'kitchen' | 'backyard';

export interface Camera {
  id: CameraId;
  name: string;
  kind: 'doorbell' | 'indoor' | 'outdoor';
}

/** What Pawzoo understood from a clip. In live mode this comes from vision tagging; in replay it ships with the sample event. */
export type MomentTag =
  | 'wake'
  | 'meal'
  | 'walker_arrive'
  | 'walk_start'
  | 'walk_end'
  | 'walker_leave'
  | 'couch'
  | 'nap'
  | 'window_watch'
  | 'zoomies'
  | 'family_home'
  | 'escape'
  | 'moment';

/** A Ring event as Pawzoo stores it: the Ring webhook fields we use plus our own tags. */
export interface PetEvent {
  id: string;
  /** ISO timestamp, UTC. */
  at: string;
  cameraId: CameraId;
  /** Ring webhook type. */
  ringType: 'motion_detected' | 'button_press';
  /** Ring motion classification: who or what moved. */
  subjects: Array<'human' | 'animal' | 'vehicle'>;
  tag: MomentTag;
  /** One line a person would say about the clip. */
  caption: string;
  /** Path under /media, for example clips/0806-walk-start.mp4. */
  clip: string;
  snapshot: string;
  /** Seconds of the clip worth showing in the day reel. */
  highlightSeconds: number;
  source: 'ring-live' | 'replay';
}

export interface Pet {
  id: string;
  name: string;
  species: 'dog';
  breed: string;
  birthday: string;
  photo: string;
}

export interface Household {
  id: string;
  name: string;
  city: string;
  timeZone: string;
  members: string[];
}

export interface FoodPlan {
  productId: string;
  bagCups: number;
  bagOpenedOn: string; // YYYY-MM-DD
  dailyCups: number;
  /** The current rate applies from this date; cups eaten before it are in cupsUsedBefore. */
  rateSince: string;
  cupsUsedBefore: number;
  /** Where dailyCups came from, so the agent can say why the projection changed. */
  dailyCupsSource: string;
}

export interface Product {
  id: string;
  name: string;
  sizeLabel: string;
  cups: number;
  priceUsd: number;
  deliveryDays: number;
}

export interface WalkBooking {
  walker: string;
  company: string;
  weekdays: number[]; // 1 = Monday
  startTime: string; // HH:MM local
  minutes: number;
  priceUsd: number;
}

export interface Walk {
  id: string;
  date: string;
  startAt: string;
  endAt: string;
  minutes: number;
  walker: string;
  bookedMinutes: number;
  verified: boolean;
  evidence: string[]; // event ids
  paid?: { at: string; amountUsd: number; tipUsd: number };
}

export interface CareSlot {
  id: string;
  service: 'grooming' | 'vet_checkup' | 'extra_walk';
  provider: string;
  startAt: string;
  minutes: number;
  priceUsd: number;
}

export interface Booking {
  id: string;
  slot: CareSlot;
  bookedAt: string;
}

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  totalUsd: number;
  placedAt: string;
  arrivesOn: string;
}

export interface Alert {
  id: string;
  kind: 'escape';
  at: string;
  eventId: string;
  message: string;
  resolvedAt?: string;
}

export interface Fact {
  id: string;
  at: string;
  text: string;
}

export interface Feeding {
  at: string;
  cups: number;
  source: 'voice' | 'camera';
}

/** Everything Pawzoo remembers. One document per household. */
export interface State {
  version: 1;
  /** The demo day this state was seeded for; a state saved on another day is re-seeded. */
  seededFor?: string;
  household: Household;
  pet: Pet;
  cameras: Camera[];
  events: PetEvent[];
  food: FoodPlan;
  feedings: Feeding[];
  walkBooking: WalkBooking;
  walks: Walk[];
  orders: Order[];
  bookings: Booking[];
  alerts: Alert[];
  facts: Fact[];
  /** Quotes awaiting the person's confirmation. Nothing is bought or paid without one. */
  pending: PendingAction[];
}

export type PendingAction =
  | { id: string; kind: 'order'; productId: string; quantity: number; totalUsd: number; createdAt: string }
  | { id: string; kind: 'walk_payment'; walkId: string; amountUsd: number; tipUsd: number; createdAt: string }
  | { id: string; kind: 'booking'; slotId: string; createdAt: string };
