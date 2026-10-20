import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import * as store from '../src/lib/store';
import {
  createCheckout,
  applyPaidSession,
  reconcileCheckout,
  listPayments,
  handleStripeEvent,
  verifyStripeEvent,
  type BillingProvider,
} from '../src/lib/billing';
import { hasJobEntitlement, JOB_PLANS } from '../src/lib/plans';
import { isLive } from '../src/lib/types';
import { POST as stripeWebhook } from '../src/app/api/stripe/webhook/route';

const databases: ReturnType<typeof store.getDb>[] = [],
  directories: string[] = [];
after(() => {
  for (const db of databases) db.close();
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'eujobs-billing-'));
  directories.push(process.env.DATA_DIR);
  process.env.EUJOBS_SEED = '0';
  delete process.env.EUJOBS_REQUIRE_PAYMENT;
  process.env.APP_ORIGIN = 'https://eujobs.example';
  const db = store.getDb();
  databases.push(db);
  const owner = store.createUser({
    name: 'Job Owner',
    email: `${randomUUID()}@example.org`,
    passwordHash: 'domain-test-password-hash-only',
  });
  const other = store.createUser({
    name: 'Other User',
    email: `${randomUUID()}@example.org`,
    passwordHash: 'domain-test-password-hash-only',
  });
  const admin = store.createUser({
    name: 'Administrator',
    email: `${randomUUID()}@example.org`,
    passwordHash: 'domain-test-password-hash-only',
    role: 'admin',
  });
  const listing = store.createListing(owner.id, {
    kind: 'job',
    title: 'European Policy Analyst',
    organization: 'Example Institute',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Prepare independent policy research across Europe.',
    description:
      'Prepare independent policy research across Europe, work with the team on briefings and share findings with policy practitioners and community organizations.',
    employmentType: 'Permanent',
    seniority: 'Mid-level',
    workMode: 'Hybrid',
    url: 'https://example.org/apply',
  });
  return { db, owner, other, admin, listing };
}
class FakeStripe implements BillingProvider {
  sessions = new Map<string, Stripe.Checkout.Session>();
  keys = new Map<string, Stripe.Checkout.Session>();
  calls: { params: Stripe.Checkout.SessionCreateParams; key: string }[] = [];
  async create(params: Stripe.Checkout.SessionCreateParams, key: string) {
    this.calls.push({ params, key });
    await Promise.resolve();
    if (this.keys.has(key)) return this.keys.get(key)!;
    const session = {
      id: `cs_test_${randomUUID().replaceAll('-', '')}`,
      url: 'https://checkout.stripe.com/c/pay/test',
      mode: 'payment',
      status: 'open',
      payment_status: 'unpaid',
      currency: 'eur',
      amount_total: params.line_items![0].price_data!.unit_amount,
      expires_at: params.expires_at,
      metadata: params.metadata,
      client_reference_id: params.client_reference_id,
      payment_intent: `pi_${randomUUID()}`,
    } as Stripe.Checkout.Session;
    this.sessions.set(session.id, session);
    this.keys.set(key, session);
    return session;
  }
  async retrieve(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Unknown fake checkout');
    return session;
  }
  paid(id: string) {
    const session = this.sessions.get(id)!;
    session.payment_status = 'paid';
    session.status = 'complete';
    return session;
  }
}
const errorStatus = (status: number) => (error: unknown) =>
  error instanceof store.StoreError && error.status === status;

