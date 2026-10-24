// Ring (Amazon Vision API) adapter: signed webhooks in, clips and classifications out.
//
// Live mode: Ring posts a webhook, we verify its HMAC, ask the API what moved, download the clip,
// and tag the moment. Replay mode: recorded webhooks for the demo day are signed with the same key
// and pushed through exactly the same verify-and-parse path, so judges can run Pawzoo without a
// Ring account (allowed by the hackathon organisers on the Devpost forum).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CameraId, MomentTag, PetEvent } from './types.js';

export const RING_API = process.env.RING_API_BASE ?? 'https://api.amazonvision.com';

export interface RingWebhook {
  meta: { version: string; time: string; request_id: string; account_id: string };
  data: {
    id: string;
    type: 'motion_detected' | 'button_press' | string;
    attributes: {
      source: string;
      source_type: string;
      timestamp: number;
      timestamp_readable?: string;
      sub_type?: string;
      component_ids?: string[];
    };
    relationships?: unknown;
  };
}

/** Ring signs the raw body with HMAC-SHA256 and sends `X-Signature: sha256=<hex>`. */
export function verifyRingSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const given = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signRingBody(rawBody: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export type Subject = 'human' | 'animal' | 'vehicle';

/** Which Ring device is which room. Set RING_DEVICE_MAP='{"<device_id>":"front-door",...}' for a live account. */
export function deviceMap(): Record<string, CameraId> {
  const fromEnv = process.env.RING_DEVICE_MAP;
  if (fromEnv) return JSON.parse(fromEnv) as Record<string, CameraId>;
  return {
    'replay-front-door': 'front-door',
    'replay-living-room': 'living-room',
    'replay-kitchen': 'kitchen',
    'replay-backyard': 'backyard',
  };
}

export function cameraForDevice(deviceId: string): CameraId | null {
  return deviceMap()[deviceId] ?? null;
}

export function deviceForCamera(cameraId: CameraId): string {
  const entry = Object.entries(deviceMap()).find(([, c]) => c === cameraId);
  return entry ? entry[0] : `replay-${cameraId}`;
}

/** Turns Ring's motion classes into a Pawzoo moment when no richer tag is available. */
export function tagFromSubjects(cameraId: CameraId, ringType: string, subjects: Subject[]): MomentTag {
  const animal = subjects.includes('animal');
  const human = subjects.includes('human');
  if (cameraId === 'front-door') {
    if (ringType === 'button_press') return 'walker_arrive';
    if (animal && !human) return 'escape';
    if (animal && human) return 'walk_start';
  }
  if (cameraId === 'backyard' && animal) return 'zoomies';
  return 'moment';
}

export class RingClient {
  constructor(
    private readonly token: string,
    private readonly hardwareId = process.env.RING_HARDWARE_ID ?? 'pawzoo-server',
  ) {}

  static fromEnv(): RingClient | null {
    const token = process.env.RING_ACCESS_TOKEN;
    return token ? new RingClient(token) : null;
  }

  private headers(json = false): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Pawzoo/0.1 (+https://github.com)',
      Hardware_Id: this.hardwareId,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async devices(): Promise<unknown> {
    const res = await fetch(`${RING_API}/v1/devices`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Ring devices: HTTP ${res.status}`);
    return res.json();
  }

  /** What moved around this moment: Ring's history classifies motion as human, animal or vehicle. */
  async subjectsAt(deviceId: string, timestamp: number): Promise<Subject[]> {
    const types = 'motion.human,motion.animal,motion.vehicle';
    const res = await fetch(
      `${RING_API}/v1/history/devices/${encodeURIComponent(deviceId)}/events?event_types=${types}`,
      { headers: this.headers() },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<{ attributes: { event_type: string; start: number; end: number } }> };
    const near = (body.data ?? []).filter(
      (e) => Math.abs(e.attributes.start - timestamp) < 60_000 || (timestamp >= e.attributes.start && timestamp <= e.attributes.end),
    );
    const subjects = new Set<Subject>();
    for (const e of near) {
      const kind = e.attributes.event_type.split('.')[1];
      if (kind === 'human' || kind === 'animal' || kind === 'vehicle') subjects.add(kind);
    }
    return [...subjects];
  }

  /** Downloads the recorded clip around a moment to the media folder and returns its media path. */
  async downloadClip(deviceId: string, timestamp: number, mediaDir: string, name: string): Promise<string | null> {
    const res = await fetch(`${RING_API}/v1/devices/${encodeURIComponent(deviceId)}/media/video/download`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ timestamp, duration: 15_000 }),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const rel = `clips/live-${name}.mp4`;
    await mkdir(join(mediaDir, 'clips'), { recursive: true });
    await writeFile(join(mediaDir, rel), Buffer.from(await res.arrayBuffer()));
    return rel;
  }

  async downloadSnapshot(deviceId: string, timestamp: number, mediaDir: string, name: string): Promise<string | null> {
    const res = await fetch(`${RING_API}/v1/devices/${encodeURIComponent(deviceId)}/media/image/download`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ type: 'at_timestamp', timestamp }),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const rel = `snapshots/live-${name}.jpg`;
    await mkdir(join(mediaDir, 'snapshots'), { recursive: true });
    await writeFile(join(mediaDir, rel), Buffer.from(await res.arrayBuffer()));
    return rel;
  }
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

/** Live path: a verified Ring webhook becomes a Pawzoo event. */
export async function eventFromLiveWebhook(hook: RingWebhook, client: RingClient | null, mediaDir: string): Promise<PetEvent | null> {
  const deviceId = hook.data.attributes.source;
  const cameraId = cameraForDevice(deviceId);
  if (!cameraId) return null;
  const ts = hook.data.attributes.timestamp;
  const ringType = hook.data.type === 'button_press' ? 'button_press' : 'motion_detected';
  const subjects = client ? await client.subjectsAt(deviceId, ts) : [];
  if (ringType === 'motion_detected' && !subjects.includes('animal') && !subjects.includes('human')) return null;
  const tag = tagFromSubjects(cameraId, ringType, subjects);
  const name = hook.data.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const clip = client ? await client.downloadClip(deviceId, ts, mediaDir, name) : null;
  const snapshot = client ? await client.downloadSnapshot(deviceId, ts, mediaDir, name) : null;
  return {
    id: `ring-${name}`,
    at: new Date(ts).toISOString(),
    cameraId,
    ringType,
    subjects,
    tag,
    caption: CAPTIONS[tag],
    clip: clip ?? '',
    snapshot: snapshot ?? '',
    highlightSeconds: 5,
    source: 'ring-live',
  };
}

/** Builds the webhook Ring would have sent for a recorded moment. Used by replay mode. */
export function webhookFor(event: PetEvent, accountId = 'ava1.ring.account.replay'): RingWebhook {
  const deviceId = deviceForCamera(event.cameraId);
  const ts = Date.parse(event.at);
  return {
    meta: { version: '1.1', time: new Date(ts).toISOString(), request_id: `replay-${event.id}`, account_id: accountId },
    data: {
      id: `${deviceId}_${event.ringType === 'button_press' ? 'button_press' : 'motion'}_${ts}`,
      type: event.ringType,
      attributes: {
        source: deviceId,
        source_type: 'devices',
        timestamp: ts,
        timestamp_readable: new Date(ts).toISOString().replace('T', ' ').slice(0, 19),
        ...(event.ringType === 'motion_detected' ? { sub_type: 'motion' } : {}),
      },
      relationships: { devices: { links: { self: `/v1/devices/${deviceId}` } } },
    },
  };
}
