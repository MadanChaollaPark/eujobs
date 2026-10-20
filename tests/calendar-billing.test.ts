import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Stripe from 'stripe';
import { FakeCalendarStripe as FakeStripe } from './fixtures/calendar-stripe';
import * as store from '../src/lib/store';
import {
  calendarCookieName,
  continueCalendarCheckout,
  createCalendarPurchase,
  downloadCalendarPurchase,
  getCalendarPurchase,
  handleCalendarStripeEvent,
  reconcileCalendarPurchase,
  requireCalendarPurchase,
  getCalendarFeed,
  getAuthorizedCalendarEvents,
} from '../src/lib/calendar-billing';
import { currentCalendarMonth } from '../src/lib/monthly-calendar';
import { POST as accessRoute } from '../src/app/api/calendar-purchases/[id]/access/route';
import { GET as statusRoute } from '../src/app/api/calendar-purchases/[id]/route';
import { POST as createRoute } from '../src/app/api/calendar-purchases/route';
import { POST as stripeWebhookRoute } from '../src/app/api/stripe/webhook/route';

const directories: string[] = [],
  databases: ReturnType<typeof store.getDb>[] = [];
after(() => {
  for (const db of databases) db.close();
  for (const dir of directories) rmSync(dir, { force: true, recursive: true });
});
function nextMonth() {
  const day = new Date(`${currentCalendarMonth()}-01T12:00:00Z`);
  day.setUTCMonth(day.getUTCMonth() + 1);
  return day.toISOString().slice(0, 7);
}
function setup() {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'eujobs-calendar-billing-'));
  directories.push(process.env.DATA_DIR);
  process.env.EUJOBS_SEED = '0';
  process.env.APP_ORIGIN = 'https://eujobs.example';
  const db = store.getDb();
  databases.push(db);
  const owner = store.createUser({
    name: 'Calendar fixture owner',
    email: `${randomUUID()}@example.org`,
    passwordHash: 'domain-test-password-hash-only',
  });
  const month = nextMonth();
  const event = store.createListing(owner.id, {
    kind: 'event',
    title: 'Calendar policy conference',
    organization: 'Policy Institute',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'An independent policy conference with public registration.',
    description:
      'A detailed independent policy conference discussing European policy priorities, bringing together researchers and public policy practitioners for an open discussion.',
    startsAt: `${month}-02T09:00:00Z`,
    endsAt: `${month}-02T11:00:00Z`,
    timezone: 'Europe/Brussels',
    eventType: 'Conference',
    venue: 'Brussels conference hall',
    url: 'https://example.org/event-registration',
    price: 0,
  });
  db.prepare("UPDATE listings SET status='published',publishedAt=? WHERE id=?").run(
    new Date().toISOString(),
    event.id,
  );
  const job = store.createListing(owner.id, {
    kind: 'job',
    title: 'European Policy Analyst',
    organization: 'Policy Institute',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Prepare independent policy research across Europe.',
    description:
      'Prepare independent policy research across Europe and work with the team on briefings to share findings with policy practitioners and community organizations.',
    employmentType: 'Permanent',
    seniority: 'Mid-level',
    workMode: 'Hybrid',
    url: 'https://example.org/apply',
  });
  const input = {
    month,
    email: 'calendar-buyer@example.org',
    requestId: randomUUID(),
    requestToken: randomBytes(32).toString('base64url'),
  };
  return { db, owner, event, job, input };
}

function webhook(type: string, object: unknown, id = `evt_${randomUUID()}`) {
  return { id, type, data: { object } } as Stripe.Event;
}
const errorStatus = (status: number) => (error: unknown) =>
  error instanceof store.StoreError && error.status === status;

