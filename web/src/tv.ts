// TV preview: the same experience as the Fire TV app, in a browser, for development and demos.
// Plays the day reel, jumps to moments the family asks for, and takes over the screen for alerts.

type Any = Record<string, any>;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const video = $<HTMLVideoElement>('#video');
const still = $<HTMLImageElement>('#still');
const caption = $('#caption');
const meta = $('#meta');
const rail = $('#rail');
const home = $('#home');
const player = $('#player');
const alertEl = $('#alert');
const title = $('#title');

let reel: Any | null = null;
let index = 0;
let stillTimer: number | undefined;

async function loadReel(): Promise<Any> {
  reel = await (await fetch('/api/reel')).json();
  return reel!;
}

function media(path: string): string {
  return path ? `/media/${path}` : '';
}

function renderRail(): void {
  if (!reel) return;
  rail.innerHTML = reel.chapters
    .map(
      (c: Any, i: number) => `<button class="chapter" data-i="${i}" ${i === index ? 'aria-current="true"' : ''}>
        <span class="thumb" style="background-image:url('${media(c.snapshot)}')"></span>
        <span class="t">${c.time}</span><span class="c">${c.caption}</span></button>`,
    )
    .join('');
  rail.querySelectorAll<HTMLButtonElement>('.chapter').forEach((b) => b.addEventListener('click', () => play(Number(b.dataset.i))));
}

function play(i: number): void {
  if (!reel?.chapters.length) return;
  index = Math.max(0, Math.min(i, reel.chapters.length - 1));
  const c = reel.chapters[index];
  home.hidden = true;
  alertEl.hidden = true;
  player.hidden = false;
  caption.textContent = c.caption;
  meta.textContent = `${c.time} · ${c.camera} camera`;
  renderRail();
  rail.querySelector<HTMLButtonElement>(`[data-i="${index}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  window.clearTimeout(stillTimer);
  video.hidden = false;
  still.hidden = true;
  video.src = media(c.clip);
  video.play().catch(() => showStill(c));
}

/** No clip yet (animation still rendering): hold the snapshot for the highlight length. */
function showStill(c: Any): void {
  video.hidden = true;
  still.hidden = false;
  still.src = media(c.snapshot);
  stillTimer = window.setTimeout(next, c.seconds * 1000);
}

function next(): void {
  if (!reel) return;
  if (index + 1 < reel.chapters.length) play(index + 1);
  else showHome();
}

video.addEventListener('error', () => reel && showStill(reel.chapters[index]));
video.addEventListener('ended', next);

/** Shrinks the big title until its longest line fits inside the blob. */
function fitTitle(el: HTMLElement): void {
  el.style.fontSize = '';
  const blob = el.parentElement?.querySelector<HTMLElement>('.blob');
  if (!blob) return;
  const room = blob.clientWidth - el.offsetLeft - blob.clientWidth * 0.06;
  const widest = Math.max(...[...el.children].map((c) => (c as HTMLElement).scrollWidth));
  if (widest > room && room > 0) el.style.fontSize = `${String(Math.floor((parseFloat(getComputedStyle(el).fontSize) * room) / widest))}px`;
}
window.addEventListener('resize', () => document.querySelectorAll<HTMLElement>('.display').forEach(fitTitle));

async function showAlert(alert: { message: string; eventId: string }, day?: Any): Promise<void> {
  video.pause();
  player.hidden = true;
  home.hidden = true;
  alertEl.hidden = false;
  fitTitle(alertEl.querySelector<HTMLElement>('.display')!);
  $('#alert-text').textContent = alert.message;
  const d = day ?? (await (await fetch('/api/day')).json());
  const ev = d.summary.moments.find((x: Any) => x.eventId === alert.eventId);
  $<HTMLImageElement>('#alert-still').src = ev ? media(ev.snapshot) : '';
  $<HTMLButtonElement>('#dismiss').focus();
}

async function showHome(): Promise<void> {
  const day = await (await fetch('/api/day')).json();
  video.pause();
  player.hidden = true;
  // Opened after the dog got out: the alert is what this screen should be showing.
  const open = (day.summary.openAlerts ?? []) as Any[];
  if (open.length && alertEl.hidden && !dismissed.has(open[0].id)) {
    await showAlert(open[0] as { message: string; eventId: string }, day);
    return;
  }
  if (!alertEl.hidden) return;
  home.hidden = false;
  title.innerHTML = `<span>${day.pet.name}'s</span><span>Day</span>`;
  fitTitle(title);
  $('#summary').innerHTML = (day.summary.highlights as string[]).map((h) => `<li>${h.replace(/(\d) (AM|PM)/g, '$1\u00a0$2')}</li>`).join('') || '<li>Nothing yet today.</li>';
  $<HTMLButtonElement>('#play').focus();
}

/** Alerts dismissed on this screen only; Alexa+ "she's back inside" clears them everywhere. */
const dismissed = new Set<string>();
$('#dismiss').addEventListener('click', async () => {
  const day = await (await fetch('/api/day')).json();
  ((day.summary.openAlerts ?? []) as Any[]).forEach((a) => dismissed.add(a.id));
  alertEl.hidden = true;
  void showHome();
});

$('#play').addEventListener('click', async () => {
  await loadReel();
  play(0);
});

// D-pad: left and right move between moments, select plays, back returns home.
document.addEventListener('keydown', (e) => {
  if (player.hidden) return;
  if (e.key === 'ArrowRight') play(index + 1);
  else if (e.key === 'ArrowLeft') play(index - 1);
  else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') void showHome();
  else if (e.key === ' ' || e.key === 'MediaPlayPause') {
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  }
});

const es = new EventSource('/api/stream');
es.onmessage = async (m) => {
  const p = JSON.parse(m.data) as Any;
  if (p.type === 'cast') {
    if (p.target === 'day_reel') {
      await loadReel();
      play(0);
    } else if (p.target === 'moment') {
      await loadReel();
      const i = reel!.chapters.findIndex((c: Any) => c.eventId === p.eventId);
      play(i < 0 ? 0 : i);
    } else if (p.target === 'home') {
      alertEl.hidden = true;
      void showHome();
    }
    if (p.target !== 'home' && p.target !== 'alert') alertEl.hidden = true;
  }
  if (p.type === 'alert') await showAlert(p.alert);
  if (p.type === 'state' && (p.reason === 'alert_resolved' || p.reason === 'reset')) {
    alertEl.hidden = true;
    void showHome();
  }
};

void showHome();
