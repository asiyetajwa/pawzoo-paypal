// The Pawzoo card: one MCP Apps view that renders every Pawzoo answer.
// Buttons call Pawzoo tools back through the host, so a tap and a spoken "yes" take the same path.

import { App } from '@modelcontextprotocol/ext-apps';

type Any = Record<string, any>;

const app = new App({ name: 'pawzoo-card', version: '1.0.0' }, {}, { autoResize: true });
const root = document.getElementById('root')!;

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function media(base: string, path: string): string {
  return path ? `${base.replace(/\/$/, '')}/media/${path}` : '';
}

function money(n: number): string {
  return `$${Number(n).toFixed(2)}`;
}

function button(label: string, tool: string, args: Any, kind: 'primary' | 'quiet' = 'primary'): string {
  return `<button class="btn ${kind}" data-tool="${esc(tool)}" data-args="${esc(JSON.stringify(args))}">${esc(label)}</button>`;
}

function dayCard(d: Any, base: string): string {
  const s = d.summary;
  const moments = (s.moments as Any[]).filter((m) => m.tag !== 'walker_leave');
  const strip = moments
    .slice(-6)
    .map(
      (m) => `<figure class="moment">
        <div class="thumb">${m.snapshot ? `<img alt="" src="${esc(media(base, m.snapshot))}" onerror="this.remove()">` : ''}<span class="time">${esc(m.time)}</span></div>
        <figcaption>${esc(m.caption)}</figcaption></figure>`,
    )
    .join('');
  const food = s.food;
  const foodLine =
    food.status === 'covered'
      ? 'Food: covered, new bag on the way'
      : `Food: ${food.daysLeft} days left, runs out ${food.runsOutDay}`;
  const alert = s.openAlerts?.[0];
  return `
    <header><p class="eyebrow">${esc(s.dayName)}</p><h1>${esc(s.pet)}'s day</h1></header>
    ${alert ? `<p class="alert">${esc(alert.message)}</p>` : ''}
    <ul class="facts">
      ${s.walk ? `<li><b>Walk</b> ${esc(s.walk.headline)}</li>` : '<li><b>Walk</b> Not yet today</li>'}
      <li><b>Meals</b> ${s.meals} on camera</li>
      <li class="${food.status === 'order_now' || food.status === 'order_soon' ? 'warn' : ''}"><b>Food</b> ${esc(foodLine.replace('Food: ', ''))}</li>
    </ul>
    <div class="strip">${strip || '<p class="muted">No moments yet.</p>'}</div>
    <div class="actions">
      ${button('Play on TV', 'play_on_tv', { target: 'day_reel' })}
      ${food.status === 'order_now' || food.status === 'order_soon' ? button('Reorder Food', 'propose_reorder', { quantity: 1 }, 'quiet') : ''}
    </div>`;
}

function momentsCard(d: Any, base: string): string {
  const list = (d.moments as Any[])
    .map(
      (m) => `<li class="row">
        <div class="thumb small">${m.snapshot ? `<img alt="" src="${esc(media(base, m.snapshot))}" onerror="this.remove()">` : ''}</div>
        <div class="grow"><b>${esc(m.time)}</b> ${esc(m.camera)}<br>${esc(m.caption)}</div>
        ${button('On TV', 'play_on_tv', { target: 'moment', event_id: m.eventId }, 'quiet')}
      </li>`,
    )
    .join('');
  return `<header><p class="eyebrow">Moments</p><h1>${esc(d.query)}</h1></header><ul class="rows">${list || '<li class="muted">Nothing on camera.</li>'}</ul>`;
}