test('prices exactly match the old one-off plans; missing payment blocks submit and approval at store boundary', () => {
  const { owner, admin, listing, db } = setup();
  assert.deepEqual(
    Object.values(JOB_PLANS).map((p) => p.amount),
    [9999, 29999, 50000],
  );
  assert.throws(
    () => store.transitionListing(listing.id, owner.id, owner.role, listing.version, 'submit'),
    errorStatus(402),
  );
  db.prepare("UPDATE listings SET status='pending' WHERE id=?").run(listing.id);
  assert.throws(
    () => store.transitionListing(listing.id, admin.id, admin.role, listing.version, 'approve'),
    errorStatus(402),
  );
  assert.equal(store.getStats().jobs, 0);
});
test('concurrent checkout uses one durable order and Stripe idempotency key; server sets price and billing requirements', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const [a, b] = await Promise.all([
    createCheckout(owner.id, listing.id, 'pro', stripe),
    createCheckout(owner.id, listing.id, 'pro', stripe),
  ]);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal(stripe.keys.size, 1);
  assert.equal(listPayments(owner.id).length, 1);
  const params = stripe.calls[0].params;
  assert.equal(params.line_items![0].price_data!.unit_amount, 29999);
  assert.equal(params.line_items![0].quantity, 1);
  assert.equal(params.mode, 'payment');
  assert.equal(params.billing_address_collection, 'required');
  assert.equal(params.tax_id_collection?.enabled, true);
  assert.equal(params.invoice_creation?.enabled, true);
  assert.match(params.success_url!, /^https:\/\/eujobs\.example\/job-success/);
  await assert.rejects(
    () => createCheckout(owner.id, listing.id, '__proto__', stripe),
    errorStatus(400),
  );
  await assert.rejects(
    () => createCheckout(owner.id, listing.id, 'basic', stripe),
    errorStatus(409),
  );
});
test('payment and checkout history are owner-scoped; unpaid redirects cannot grant an entitlement', async () => {
  const { owner, other, listing } = setup(),
    stripe = new FakeStripe();
  await assert.rejects(
    () => createCheckout(other.id, listing.id, 'basic', stripe),
    errorStatus(403),
  );
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe);
  await assert.rejects(
    () => reconcileCheckout(other.id, checkout.sessionId, stripe),
    errorStatus(404),
  );
  await reconcileCheckout(owner.id, checkout.sessionId, stripe);
  assert.equal(store.getListingById(listing.id)?.status, 'draft');
  assert.equal(hasJobEntitlement(store.getListingById(listing.id)!), false);
  assert.deepEqual(listPayments(other.id), []);
});
test('signed webhook verification rejects forged signatures and altered payloads', () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_local_fixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_fixture';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const payload = JSON.stringify({
    id: 'evt_fixture',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: {} },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  assert.equal(verifyStripeEvent(payload, signature).id, 'evt_fixture');
  assert.throws(() => verifyStripeEvent(`${payload} `, signature), errorStatus(400));
  assert.throws(() => verifyStripeEvent(payload, 'invalid'), errorStatus(400));
});
test('verified payment submits for moderation once, approval starts 30 days, edits do not extend duration', async () => {
  const { owner, listing, admin, db } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'recruiter', stripe);
  const session = stripe.paid(checkout.sessionId);
  const event = {
    id: 'evt_paid',
    type: 'checkout.session.completed',
    data: { object: session },
  } as Stripe.Event;
  await handleStripeEvent(event, stripe);
  let current = store.getListingById(listing.id)!;
  assert.equal(current.status, 'pending');
  assert.equal(current.entitlementExpiresAt, null);
  assert.equal(current.placement, 2);
  assert.equal(current.featured, true);
  assert.equal(store.getStats().jobs, 0);
  const version = current.version;
  await handleStripeEvent(event, stripe);
  await handleStripeEvent({ ...event, id: 'evt_duplicate' }, stripe);
  assert.equal(store.getListingById(listing.id)?.version, version);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_orders').get()?.n, 1);
  current = store.transitionListing(current.id, admin.id, admin.role, current.version, 'approve');
  assert.ok(
    Math.abs(Date.parse(current.entitlementExpiresAt!) - Date.now() - 30 * 86400000) < 2000,
  );
  const expiresAt = current.entitlementExpiresAt;
  current = store.updateListing(current.id, owner.id, owner.role, current.version, {
    title: 'Updated European Policy Analyst',
  });
  assert.equal(current.status, 'draft');
  assert.equal(current.entitlementExpiresAt, expiresAt);
  current = store.transitionListing(current.id, owner.id, owner.role, current.version, 'submit');
  current = store.transitionListing(current.id, admin.id, admin.role, current.version, 'approve');
  assert.equal(current.entitlementExpiresAt, expiresAt);
});
test('amount, currency, ownership, metadata, session identity and mode all fail closed', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe),
    session = stripe.paid(checkout.sessionId);
  const invalid = [
    { amount_total: 1 },
    { currency: 'usd' },
    { mode: 'subscription' },
    { client_reference_id: 'another-order' },
    { id: 'cs_test_other' },
    { payment_status: 'unpaid' },
    { metadata: { ...session.metadata, ownerId: 'other' } },
    { metadata: { ...session.metadata, plan: 'pro' } },
    { metadata: { ...session.metadata, listingVersion: '99' } },
  ];
  for (const change of invalid)
    assert.throws(
      () => applyPaidSession({ ...session, ...change } as Stripe.Checkout.Session),
      errorStatus(409),
    );
  assert.equal(store.getListingById(listing.id)?.status, 'draft');
  assert.equal(listPayments(owner.id)[0].status, 'open');
});
test('editing during checkout retains payment but requires explicit submission of changed details', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe);
  store.updateListing(listing.id, owner.id, owner.role, listing.version, {
    title: 'Different European policy role',
  });
  applyPaidSession(stripe.paid(checkout.sessionId));
  const current = store.getListingById(listing.id)!;
  assert.equal(current.status, 'draft');
  assert.ok(hasJobEntitlement(current));
  assert.equal(
    store.transitionListing(current.id, owner.id, owner.role, current.version, 'submit').status,
    'pending',
  );
});
test('expired entitlements leave discovery and require payment to renew; closed postings can be renewed', async () => {
  const { owner, listing, admin, db } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe);
  applyPaidSession(stripe.paid(checkout.sessionId));
  let current = store.getListingById(listing.id)!;
  current = store.transitionListing(current.id, admin.id, admin.role, current.version, 'approve');
  db.prepare('UPDATE listings SET entitlementExpiresAt=? WHERE id=?').run(
    new Date(Date.now() - 10000).toISOString(),
    listing.id,
  );
  assert.equal(store.getStats().jobs, 0);
  assert.equal(store.searchListings().total, 0);
  assert.equal(isLive(store.getListingById(listing.id)!), false);
  current = store.updateListing(current.id, owner.id, owner.role, current.version, {
    title: 'Renewed European Policy Analyst',
  });
  assert.throws(
    () => store.transitionListing(current.id, owner.id, owner.role, current.version, 'submit'),
    errorStatus(402),
  );
  const renewed = await createCheckout(owner.id, listing.id, 'pro', stripe);
  assert.notEqual(renewed.sessionId, checkout.sessionId);
  applyPaidSession(stripe.paid(renewed.sessionId));
  current = store.getListingById(listing.id)!;
  current = store.transitionListing(current.id, admin.id, admin.role, current.version, 'approve');
  current = store.transitionListing(current.id, owner.id, owner.role, current.version, 'close');
  current = store.updateListing(current.id, owner.id, owner.role, current.version, {
    title: 'Third European Policy Analyst',
  });
  assert.equal(hasJobEntitlement(current), false);
  assert.equal(current.placement, 0);
  await createCheckout(owner.id, listing.id, 'basic', stripe);
});
test('full refunds revoke only their own current entitlement; repeated events do not mutate twice', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe);
  const session = stripe.paid(checkout.sessionId);
  applyPaidSession(session);
  const event = {
    id: 'evt_refund',
    type: 'charge.refunded',
    data: {
      object: {
        refunded: true,
        currency: 'eur',
        amount: 9999,
        payment_intent: session.payment_intent,
      },
    },
  } as Stripe.Event;
  await handleStripeEvent(event, stripe);
  const current = store.getListingById(listing.id)!;
  assert.equal(current.status, 'closed');
  assert.equal(hasJobEntitlement(current), false);
  assert.equal(listPayments(owner.id)[0].status, 'refunded');
  await handleStripeEvent(event, stripe);
  applyPaidSession(session);
  assert.equal(store.getListingById(listing.id)?.version, current.version);
});
test('expired checkout can be replaced safely without creating extra payment records for retries', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const original = await createCheckout(owner.id, listing.id, 'basic', stripe);
  stripe.sessions.get(original.sessionId)!.status = 'expired';
  const replaced = await createCheckout(owner.id, listing.id, 'pro', stripe);
  assert.notEqual(replaced.sessionId, original.sessionId);
  assert.equal(listPayments(owner.id).filter((p) => p.status === 'open').length, 1);
});
test('events remain free and posting policy/category fields round-trip without exposing payment data to writes', () => {
  const { owner } = setup();
  const listing = store.createListing(owner.id, {
    kind: 'event',
    title: 'European policy forum',
    organization: 'Example forum',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Meet policy practitioners for an open discussion.',
    description:
      'Meet policy practitioners for an open and constructive discussion about the future of Europe, with questions and opportunities to connect afterward.',
    url: 'https://example.org/event',
    eventType: 'Webinar',
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 90000000).toISOString(),
    categorySlug: 'think-tanks',
    policyTags: ['Climate', 'Trade'],
  });
  assert.equal(
    store.transitionListing(listing.id, owner.id, owner.role, listing.version, 'submit').status,
    'pending',
  );
  assert.deepEqual(store.getListingById(listing.id)?.policyTags, ['Climate', 'Trade']);
  assert.equal(store.getListingById(listing.id)?.categorySlug, 'think-tanks');
});

