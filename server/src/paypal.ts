// PayPal, through PayPal's own Agent Toolkit (Orders v2, sandbox). Pawzoo never pays on its own:
//   1. the person says yes to an exact quote;
//   2. Pawzoo creates a PayPal order for exactly those lines and hands back PayPal's approval link;
//   3. the person approves that total on PayPal;
//   4. only an order PayPal reports as APPROVED, for the exact quoted total, is captured.
// Without credentials an offline stand-in plays PayPal's part, labelled as such everywhere, so the demo still runs.

import { randomUUID } from 'node:crypto';

export interface PayLine {
  name: string;
  description?: string;
  unitUsd: number;
  quantity: number;
}

export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  totalUsd: number;
  approveUrl: string | null;
  payerEmail: string | null;
}

export interface PayPalCapture {
  orderId: string;
  status: string;
  captureId: string;
  totalUsd: number;
  payerEmail: string | null;
  capturedAt: string;
}

export interface PayPalGateway {
  readonly mode: 'sandbox' | 'stand-in';
  createOrder(lines: PayLine[], urls: { returnUrl: string; cancelUrl: string }): Promise<PayPalOrder>;
  getOrder(id: string): Promise<PayPalOrder>;
  captureOrder(id: string): Promise<PayPalCapture>;
}

const money = (n: number) => Math.round(n * 100) / 100;
export const linesTotal = (lines: PayLine[]) => money(lines.reduce((s, l) => s + l.unitUsd * l.quantity, 0));

interface RawOrder {
  id: string;
  status: PayPalOrder['status'];
  links?: Array<{ rel: string; href: string }>;
  purchase_units?: Array<{ amount?: { value: string }; payments?: { captures?: Array<{ id: string; status: string; amount: { value: string }; create_time?: string }> } }>;
  payer?: { email_address?: string };
  payment_source?: { paypal?: { email_address?: string } };
}

function toOrder(raw: RawOrder): PayPalOrder {
  return {
    id: raw.id,
    status: raw.status,
    totalUsd: Number(raw.purchase_units?.[0]?.amount?.value ?? 0),
    approveUrl: raw.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href ?? null,
    payerEmail: raw.payer?.email_address ?? raw.payment_source?.paypal?.email_address ?? null,
  };
}

/** The real thing: PayPal's Agent Toolkit against the sandbox. */
export class ToolkitGateway implements PayPalGateway {
  readonly mode = 'sandbox' as const;
  private api: Promise<{ run(method: string, arg: unknown): Promise<string> }> | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async call<T>(method: string, arg: unknown): Promise<T> {
    this.api ??= (async () => {
      const { PayPalAPI } = await import('@paypal/agent-toolkit/mcp');
      // The toolkit's own client exchanges the app credentials for an access token.
      const token = await sandboxToken(this.clientId, this.clientSecret);
      return new PayPalAPI(token, { sandbox: true });
    })();
    const out = JSON.parse(await (await this.api).run(method, arg)) as T & { error?: unknown; message?: string };
    if (out && typeof out === 'object' && ('error' in out || ('message' in out && !('id' in out)))) {
      throw new Error(`PayPal ${method} failed: ${JSON.stringify(out).slice(0, 300)}`);
    }
    return out;
  }

  async createOrder(lines: PayLine[], urls: { returnUrl: string; cancelUrl: string }): Promise<PayPalOrder> {
    const raw = await this.call<RawOrder>('create_order', {
      currencyCode: 'USD',
      items: lines.map((l) => ({ name: l.name, description: l.description, quantity: l.quantity, itemCost: l.unitUsd, taxPercent: 0, itemTotal: money(l.unitUsd * l.quantity) })),
      returnUrl: urls.returnUrl,
      cancelUrl: urls.cancelUrl,
    });
    return toOrder(raw);
  }

  async getOrder(id: string): Promise<PayPalOrder> {
    return toOrder(await this.call<RawOrder>('get_order', { id }));
  }

  async captureOrder(id: string): Promise<PayPalCapture> {
    // The toolkit wraps the capture as { status: 'success' | 'error', response: <PayPal order> }.
    const wrapped = await this.call<{ status: string; response: RawOrder }>('pay_order', { id });
    if (wrapped.status !== 'success') throw new Error(`PayPal capture failed: ${JSON.stringify(wrapped.response).slice(0, 300)}`);
    const raw = wrapped.response;
    const capture = raw.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) throw new Error('PayPal returned no capture for this order.');
    return {
      orderId: raw.id,
      status: capture.status,
      captureId: capture.id,
      totalUsd: Number(capture.amount.value),
      payerEmail: raw.payer?.email_address ?? raw.payment_source?.paypal?.email_address ?? null,
      capturedAt: capture.create_time ?? new Date().toISOString(),
    };
  }
}

let cachedToken: { value: string; until: number } | null = null;

async function sandboxToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal sandbox sign-in failed (${String(res.status)}). Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.`);
  const out = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: out.access_token, until: Date.now() + out.expires_in * 1000 };
  return out.access_token;
}

/**
 * Offline stand-in, for working without credentials: same rules, no money, clearly labelled.
 * "Approval" happens on Pawzoo's own stand-in page, never on paypal.com.
 */
export class StandInGateway implements PayPalGateway {
  readonly mode = 'stand-in' as const;
  private orders = new Map<string, PayPalOrder>();

  constructor(private readonly publicUrl: string) {}

  async createOrder(lines: PayLine[]): Promise<PayPalOrder> {
    const id = `STANDIN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const order: PayPalOrder = { id, status: 'PAYER_ACTION_REQUIRED', totalUsd: linesTotal(lines), approveUrl: `${this.publicUrl}/paypal/stand-in?token=${id}`, payerEmail: null };
    this.orders.set(id, order);
    return { ...order };
  }

  /** Called by the stand-in approval page. */
  approve(id: string): void {
    const o = this.orders.get(id);
    if (o && o.status === 'PAYER_ACTION_REQUIRED') Object.assign(o, { status: 'APPROVED', payerEmail: 'stand-in buyer' });
  }

  async getOrder(id: string): Promise<PayPalOrder> {
    const o = this.orders.get(id);
    if (!o) throw new Error(`No order ${id}`);
    return { ...o };
  }

  async captureOrder(id: string): Promise<PayPalCapture> {
    const o = this.orders.get(id);
    if (!o || o.status !== 'APPROVED') throw new Error('ORDER_NOT_APPROVED');
    o.status = 'COMPLETED';
    return { orderId: id, status: 'COMPLETED', captureId: `STANDIN-CAPTURE-${randomUUID().slice(0, 6).toUpperCase()}`, totalUsd: o.totalUsd, payerEmail: o.payerEmail, capturedAt: new Date().toISOString() };
  }
}

export function gatewayFromEnv(publicUrl: string): PayPalGateway {
  const id = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if ((process.env.PAYPAL_ENV ?? 'sandbox') !== 'sandbox') throw new Error('Pawzoo runs against the PayPal sandbox only (PAYPAL_ENV=sandbox).');
  return id && secret ? new ToolkitGateway(id, secret) : new StandInGateway(publicUrl);
}
