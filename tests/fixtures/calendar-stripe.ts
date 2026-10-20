import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { BillingProvider } from '../../src/lib/billing';

export class FakeCalendarStripe implements BillingProvider {
  sessions = new Map<string, Stripe.Checkout.Session>();
  keys = new Map<string, Stripe.Checkout.Session>();
  calls: { params: Stripe.Checkout.SessionCreateParams; key: string }[] = [];
  retrieveCalls: string[] = [];
  loseNextResponse = false;
  async create(params: Stripe.Checkout.SessionCreateParams, key: string) {
    this.calls.push({ params, key });
    await Promise.resolve();
    if (this.keys.has(key)) return this.keys.get(key)!;
    const session = {
      id: `cs_test_${randomUUID().replaceAll('-', '')}`,
      url: 'https://checkout.stripe.com/c/pay/calendar-fixture',
      mode: 'payment',
      status: 'open',
      payment_status: 'unpaid',
      currency: 'eur',
      amount_total: params.line_items![0].price_data!.unit_amount,
      client_reference_id: params.client_reference_id,
      metadata: params.metadata,
      expires_at: params.expires_at,
      payment_intent: null,
    } as Stripe.Checkout.Session;
    this.sessions.set(session.id, session);
    this.keys.set(key, session);
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new Error('Simulated lost Stripe create response');
    }
    return session;
  }
  async retrieve(id: string) {
    this.retrieveCalls.push(id);
    const session = this.sessions.get(id);
    if (!session) throw new Error('Unknown fake checkout');
    return session;
  }
  session() {
    return [...this.sessions.values()][0];
  }
  paid() {
    const session = this.session(),
      id = `pi_${randomUUID().replaceAll('-', '')}`;
    const charge = {
      id: `ch_${randomUUID().replaceAll('-', '')}`,
      payment_intent: id,
      paid: true,
      status: 'succeeded',
      amount: session.amount_total,
      currency: session.currency,
      refunded: false,
      amount_refunded: 0,
      metadata: session.metadata,
      receipt_url: 'https://pay.stripe.com/receipts/calendar-fixture',
    } as Stripe.Charge;
    const intent = {
      id,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      metadata: session.metadata,
      latest_charge: charge,
    } as Stripe.PaymentIntent;
    session.status = 'complete';
    session.payment_status = 'paid';
    session.payment_intent = intent;
    session.invoice = {
      id: 'in_calendar_fixture',
      hosted_invoice_url: 'https://invoice.stripe.com/i/calendar-fixture',
    } as Stripe.Invoice;
    return session;
  }
  charge() {
    return (this.session().payment_intent as Stripe.PaymentIntent).latest_charge as Stripe.Charge;
  }
}