test('concurrent calendar creation reserves one snapshot and one Stripe checkout with server-owned price', async () => {
  const { db, input, job } = setup(),
    stripe = new FakeStripe();
  const beforeJob = store.getListingById(job.id);
  const beforeUsers = db.prepare('SELECT * FROM users ORDER BY id').all();
  const [a, b] = await Promise.all([
    createCalendarPurchase(input, stripe),
    createCalendarPurchase(input, stripe),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(stripe.keys.size, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM calendar_orders').get()?.n, 1);
  assert.equal(a.amount, 1000);
  assert.equal(a.count, 1);
  assert.equal(a.status, 'open');
  assert.equal(a.downloadUrl, null);
  assert.equal(a.manageUrl, `/calendar-purchases/${a.id}#token=${input.requestToken}`);
  const params = stripe.calls[0].params;
  assert.equal(params.mode, 'payment');
  assert.deepEqual(params.payment_method_types, ['card']);
  assert.equal(params.line_items![0].price_data!.unit_amount, 1000);
  assert.equal(params.line_items![0].price_data!.currency, 'eur');
  assert.equal(params.metadata?.eujobsProduct, 'monthly_calendar');
  assert.equal(params.metadata?.eujobsOrderId, undefined);
  assert.equal(params.payment_intent_data?.metadata?.snapshotHash, params.metadata?.snapshotHash);
  assert.match(params.success_url!, new RegExp(`/calendar-purchases/${a.id}\\?session_id=`));
  assert.ok(!JSON.stringify(params).includes(input.requestToken));
  assert.ok(
    !JSON.stringify(db.prepare('SELECT * FROM calendar_orders').get()).includes(input.requestToken),
  );
  assert.deepEqual(store.getListingById(job.id), beforeJob);
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), beforeUsers);
  assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get()?.n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM guest_postings').get()?.n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM email_outbox').get()?.n, 1);
});

test('empty months and forged inputs create neither an order nor a Stripe checkout', async () => {
  const { db, input, event } = setup(),
    stripe = new FakeStripe();
  db.prepare("UPDATE listings SET status='closed' WHERE id=?").run(event.id);
  await assert.rejects(() => createCalendarPurchase(input, stripe), errorStatus(409));
  await assert.rejects(() => createCalendarPurchase({ ...input, amount: 1 }, stripe));
  await assert.rejects(() => createCalendarPurchase({ ...input, requestToken: 'fake' }, stripe));
  await assert.rejects(() => createCalendarPurchase({ ...input, month: '2024-01' }, stripe));
  assert.equal(db.prepare('SELECT count(*) AS n FROM calendar_orders').get()?.n, 0);
  assert.equal(stripe.calls.length, 0);
});

test('capability auth protects status, retries, reconciliation and downloads; repeated request IDs cannot be hijacked', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe),
    wrong = randomBytes(32).toString('base64url');
  assert.throws(() => getCalendarPurchase(purchase.id, wrong), errorStatus(401));
  assert.throws(
    () => requireCalendarPurchase(new Request('https://eujobs.example'), purchase.id),
    errorStatus(401),
  );
  await assert.rejects(
    () => continueCalendarCheckout(purchase.id, wrong, stripe),
    errorStatus(401),
  );
  await assert.rejects(
    () => reconcileCalendarPurchase(purchase.id, wrong, undefined, stripe),
    errorStatus(401),
  );
  await assert.rejects(
    () => downloadCalendarPurchase(purchase.id, wrong, stripe),
    errorStatus(401),
  );
  await assert.rejects(
    () => createCalendarPurchase({ ...input, requestToken: wrong }, stripe),
    errorStatus(401),
  );
  const request = new Request('https://eujobs.example', {
    headers: { cookie: `${calendarCookieName(purchase.id)}=${input.requestToken}` },
  });
  assert.equal(requireCalendarPurchase(request, purchase.id).purchase.id, purchase.id);
  assert.ok(
    !JSON.stringify(getCalendarPurchase(purchase.id, input.requestToken)).includes('tokenHash'),
  );
  await assert.rejects(
    () =>
      reconcileCalendarPurchase(purchase.id, input.requestToken, 'cs_test_someone_else', stripe),
    errorStatus(404),
  );
  assert.equal(stripe.retrieveCalls.length, 0);
});

