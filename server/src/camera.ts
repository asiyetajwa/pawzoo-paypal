// Home camera adapter: signed webhooks in, Pawzoo moments out.
//
// Any camera bridge (a home hub automation, a camera vendor's webhook relay) posts Pawzoo's small camera webhook:
// which camera, motion or a doorbell press, who or what moved, and optional clip and snapshot paths. We verify its
// HMAC and tag the moment. Replay mode signs the recorded demo day with the same key and pushes it through exactly
// the same verify-and-parse path, so Pawzoo runs end to end without any cameras.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CameraId, MomentTag, PetEvent } from './types.js';

export type Subject = 'human' | 'animal' | 'vehicle';

export interface CameraWebhook {
  /** Unique per delivery; replay uses it to find the recorded moment. */
  request_id: string;
  camera: string;
  trigger: 'motion' | 'doorbell';
  /** Epoch milliseconds. */
  timestamp: number;
  subjects: Subject[];
  clip?: string;
  snapshot?: string;
}

/** The body is signed with HMAC-SHA256 and sent as `X-Signature: sha256=<hex>`. */
export function verifyCameraSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const given = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signCameraBody(rawBody: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/** Which camera is which room. Set CAMERA_MAP='{"<camera name>":"front-door",...}' for real cameras. */
export function cameraMap(): Record<string, CameraId> {
  const fromEnv = process.env.CAMERA_MAP;
  if (fromEnv) return JSON.parse(fromEnv) as Record<string, CameraId>;
  return { 'front-door': 'front-door', 'living-room': 'living-room', kitchen: 'kitchen', backyard: 'backyard' };
}

/** Turns motion classes into a Pawzoo moment when no richer tag is available. */
export function tagFromSubjects(cameraId: CameraId, trigger: PetEvent['trigger'], subjects: Subject[]): MomentTag {
  const animal = subjects.includes('animal');
  const human = subjects.includes('human');
  if (cameraId === 'front-door') {
    if (trigger === 'doorbell') return 'walker_arrive';
    if (animal && !human) return 'escape';
    if (animal && human) return 'walk_start';
  }
  if (cameraId === 'backyard' && animal) return 'zoomies';
  return 'moment';
}

const CAPTIONS: Record<MomentTag, string> = {
  wake: 'Up and about',
  meal: 'Mealtime',
  walker_arrive: 'Someone at the front door',
  walk_start: 'Heading out with a person',
  walk_end: 'Back home',
  walker_leave: 'Visitor leaving',
  couch: 'On the couch',
  nap: 'Napping',
  window_watch: 'Watching the window',
  zoomies: 'Running around the yard',
  family_home: 'Family is home',
  escape: 'Outside the front door alone',
  moment: 'Moving around',
};

/** Live path: a verified webhook from a real camera becomes a Pawzoo event. */
export function eventFromLiveWebhook(hook: CameraWebhook): PetEvent | null {
  const cameraId = cameraMap()[hook.camera];
  if (!cameraId) return null;
  const subjects = hook.subjects ?? [];
  if (hook.trigger === 'motion' && !subjects.includes('animal') && !subjects.includes('human')) return null;
  const tag = tagFromSubjects(cameraId, hook.trigger, subjects);
  return {
    id: `cam-${hook.request_id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    at: new Date(hook.timestamp).toISOString(),
    cameraId,
    trigger: hook.trigger,
    subjects,
    tag,
    caption: CAPTIONS[tag],
    clip: hook.clip ?? '',
    snapshot: hook.snapshot ?? '',
    highlightSeconds: 5,
    source: 'camera-live',
  };
}

/** Builds the webhook a camera bridge would have sent for a recorded moment. Used by replay mode. */
export function webhookFor(event: PetEvent): CameraWebhook {
  return {
    request_id: `replay-${event.id}`,
    camera: event.cameraId,
    trigger: event.trigger,
    timestamp: Date.parse(event.at),
    subjects: event.subjects,
    clip: event.clip,
    snapshot: event.snapshot,
  };
}