function foodCard(d: Any): string {
  const f = d.food;
  const pct = Math.max(4, Math.min(100, Math.round((f.cupsLeft / f.product.cups) * 100)));
  const need = f.status === 'order_now' || f.status === 'order_soon';
  return `
    <header><p class="eyebrow">Food</p><h1>${esc(f.product.name)}</h1><p class="muted">${esc(f.product.sizeLabel)}</p></header>
    <div class="meter" role="img" aria-label="${pct}% left"><span style="width:${pct}%"></span></div>
    <ul class="facts">
      <li><b>Left</b> ${f.cupsLeft} cups, about ${f.daysLeft} days</li>
      <li class="${need ? 'warn' : ''}"><b>Runs out</b> ${esc(f.runsOutDay)}</li>
      <li><b>Rate</b> ${f.dailyCups} cups a day, from ${esc(f.dailyCupsSource)}</li>
      ${f.incoming ? `<li><b>On the way</b> arrives ${esc(f.incoming.arrivesOn)}</li>` : ''}
    </ul>
    ${need ? `<div class="actions">${button(`Reorder for ${money(f.product.priceUsd)}`, 'propose_reorder', { product_id: f.product.id, quantity: 1 })}</div>` : ''}`;
}

/** The exact lines that will appear on PayPal and on the receipt. */
function lineRows(lines: Any[], total: number): string {
  const rows = lines.map((l) => `<li><b>${esc(l.name)}</b><span>${l.quantity > 1 ? `${String(l.quantity)} x ${money(l.unitUsd)} = ` : ''}${money(l.unitUsd * l.quantity)}</span></li>`).join('');
  return `<ul class="lines">${rows}<li class="total"><b>Total</b><span>${money(total)}</span></li></ul>`;
}

function confirmCard(d: Any): string {
  const a = d.action;
  if (a.kind === 'booking') {
    const s = d.slot ?? {};
    return `<header><p class="eyebrow">Needs your OK</p><h1>Confirm booking</h1></header>
      <ul class="facts"><li><b>Where</b> ${esc(s.provider)}</li><li><b>When</b> ${esc(new Date(s.startAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }))}</li><li><b>Price</b> ${money(s.priceUsd)}, paid at the visit</li></ul>
      <div class="actions">${button('Confirm', 'confirm_action', { confirmation_id: a.id })}</div>`;
  }
  const total = a.kind === 'order' ? a.totalUsd : a.amountUsd + a.tipUsd;
  const title = a.kind === 'order' ? 'Food refill' : 'Pay for the walk';
  const extra = a.kind === 'order' ? `<p class="muted small">Arrives in ${String(d.product.deliveryDays)} days.</p>` : '';
  return `<header><p class="eyebrow">Needs your OK</p><h1>${title}</h1></header>${lineRows(d.lines ?? [], total)}${extra}
    <p class="muted small">Pawzoo never pays on its own. Say yes, then approve this exact total on PayPal.</p>
    <div class="actions">${button('Yes, Pay With PayPal', 'create_paypal_order', { confirmation_id: a.id })}</div>`;
}

function paypalCard(d: Any): string {
  const p = d.payment;
  const standIn = d.gateway === 'stand-in';
  return `<header><p class="eyebrow">${standIn ? 'PayPal stand-in, offline' : 'PayPal sandbox'}</p><h1>Approve ${money(p.totalUsd)}</h1></header>
    ${lineRows(p.lines, p.totalUsd)}
    <p class="muted small">Order ${esc(p.orderId)}. Nothing is charged until you approve on PayPal, and Pawzoo captures only this exact total.</p>
    <div class="actions">${p.approveUrl ? `<button class="btn primary paypal" data-link="${esc(p.approveUrl)}">Approve on PayPal</button>` : ''}
    ${button('I Approved It', 'capture_paypal_order', { order_id: p.orderId }, 'quiet')}</div>`;
}

/** Receipts show the payer's PayPal account without spelling out the address: s•••@example.com. */
const maskEmail = (e: string) => e.replace(/^([^@])[^@]*(@.*)$/, '$1•••$2');

const day = (iso: string) => when(`${iso}T17:00:00Z`, { weekday: 'long', month: 'short', day: 'numeric' });

