// The running Pawzoo service: state, clock, live pushes and the replay engine.

import { EventEmitter } from 'node:events';
import type { PetEvent, State } from './types.js';
import { ingestEvent, type AgentNotice } from './agent.js';
import { Clock, localParts, zonedToUtc } from './time.js';
import { DAY_SCRIPT, ESCAPE_SCRIPT, TIME_ZONE, eventFromScript, initialState, type ScenarioEvent } from './seed.js';
import { RingClient, eventFromLiveWebhook, signRingBody, verifyRingSignature, webhookFor, type RingWebhook } from './ring.js';
import { FileStore, type Store } from './store.js';

export type Push =
  | AgentNotice
  | { type: 'cast'; target: 'day_reel' | 'moment' | 'alert' | 'home'; eventId?: string; date?: string }
  | { type: 'clock'; now: string; local: string; pinned: boolean }
  | { type: 'state'; reason: string };

export interface RuntimeOptions {
  store: Store;
  mediaDir: string;
  ringSecret: string;
  demoDate?: string;
}

export class Runtime {
  readonly clock = new Clock();
  readonly bus = new EventEmitter();
  readonly ring = RingClient.fromEnv();
  readonly demoDate: string;
  private state: State | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Recorded moments by webhook request id: replay's stand-in for Ring's classification and clip APIs. */
  private recordings = new Map<string, PetEvent>();

  constructor(private readonly opts: RuntimeOptions) {
    this.bus.setMaxListeners(100);
    this.demoDate = opts.demoDate ?? localParts(new Date(), TIME_ZONE).date;
  }

  get store(): Store {
    return this.opts.store;
  }

  get mediaDir(): string {
    return this.opts.mediaDir;
  }

  now(): Date {
    return this.clock.now();
  }

  today(): string {
    return localParts(this.now(), TIME_ZONE).date;
  }

  /** Serialises every read-modify-write so concurrent tool calls never lose an update. */
  async withState<T>(fn: (s: State) => T | Promise<T>, save = true): Promise<T> {
    const run = this.queue.then(async () => {
      const s = await this.load();
      const out = await fn(s);
      if (save) await this.save(s);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  read<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
    return this.withState(fn, false);
  }

  /** Why the configured store was abandoned, shown in the simulator so a fallback is never silent. */
  storeError: string | null = null;

  /** DynamoDB trouble (credentials, region, table name) must not take the demo down: switch to a local file and say so. */
  private fallBackToFile(err: unknown): void {
    const e = err as Error;
    this.storeError = `${e.name}: ${e.message}`;
    console.error(`[store] ${this.opts.store.kind} failed (${this.storeError}). Using a local file instead. Run "npm run check:aws" to see why.`);
    this.opts.store = new FileStore(process.env.PAWZOO_STATE_FILE ?? 'data/state.json');
  }

  private async load(): Promise<State> {
    if (!this.state) {
      let loaded: State | null;
      try {
        loaded = await this.opts.store.load('hh-rivera');
      } catch (err) {
        if (this.opts.store.kind === 'file') throw err;
        this.fallBackToFile(err);
        loaded = await this.opts.store.load('hh-rivera');
      }
      // A state saved on an earlier day would show yesterday's walks as today's, so start that day fresh.
      this.state = loaded && loaded.seededFor === this.demoDate ? loaded : initialState(this.demoDate);
    }
    return this.state;
  }

  private async save(s: State): Promise<void> {
    try {
      await this.opts.store.save(s);
    } catch (err) {
      if (this.opts.store.kind === 'file') throw err;
      this.fallBackToFile(err);
      await this.opts.store.save(s);
    }
  }

  push(p: Push): void {
    this.bus.emit('push', p);
  }

  // ---------- Ring webhooks (live and replay share this path) ----------

  async handleRingWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ status: number; body: unknown }> {
    if (!verifyRingSignature(rawBody, signature, this.opts.ringSecret)) {
      return { status: 401, body: { error: 'Bad signature' } };
    }
    const hook = JSON.parse(rawBody.toString('utf8')) as RingWebhook;
    if (hook.data.type !== 'motion_detected' && hook.data.type !== 'button_press') {
      return { status: 202, body: { ignored: hook.data.type } };
    }
    const recorded = this.recordings.get(hook.meta.request_id);
    const event = recorded ?? (await eventFromLiveWebhook(hook, this.ring, this.opts.mediaDir));
    if (!event) return { status: 202, body: { ignored: 'no person or animal' } };
    const notices = await this.withState((s) => ingestEvent(s, event));
    notices.forEach((n) => this.push(n));
    if (notices.some((n) => n.type === 'alert')) this.push({ type: 'cast', target: 'alert', eventId: event.id });
    return { status: 200, body: { ingested: event.id, tag: event.tag } };
  }

  private async replay(script: ScenarioEvent): Promise<void> {
    const event = eventFromScript(script, this.demoDate, TIME_ZONE);
    const hook = webhookFor(event);
    this.recordings.set(hook.meta.request_id, event);
    const raw = Buffer.from(JSON.stringify(hook));
    await this.handleRingWebhook(raw, signRingBody(raw, this.opts.ringSecret));
  }

  /** Replays every recorded moment of the demo day up to the clock. */
  async catchUp(): Promise<void> {
    const now = this.now().getTime();
    for (const s of DAY_SCRIPT) {
      if (zonedToUtc(this.demoDate, s.time, TIME_ZONE).getTime() <= now) await this.replay(s);
    }
  }

  // ---------- Demo controls ----------

  async setLocalTime(time: string): Promise<void> {
    this.clock.set(zonedToUtc(this.demoDate, time, TIME_ZONE));
    this.pushClock();
    await this.catchUp();
  }

  async triggerEscape(): Promise<void> {
    await this.replay(ESCAPE_SCRIPT);
  }

  async reset(): Promise<void> {
    await this.withState((s) => {
      const fresh = initialState(this.demoDate);
      Object.assign(s, fresh);
    });
    this.recordings.clear();
    this.push({ type: 'state', reason: 'reset' });
  }

  pushClock(): void {
    const now = this.now();
    this.push({
      type: 'clock',
      now: now.toISOString(),
      local: `${localParts(now, TIME_ZONE).date} ${localParts(now, TIME_ZONE).time}`,
      pinned: this.clock.isPinned(),
    });
  }
}