test('lost create responses retry the same reservation and idempotency key without rebuilding the snapshot', async () => {
  const { db, input, event } = setup(),
    stripe = new FakeStripe();
  stripe.loseNextResponse = true;
  await assert.rejects(() => createCalendarPurchase(input, stripe), /Simulated lost/);
  const before = db.prepare('SELECT eventSnapshot,snapshotHash FROM calendar_orders').get();
  db.prepare("UPDATE listings SET title=?,status='closed' WHERE id=?").run(
    'Changed after reservation',
    event.id,
  );
  const purchase = await createCalendarPurchase(input, stripe);
  assert.equal(purchase.status, 'open');
  assert.equal(stripe.keys.size, 1);
  assert.equal(stripe.calls[0].key, stripe.calls[1].key);
  assert.deepEqual(
    db.prepare('SELECT eventSnapshot,snapshotHash FROM calendar_orders').get(),
    before,
  );
  db.prepare(
    "UPDATE calendar_orders SET sessionId=NULL,createdAt='2020-01-01T00:00:00Z' WHERE id=?",
  ).run(purchase.id);
  const calls = stripe.calls.length;
  await assert.rejects(
    () => continueCalendarCheckout(purchase.id, input.requestToken, stripe),
    errorStatus(409),
  );
  assert.equal(stripe.calls.length, calls);
});

test('unpaid redirects and mismatched Stripe proofs cannot authorize download', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  const unpaid = await reconcileCalendarPurchase(
    purchase.id,
    input.requestToken,
    undefined,
    stripe,
  );
  assert.equal(unpaid.status, 'open');
  await assert.rejects(
    () => downloadCalendarPurchase(purchase.id, input.requestToken, stripe),
    errorStatus(402),
  );
  const session = stripe.paid(),
    originals = structuredClone(session);
  for (const field of ['amount_total', 'currency', 'client_reference_id', 'mode'] as const) {
    Object.assign(session, originals, { [field]: field === 'amount_total' ? 1 : 'wrong' });
    await assert.rejects(
      () => reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe),
      errorStatus(409),
    );
    assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'open');
  }
  Object.assign(session, originals, { metadata: { ...originals.metadata, snapshotHash: 'wrong' } });
  await assert.rejects(
    () => reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe),
    errorStatus(409),
  );
  Object.assign(session, originals);
  (session.payment_intent as Stripe.PaymentIntent).metadata.eujobsCalendarOrderId = 'wrong';
  await assert.rejects(
    () => reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe),
    errorStatus(409),
  );
});

test('confirmed payment delivers the immutable calendar once per entitlement without mutating jobs and queues idempotent recovery mail', async () => {
  const { input, event, db, job } = setup(),
    stripe = new FakeStripe();
  const beforeJobs = store.getListingById(job.id),
    beforeAudit = db.prepare('SELECT * FROM audit ORDER BY id').all();
  const purchase = await createCalendarPurchase(input, stripe),
    session = stripe.paid();
  const eventData = webhook('checkout.session.completed', session);
  assert.equal(await handleCalendarStripeEvent(eventData, stripe), true);
  const paidAt = getCalendarPurchase(purchase.id, input.requestToken).paidAt;
  await handleCalendarStripeEvent(eventData, stripe);
  await handleCalendarStripeEvent(webhook('checkout.session.completed', session), stripe);
  assert.equal(getCalendarPurchase(purchase.id, input.requestToken).paidAt, paidAt);
  assert.equal(db.prepare('SELECT count(*) AS n FROM calendar_stripe_events').get()?.n, 2);
  db.prepare(
    "UPDATE listings SET title='Later changed event',description='Changed details',status='closed' WHERE id=?",
  ).run(event.id);
  const downloaded = await downloadCalendarPurchase(purchase.id, input.requestToken, stripe);
  assert.match(downloaded.calendar, /SUMMARY:Calendar policy conference/);
  assert.ok(!downloaded.calendar.includes('Later changed event'));
  assert.equal(downloaded.filename, `eujobs-month-${input.month}.ics`);
  assert.equal((downloaded.calendar.match(/BEGIN:VCALENDAR/g) || []).length, 1);
  assert.equal((downloaded.calendar.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.deepEqual(store.getListingById(job.id), beforeJobs);
  assert.deepEqual(db.prepare('SELECT * FROM audit ORDER BY id').all(), beforeAudit);
  assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get()?.n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM stripe_events').get()?.n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM email_outbox').get()?.n, 2);
  assert.equal(
    await handleCalendarStripeEvent(
      webhook('checkout.session.completed', { metadata: { eujobsOrderId: 'a-job-order' } }),
      stripe,
    ),
    false,
  );
});