test('a failed asynchronous checkout stays unpublished and allows a fresh payment attempt', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const original = await createCheckout(owner.id, listing.id, 'basic', stripe);
  stripe.sessions.get(original.sessionId)!.status = 'complete';
  await handleStripeEvent(
    {
      id: 'evt_async_failed',
      type: 'checkout.session.async_payment_failed',
      data: { object: await stripe.retrieve(original.sessionId) },
    } as Stripe.Event,
    stripe,
  );
  assert.equal(store.getListingById(listing.id)?.status, 'draft');
  assert.equal(listPayments(owner.id)[0].status, 'expired');
  const retry = await createCheckout(owner.id, listing.id, 'basic', stripe);
  assert.notEqual(retry.sessionId, original.sessionId);
});

test('organization category and policy tag search filters select exact declared values', () => {
  const { owner, admin, listing } = setup();
  process.env.EUJOBS_REQUIRE_PAYMENT = '0';
  let current = store.updateListing(listing.id, owner.id, owner.role, listing.version, {
    categorySlug: 'think-tanks',
    policyTags: ['Climate', 'Trade'],
    blockAIApplications: true,
  });
  current = store.transitionListing(current.id, owner.id, owner.role, current.version, 'submit');
  store.transitionListing(current.id, admin.id, admin.role, current.version, 'approve');
  assert.equal(store.searchListings({ categorySlug: 'ngos' }).total, 0);
  assert.equal(
    store.searchListings({ categorySlug: 'think-tanks', policyTag: 'climate' }).total,
    1,
  );
  assert.equal(store.searchListings({ policyTag: 'clim' }).total, 0);
  assert.equal(store.getListingById(listing.id)?.blockAIApplications, true);
  delete process.env.EUJOBS_REQUIRE_PAYMENT;
});

