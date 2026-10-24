// Time helpers. The household lives in one time zone; everything is stored in UTC.

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  weekday: number; // 1 = Monday ... 7 = Sunday
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(at: Date | string, timeZone: string): LocalParts {
  const d = typeof at === 'string' ? new Date(at) : at;
  const p: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(d)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: WEEKDAYS[p.weekday] ?? 1,
  };
}

/** UTC instant for a local wall-clock time in the given zone. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset, including across a DST change.
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const lp = localParts(new Date(utc), timeZone);
    const [ly, lm, ld] = lp.date.split('-').map(Number);
    const [lh, lmin] = lp.time.split(':').map(Number);
    const asIfUtc = Date.UTC(ly, lm - 1, ld, lh, lmin);
    utc += guess - asIfUtc;
  }
  return new Date(utc);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function weekdayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/** "8:06 AM" style label for speech and cards. */
export function clockLabel(at: Date | string, timeZone: string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
}

/**
 * The demo clock. Live mode follows real time. Demo mode pins "now" to a chosen
 * instant so a presenter can jump to 7 PM and replay the day on cue.
 */
export class Clock {
  private pinned: Date | null = null;

  now(): Date {
    return this.pinned ? new Date(this.pinned) : new Date();
  }

  set(at: Date): void {
    this.pinned = new Date(at);
  }

  release(): void {
    this.pinned = null;
  }

  isPinned(): boolean {
    return this.pinned !== null;
  }
}