test('full refunds before payment confirmation are terminal and duplicate/out-of-order callbacks never restore access', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe),
    session = stripe.paid();
  const charge = stripe.charge(),
    event = webhook('charge.refunded', { ...charge, refunded: true, amount_refunded: 1000 });
  await handleCalendarStripeEvent(event, stripe);
  await handleCalendarStripeEvent(event, stripe);
  assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'refunded');
  await handleCalendarStripeEvent(webhook('checkout.session.completed', session), stripe);
  assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'refunded');
  await assert.rejects(
    () => downloadCalendarPurchase(purchase.id, input.requestToken, stripe),
    errorStatus(403),
  );
  assert.equal(
    (await continueCalendarCheckout(purchase.id, input.requestToken, stripe)).checkoutUrl,
    null,
  );
  assert.equal(stripe.keys.size, 1);
});

test('downloads verify current Stripe refund state even when a refund webhook was missed', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  stripe.paid();
  await reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe);
  stripe.charge().refunded = true;
  stripe.charge().amount_refunded = 1000;
  await assert.rejects(
    () => downloadCalendarPurchase(purchase.id, input.requestToken, stripe),
    errorStatus(403),
  );
  assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'refunded');
});

test('unrelated refund references fail closed and partial refunds do not revoke the purchased snapshot', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  stripe.paid();
  await reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe);
  const charge = stripe.charge();
  await assert.rejects(
    () =>
      handleCalendarStripeEvent(
        webhook('charge.refunded', {
          ...charge,
          payment_intent: 'pi_unrelated',
          refunded: true,
          amount_refunded: 1000,
        }),
        stripe,
      ),
    errorStatus(409),
  );
  await assert.rejects(
    () =>
      handleCalendarStripeEvent(
        webhook('charge.refunded', {
          ...charge,
          currency: 'usd',
          refunded: true,
          amount_refunded: 1000,
        }),
        stripe,
      ),
    errorStatus(409),
  );
  assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'paid');
  charge.amount_refunded = 100;
  await handleCalendarStripeEvent(webhook('charge.refunded', charge), stripe);
  assert.ok((await downloadCalendarPurchase(purchase.id, input.requestToken, stripe)).calendar);
});

test('delayed expiration cannot replace a paid session; expired checkouts cannot create another charge', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  const oldSnapshot = structuredClone(stripe.session());
  stripe.paid();
  await handleCalendarStripeEvent(
    webhook('checkout.session.expired', { ...oldSnapshot, status: 'expired' }),
    stripe,
  );
  assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'paid');
  const second = setup(),
    other = new FakeStripe(),
    expiredPurchase = await createCalendarPurchase(second.input, other);
  other.session().status = 'expired';
  await handleCalendarStripeEvent(webhook('checkout.session.expired', other.session()), other);
  const result = await continueCalendarCheckout(
    expiredPurchase.id,
    second.input.requestToken,
    other,
  );
  assert.equal(result.status, 'expired');
  assert.equal(result.checkoutUrl, null);
  assert.equal(other.keys.size, 1);
});

test('download refuses missing expanded charge proof and corrupted snapshot contents', async () => {
  const { input, db } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe),
    session = stripe.paid();
  const intent = session.payment_intent as Stripe.PaymentIntent;
  session.payment_intent = intent.id;
  await assert.rejects(
    () => downloadCalendarPurchase(purchase.id, input.requestToken, stripe),
    errorStatus(503),
  );
  session.payment_intent = intent;
  db.prepare("UPDATE calendar_orders SET calendarSnapshot='altered contents' WHERE id=?").run(
    purchase.id,
  );
  await assert.rejects(
    () => downloadCalendarPurchase(purchase.id, input.requestToken, stripe),
    errorStatus(503),
  );
});