test('webhook HTTP handler accepts signed deliveries and rejects forged or modified raw bodies', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_local_fixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_fixture';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const payload = JSON.stringify({
    id: 'evt_unrelated',
    object: 'event',
    type: 'customer.updated',
    data: { object: { id: 'cus_unrelated' } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const request = (body: string, header: string) =>
    new Request('https://eujobs.example/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body,
    });
  assert.equal((await stripeWebhook(request(payload, signature))).status, 200);
  assert.equal((await stripeWebhook(request(payload, 'forged'))).status, 400);
  assert.equal((await stripeWebhook(request(payload + ' ', signature))).status, 400);
});

function refundEvent(session: Stripe.Checkout.Session, eventId = 'evt_early_refund'): Stripe.Event {
  return {
    id: eventId,
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_refunded',
        refunded: true,
        amount_refunded: session.amount_total,
        currency: session.currency,
        amount: session.amount_total,
        payment_intent: session.payment_intent,
        metadata: {
          eujobsOrderId: session.metadata!.eujobsOrderId,
          ownerId: session.metadata!.ownerId,
          jobId: session.metadata!.jobId,
        },
      },
    },
  } as unknown as Stripe.Event;
}
test('a refund arriving before checkout completion is terminal and later completion cannot grant publication', async () => {
  const { owner, listing, db } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe);
  const session = stripe.paid(checkout.sessionId);
  assert.equal(listPayments(owner.id)[0].paymentIntentId, null);
  await handleStripeEvent(refundEvent(session), stripe);
  assert.equal(listPayments(owner.id)[0].status, 'refunded');
  assert.equal(listPayments(owner.id)[0].paymentIntentId, session.payment_intent);
  const version = store.getListingById(listing.id)!.version;
  await handleStripeEvent(
    {
      id: 'evt_later_complete',
      type: 'checkout.session.completed',
      data: { object: session },
    } as Stripe.Event,
    stripe,
  );
  await reconcileCheckout(owner.id, checkout.sessionId, stripe);
  assert.equal(listPayments(owner.id)[0].status, 'refunded');
  assert.equal(hasJobEntitlement(store.getListingById(listing.id)!), false);
  assert.equal(store.getListingById(listing.id)?.status, 'draft');
  assert.equal(store.getListingById(listing.id)?.version, version);
  assert.ok(db.prepare('SELECT id FROM stripe_events WHERE id=?').get('evt_later_complete'));
});
test('early refund recovery rejects wrong owner, job, amount or currency metadata', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe),
    session = stripe.paid(checkout.sessionId);
  const original = refundEvent(session);
  const charge = original.data.object as Stripe.Charge;
  for (const change of [
    { metadata: { ...charge.metadata, ownerId: 'wrong-owner' } },
    { metadata: { ...charge.metadata, jobId: 'wrong-job' } },
    { metadata: { eujobsOrderId: session.metadata!.eujobsOrderId } },
    { amount: 1 },
    { currency: 'usd' },
  ]) {
    await assert.rejects(
      () =>
        handleStripeEvent(
          { ...original, data: { object: { ...charge, ...change } } } as Stripe.Event,
          stripe,
        ),
      errorStatus(409),
    );
  }
  assert.equal(listPayments(owner.id)[0].status, 'open');
});
test('server reconciliation independently refuses an already refunded expanded Stripe charge', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'pro', stripe),
    session = stripe.paid(checkout.sessionId);
  const intentId = session.payment_intent as string;
  session.payment_intent = {
    id: intentId,
    latest_charge: {
      id: 'ch_refund',
      payment_intent: intentId,
      refunded: true,
      amount: 29999,
      amount_refunded: 29999,
      currency: 'eur',
      metadata: {},
    },
  } as Stripe.PaymentIntent;
  await reconcileCheckout(owner.id, checkout.sessionId, stripe);
  assert.equal(listPayments(owner.id)[0].status, 'refunded');
  assert.equal(hasJobEntitlement(store.getListingById(listing.id)!), false);
  assert.equal(store.getStats().jobs, 0);
});
test('late refunds for a previous posting never revoke a newer paid renewal, and duplicate refund IDs are harmless', async () => {
  const { owner, listing, admin } = setup(),
    stripe = new FakeStripe();
  const first = await createCheckout(owner.id, listing.id, 'basic', stripe),
    firstSession = stripe.paid(first.sessionId);
  applyPaidSession(firstSession);
  let current = store.getListingById(listing.id)!;
  current = store.transitionListing(current.id, admin.id, admin.role, current.version, 'approve');
  current = store.transitionListing(current.id, owner.id, owner.role, current.version, 'close');
  store.updateListing(current.id, owner.id, owner.role, current.version, {
    title: 'Renewed European policy job',
  });
  const second = await createCheckout(owner.id, listing.id, 'pro', stripe);
  applyPaidSession(stripe.paid(second.sessionId));
  const renewed = store.getListingById(listing.id)!;
  await handleStripeEvent(refundEvent(firstSession, 'evt_old_refund'), stripe);
  await handleStripeEvent(refundEvent(firstSession, 'evt_old_refund_duplicate'), stripe);
  applyPaidSession(firstSession);
  const final = store.getListingById(listing.id)!;
  assert.equal(final.paymentOrderId, renewed.paymentOrderId);
  assert.equal(final.version, renewed.version);
  assert.equal(final.status, 'pending');
  assert.equal(hasJobEntitlement(final), true);
});
test('a stale asynchronous failure event rechecks Stripe and cannot release an already paid checkout', async () => {
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe),
    session = await stripe.retrieve(checkout.sessionId);
  const staleSnapshot = { ...session, status: 'complete', payment_status: 'unpaid' };
  stripe.paid(checkout.sessionId);
  await handleStripeEvent(
    {
      id: 'evt_delayed_failure',
      type: 'checkout.session.async_payment_failed',
      data: { object: staleSnapshot },
    } as Stripe.Event,
    stripe,
  );
  assert.equal(listPayments(owner.id)[0].status, 'paid');
  await assert.rejects(
    () => createCheckout(owner.id, listing.id, 'basic', stripe),
    errorStatus(409),
  );
});