function receiptCard(d: Any): string {
  const r = d.receipt;
  const food = r.food
    ? `<ul class="facts"><li><b>Arrives</b> ${esc(day(r.food.arrivesOn))}</li><li><b>Rate</b> ${r.food.dailyCups} cups a day, a bag lasts ${String(r.food.bagLastsDays)} days</li><li><b>Next run-out</b> ${esc(day(r.food.nextRunsOutOn))}</li></ul>`
    : '';
  const walk = r.walk ? `<ul class="facts"><li><b>Walk</b> ${esc(r.walk.walker)}, ${String(r.walk.minutes)} minutes, ${esc(day(r.walk.date))}</li></ul>` : '';
  return `<header><p class="eyebrow">Receipt${r.gateway === 'stand-in' ? ', offline stand-in' : ', PayPal sandbox'}</p><h1>${esc(r.title)}</h1></header>
    ${lineRows(r.lines, r.totalUsd)}${food}${walk}
    <ul class="facts small"><li><b>PayPal transaction</b> <code>${esc(r.transactionId)}</code></li><li><b>Paid</b> ${esc(when(r.capturedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${r.payer ? ` by ${esc(maskEmail(r.payer))}` : ''}</li></ul>
    <div class="actions">${button('All Receipts', 'order_receipt', { limit: 5 }, 'quiet')}</div>`;
}

function receiptsCard(d: Any): string {
  const list = d.receipts as Any[];
  const spent = list.reduce((a, r) => a + r.totalUsd, 0);
  const tips = list.reduce((a, r) => a + r.tipUsd, 0);
  const rows = list
    .map((r) => `<li class="row"><div class="grow"><b>${esc(r.title)}</b><br><span class="muted small">${esc(when(r.capturedAt, { month: 'short', day: 'numeric' }))} · <code>${esc(r.transactionId)}</code>${r.food ? ` · next run-out ${esc(day(r.food.nextRunsOutOn))}` : ''}</span></div>
      <div class="amt">${money(r.totalUsd)}${r.tipUsd ? `<br><span class="muted small">tip ${money(r.tipUsd)}</span>` : ''}</div></li>`)
    .join('');
  return `<header><p class="eyebrow">${esc(d.pet)}'s receipts</p><h1>${money(spent)} paid</h1><p class="muted">${money(tips)} in tips, ${String(list.length)} payment${list.length === 1 ? '' : 's'}</p></header>
    <ul class="rows">${rows || '<li class="muted">No receipts yet.</li>'}</ul>`;
}

function walkCard(d: Any): string {
  const r = d.report;
  if (!r) return `<header><p class="eyebrow">Walk</p><h1>No walk yet today</h1></header>`;
  const w = r.walk;
  const pct = Math.min(100, Math.round((w.minutes / w.bookedMinutes) * 100));
  const short = (r.week.short as Any[]).map((s) => `${esc(s.day)} (${s.minutes} min)`).join(', ');
  return `
    <header><p class="eyebrow">Walk, seen by the Front Door camera</p><h1>${w.minutes} of ${w.bookedMinutes} minutes</h1></header>
    <div class="meter ${pct < 80 ? 'low' : ''}"><span style="width:${pct}%"></span></div>
    <ul class="facts">
      <li><b>Walker</b> ${esc(w.walker)}, Leash &amp; Lead</li>
      <li><b>This week</b> ${r.week.walks} walks, average ${r.week.averageMinutes} min</li>
      ${short ? `<li class="warn"><b>Short</b> ${short}</li>` : ''}
      <li><b>Payment</b> ${w.paid ? `Paid ${money(w.paid.amountUsd + w.paid.tipUsd)}` : `${money(r.amountDueUsd)} due`}</li>
    </ul>
    ${w.paid ? '' : `<div class="actions">${button(`Pay + $3 Tip`, 'quote_walk_payment', { walk_id: w.id, tip_usd: 3 })}${button('Pay, No Tip', 'quote_walk_payment', { walk_id: w.id, tip_usd: 0 }, 'quiet')}</div>`}`;
}

function slotsCard(d: Any): string {
  const label: Any = { grooming: 'Grooming', vet_checkup: 'Vet check-up', extra_walk: 'Extra walk' };
  const rows = (d.slots as Any[])
    .slice(0, 4)
    .map(
      (s) => `<li class="row ${s.id === d.recommended ? 'pick' : ''}"><div class="grow"><b>${esc(
        new Date(s.startAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }),
      )}</b><br>${esc(s.provider)}, ${money(s.priceUsd)}</div>${button('Book', 'quote_booking', { slot_id: s.id }, s.id === d.recommended ? 'primary' : 'quiet')}</li>`,
    )
    .join('');
  return `<header><p class="eyebrow">Open slots</p><h1>${esc(label[d.service] ?? d.service)}</h1></header><ul class="rows">${rows || '<li class="muted">Nothing open.</li>'}</ul>`;
}