test('API access uses same-origin token exchange and a scoped secure HttpOnly cookie; public status stays private', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  const context = { params: Promise.resolve({ id: purchase.id }) };
  const request = (origin: string, token = input.requestToken) =>
    new Request(`https://eujobs.example/api/calendar-purchases/${purchase.id}/access`, {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  assert.equal((await accessRoute(request('https://attacker.example'), context)).status, 403);
  assert.equal(
    (
      await accessRoute(
        request('https://eujobs.example', randomBytes(32).toString('base64url')),
        context,
      )
    ).status,
    401,
  );
  const response = await accessRoute(request('https://eujobs.example'), context);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.ok(cookie.includes(`Path=/api/calendar-purchases/${purchase.id}`));
  assert.equal(
    (
      await statusRoute(
        new Request(`https://eujobs.example/api/calendar-purchases/${purchase.id}`),
        context,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await statusRoute(
        new Request(`https://eujobs.example/api/calendar-purchases/${purchase.id}`, {
          headers: { cookie: cookie.split(';')[0] },
        }),
        context,
      )
    ).status,
    200,
  );
  const crossSiteCreate = await createRoute(
    new Request('https://eujobs.example/api/calendar-purchases', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  assert.equal(crossSiteCreate.status, 403);
});

test('the existing signed webhook endpoint dispatches calendar refunds without entering job billing', async () => {
  const { input, db, job } = setup(),
    stripe = new FakeStripe();
  const beforeJob = store.getListingById(job.id),
    purchase = await createCalendarPurchase(input, stripe);
  stripe.paid();
  const event = webhook('charge.refunded', {
    ...stripe.charge(),
    refunded: true,
    amount_refunded: 1000,
  });
  const oldKey = process.env.STRIPE_SECRET_KEY,
    oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_local_calendar_fixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_calendar_fixture';
  try {
    const fixtureStripe = new Stripe(process.env.STRIPE_SECRET_KEY),
      body = JSON.stringify(event);
    const signature = fixtureStripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const request = (signature: string) =>
      new Request('https://eujobs.example/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body,
      });
    assert.equal((await stripeWebhookRoute(request('forged'))).status, 400);
    assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'open');
    assert.equal((await stripeWebhookRoute(request(signature))).status, 200);
    assert.equal(getCalendarPurchase(purchase.id, input.requestToken).status, 'refunded');
    assert.equal(db.prepare('SELECT count(*) AS n FROM calendar_stripe_events').get()?.n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM stripe_events').get()?.n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get()?.n, 0);
    assert.deepEqual(store.getListingById(job.id), beforeJob);
  } finally {
    if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
  }
});

test('paid private feed updates changed events, remembers cancellations and adds only purchased-month events', async () => {
  const { input, event, db, owner } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  stripe.paid();
  await reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe);
  const paid = getCalendarPurchase(purchase.id, input.requestToken);
  assert.equal(paid.currentCount, 1);
  assert.ok(paid.feedUrl);
  const feedToken = new URL(paid.feedUrl!).searchParams.get('token')!;
  assert.notEqual(feedToken, input.requestToken);
  assert.throws(() => getCalendarPurchase(purchase.id, feedToken), errorStatus(401));
  await assert.rejects(
    () => getCalendarFeed(purchase.id, input.requestToken, stripe),
    errorStatus(401),
  );
  let feed = await getCalendarFeed(purchase.id, feedToken, stripe);
  assert.match(feed.calendar, /STATUS:CONFIRMED/);
  assert.ok(feed.calendar.includes(`UID:${event.id}@eujobs`));
  db.prepare(
    "UPDATE listings SET title='Corrected conference title',version=version+1,updatedAt=? WHERE id=?",
  ).run(new Date(Date.now() + 1).toISOString(), event.id);
  feed = await getCalendarFeed(purchase.id, feedToken, stripe);
  assert.match(feed.calendar, /SUMMARY:Corrected conference title/);
  const updatedSequence = Number(feed.calendar.match(/SEQUENCE:(\d+)/)![1]);
  const addition = store.createListing(owner.id, {
    kind: 'event',
    title: 'Newly added monthly conference',
    organization: 'Policy Institute',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'A later addition to the monthly policy events calendar.',
    description:
      'This monthly conference brings researchers and policy practitioners together for discussions about European priorities and public participation.',
    startsAt: `${input.month}-15T09:00:00Z`,
    endsAt: `${input.month}-15T11:00:00Z`,
    timezone: 'Europe/Brussels',
    eventType: 'Conference',
    venue: 'Brussels',
    url: 'https://example.org/new-event',
    price: 0,
  });
  db.prepare("UPDATE listings SET status='published' WHERE id=?").run(addition.id);
  db.prepare("UPDATE listings SET status='closed' WHERE id=?").run(event.id);
  feed = await getCalendarFeed(purchase.id, feedToken, stripe);
  assert.equal((feed.calendar.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(feed.calendar, /SUMMARY:Newly added monthly conference/);
  assert.match(feed.calendar, /STATUS:CANCELLED/);
  assert.ok(feed.calendar.includes(`SEQUENCE:${updatedSequence + 1}`));
  const sameFeed = await getCalendarFeed(purchase.id, feedToken, stripe);
  assert.equal(
    sameFeed.calendar,
    feed.calendar,
    'unchanged polls preserve timestamps and sequence',
  );
  const google = await getAuthorizedCalendarEvents(purchase.id, input.requestToken, stripe);
  assert.equal(google.events.length, 1);
  assert.equal(google.events[0].id, addition.id);
  // Moving a once-delivered event outside the purchased month cancels its original entry.
  db.prepare(
    "UPDATE listings SET startsAt='2040-01-15T09:00:00Z',endsAt='2040-01-15T11:00:00Z',version=version+1 WHERE id=?",
  ).run(addition.id);
  feed = await getCalendarFeed(purchase.id, feedToken, stripe);
  assert.equal((feed.calendar.match(/STATUS:CANCELLED/g) || []).length, 2);
  assert.ok(!feed.calendar.includes('20400115'));
  assert.equal(
    (await getAuthorizedCalendarEvents(purchase.id, input.requestToken, stripe)).events.length,
    0,
  );
  assert.equal(
    getCalendarPurchase(purchase.id, input.requestToken).count,
    1,
    'purchase snapshot count immutable',
  );
  assert.equal(getCalendarPurchase(purchase.id, input.requestToken).currentCount, 0);
  stripe.charge().refunded = true;
  stripe.charge().amount_refunded = 1000;
  await assert.rejects(() => getCalendarFeed(purchase.id, feedToken, stripe), errorStatus(403));
  await assert.rejects(
    () => getAuthorizedCalendarEvents(purchase.id, input.requestToken, stripe),
    errorStatus(403),
  );
});

test('recovery emails have independent valid management links and fixed access lifetime at least a year beyond the month', async () => {
  const { input, db } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  const before = db.prepare('SELECT * FROM email_outbox').all();
  assert.equal(before.length, 1);
  assert.equal(before[0].recipient, input.email);
  assert.ok(String(before[0].text).includes(`#token=${input.requestToken}`));
  stripe.paid();
  await reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe);
  const paidMail = db
    .prepare('SELECT text FROM email_outbox WHERE idempotencyKey=?')
    .get(`calendar-paid:${purchase.id}`)!;
  const recoveryToken = String(paidMail.text).match(/#token=([A-Za-z0-9_-]{43})/)![1];
  assert.notEqual(recoveryToken, input.requestToken);
  const recovered = getCalendarPurchase(purchase.id, recoveryToken);
  assert.equal(recovered.status, 'paid');
  assert.ok(
    Date.parse(recovered.accessExpiresAt) >=
      Date.parse(`${recovered.monthEnd}T00:00:00Z`) + 365 * 86400000,
  );
  await downloadCalendarPurchase(purchase.id, recoveryToken, stripe);
  assert.equal(
    getCalendarPurchase(purchase.id, recoveryToken).accessExpiresAt,
    recovered.accessExpiresAt,
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM email_outbox').get()?.n, 2);
  db.prepare("UPDATE calendar_orders SET accessExpiresAt='2020-01-01T00:00:00Z' WHERE id=?").run(
    purchase.id,
  );
  assert.throws(() => getCalendarPurchase(purchase.id, recoveryToken), errorStatus(403));
});

test('browser success claims, unrelated feed tokens and expired links cannot open another month', async () => {
  const { input } = setup(),
    stripe = new FakeStripe();
  const purchase = await createCalendarPurchase(input, stripe);
  await assert.rejects(
    () => getAuthorizedCalendarEvents(purchase.id, input.requestToken, stripe),
    errorStatus(402),
  );
  stripe.paid();
  await reconcileCalendarPurchase(purchase.id, input.requestToken, undefined, stripe);
  const feed = new URL(
    getCalendarPurchase(purchase.id, input.requestToken).feedUrl!,
  ).searchParams.get('token')!;
  await assert.rejects(() => getCalendarFeed(randomUUID(), feed, stripe), errorStatus(401));
  await assert.rejects(
    () => createCalendarPurchase({ ...input, email: 'another@example.org' }, stripe),
    errorStatus(409),
  );
});