test('FIRSTFREE: a completed €0 Basic checkout (100% promotion, no_payment_required) submits the job for review', async () => {
  const { owner, listing, admin } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe);
  const session = stripe.sessions.get(checkout.sessionId)!;
  Object.assign(session, {
    status: 'complete',
    payment_status: 'no_payment_required',
    amount_subtotal: JOB_PLANS.basic.amount,
    amount_total: 0,
    total_details: { amount_discount: JOB_PLANS.basic.amount, amount_shipping: 0, amount_tax: 0 },
    payment_intent: null,
  });
  // Stripe sends checkout.session.completed for no-payment sessions too.
  await handleStripeEvent(
    {
      id: 'evt_free',
      type: 'checkout.session.completed',
      data: { object: session },
    } as Stripe.Event,
    stripe,
  );
  let current = store.getListingById(listing.id)!;
  assert.equal(current.status, 'pending');
  assert.ok(hasJobEntitlement(current));
  assert.equal(current.featured, false);
  assert.equal(listPayments(owner.id)[0].status, 'paid');
  current = store.transitionListing(current.id, admin.id, admin.role, current.version, 'approve');
  assert.ok(isLive(current));
  assert.ok(
    Math.abs(Date.parse(current.entitlementExpiresAt!) - Date.now() - 30 * 86400000) < 2000,
  );
  // Browser return reconciliation is idempotent.
  await reconcileCheckout(owner.id, checkout.sessionId, stripe);
  assert.equal(store.getListingById(listing.id)!.status, 'published');
});
test('FIRSTFREE: €0 settlement is refused for Pro/Recruiter, partial totals, or without a discount', async () => {
  for (const plan of ['pro', 'recruiter'] as const) {
    const { owner, listing } = setup(),
      stripe = new FakeStripe();
    const checkout = await createCheckout(owner.id, listing.id, plan, stripe);
    const session = Object.assign(stripe.sessions.get(checkout.sessionId)!, {
      status: 'complete',
      payment_status: 'no_payment_required',
      amount_subtotal: JOB_PLANS[plan].amount,
      amount_total: 0,
      total_details: { amount_discount: JOB_PLANS[plan].amount, amount_shipping: 0, amount_tax: 0 },
    });
    assert.throws(() => applyPaidSession(session), errorStatus(409));
    assert.equal(store.getListingById(listing.id)?.status, 'draft');
  }
  const { owner, listing } = setup(),
    stripe = new FakeStripe();
  const checkout = await createCheckout(owner.id, listing.id, 'basic', stripe);
  const base = stripe.sessions.get(checkout.sessionId)!;
  const invalid = [
    {
      amount_subtotal: 9999,
      amount_total: 0,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
    },
    {
      amount_subtotal: 9999,
      amount_total: 100,
      total_details: { amount_discount: 9899, amount_shipping: 0, amount_tax: 0 },
    },
    {
      amount_subtotal: 0,
      amount_total: 0,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
    },
  ];
  for (const change of invalid)
    assert.throws(
      () =>
        applyPaidSession({
          ...base,
          status: 'complete',
          payment_status: 'no_payment_required',
          ...change,
        } as Stripe.Checkout.Session),
      errorStatus(409),
    );
  assert.equal(store.getListingById(listing.id)?.status, 'draft');
});