const when = (at: string, opts: Intl.DateTimeFormatOptions) => new Date(at).toLocaleString('en-US', { ...opts, timeZone: 'America/Chicago' });

/** A receipt for what was just done: the details behind the spoken line, not the line again. */
function doneCard(d: Any): string {
  const x = d.done;
  if (d.remembered) return `<header><p class="eyebrow">Remembered</p><h1>Noted for next time</h1></header><ul class="facts"><li><b>You said</b> ${esc(d.remembered)}</li></ul>`;
  if (!x) return `<header><p class="eyebrow">Done</p><h1>All set</h1></header>`;
  let title = '';
  let lines = '';
  if (x.kind === 'order') {
    title = 'Food ordered';
    lines = `<li><b>Item</b> ${esc(x.product.name)}${x.order.quantity > 1 ? ` x${String(x.order.quantity)}` : ''}</li>
      <li><b>Total</b> ${money(x.order.totalUsd)}</li><li><b>Arrives</b> ${esc(when(`${String(x.order.arrivesOn)}T17:00:00Z`, { weekday: 'long', month: 'short', day: 'numeric' }))}</li>`;
  } else if (x.kind === 'walk_payment') {
    title = 'Walk paid';
    const paid = x.walk.paid;
    lines = `<li><b>To</b> ${esc(x.walk.walker)}</li><li><b>Walk</b> ${money(paid.amountUsd)}</li><li><b>Tip</b> ${money(paid.tipUsd)}</li><li><b>Total</b> ${money(paid.amountUsd + paid.tipUsd)}</li>`;
  } else {
    const slot = x.booking.slot;
    title = slot.service === 'vet_checkup' ? 'Check-up booked' : slot.service === 'extra_walk' ? 'Extra walk booked' : 'Grooming booked';
    lines = `<li><b>Where</b> ${esc(slot.provider)}</li><li><b>When</b> ${esc(when(slot.startAt, { weekday: 'long', hour: 'numeric', minute: '2-digit' }))}</li><li><b>Price</b> ${money(slot.priceUsd)}</li>`;
  }
  return `<header><p class="eyebrow">Done</p><h1>${title}</h1></header><ul class="facts">${lines}</ul>`;
}

function render(data: Any | undefined): void {
  if (!data) return;
  const base: string = data.mediaBase ?? '';
  let html = '';
  switch (data.card) {
    case 'day': html = dayCard(data, base); break;
    case 'moments': html = momentsCard(data, base); break;
    case 'food': html = foodCard(data); break;
    case 'confirm': html = confirmCard(data); break;
    case 'walk': html = walkCard(data); break;
    case 'slots': html = slotsCard(data); break;
    case 'done': html = doneCard(data); break;
    case 'paypal': html = paypalCard(data); break;
    case 'receipt': html = receiptCard(data); break;
    case 'receipts': html = receiptsCard(data); break;
    default: html = `<p>${esc(data.say)}</p>`;
  }
  root.innerHTML = `<article class="card">${html}<footer><span class="brand">Pawzoo</span></footer></article>`;
}

root.addEventListener('click', async (e) => {
  const link = (e.target as HTMLElement).closest('button[data-link]') as HTMLButtonElement | null;
  if (link) {
    // The card runs sandboxed; the host opens PayPal's approval page for the person.
    await app.openLink({ url: link.dataset.link! });
    return;
  }
  const btn = (e.target as HTMLElement).closest('button[data-tool]') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = true;
  try {
    const result = await app.callServerTool({ name: btn.dataset.tool!, arguments: JSON.parse(btn.dataset.args ?? '{}') });
    if (result.structuredContent) render(result.structuredContent as Any);
  } finally {
    btn.disabled = false;
  }
});

function applyTheme(theme: string | undefined): void {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

app.ontoolresult = (params) => render(params.structuredContent as Any | undefined);
app.onhostcontextchanged = (ctx) => applyTheme(ctx.theme);

await app.connect();
applyTheme(app.getHostContext()?.theme);
