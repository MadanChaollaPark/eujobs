import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Stripe from 'stripe';
import * as store from '../src/lib/store';
import {
  authorizeGuest,
  createGuestPosting,
  getGuestPosting,
  guestCookieName,
} from '../src/lib/guest-posting';
import {
  applyPaidSession,
  createCheckout,
  listPayments,
  reconcileCheckout,
  type BillingProvider,
} from '../src/lib/billing';
import { hasJobEntitlement } from '../src/lib/plans';
import { processEmailOutbox } from '../src/lib/email';
import { POST as create } from '../src/app/api/guest-jobs/route';
import { GET as read, PATCH as edit, POST as access } from '../src/app/api/guest-jobs/[id]/route';
import { POST as checkout } from '../src/app/api/guest-jobs/[id]/checkout/route';
import { POST as payment } from '../src/app/api/guest-jobs/[id]/payment/route';

const fixtures: { db: ReturnType<typeof store.getDb>; directory: string }[] = [];
after(() => {
  for (const { db, directory } of fixtures) {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eujobs-guest-'));
  process.env.DATA_DIR = directory;
  process.env.EUJOBS_SEED = '0';
  process.env.APP_ORIGIN = 'https://eujobs.example';
  process.env.TRUST_PROXY = '1';
  process.env.EMAIL_DELIVERY_ENABLED = '0';
  delete process.env.EUJOBS_REQUIRE_PAYMENT;
  delete process.env.STRIPE_SECRET_KEY;
  const db = store.getDb();
  fixtures.push({ db, directory });
  return db;
}
const listingInput = {
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
};
function input(contactEmail = 'employer@example.org') {
  return {
    requestId: randomUUID(),
    requestToken: randomBytes(32).toString('base64url'),
    contactEmail,
    listing: { ...listingInput },
  };
}
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
function request(
  method: string,
  body?: unknown,
  cookie?: string,
  origin = 'https://eujobs.example',
) {
  return new Request('https://eujobs.example/api/guest-jobs', {
    method,
    headers: {
      origin,
      host: 'eujobs.example',
      'content-type': 'application/json',
      'x-forwarded-for': fixtures.at(-1)!.directory,
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function cookie(id: string, token: string) {
  return `${guestCookieName(id)}=${token}`;
}
function count(table: string) {
  return Number(store.getDb().prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
}
class FakeStripe implements BillingProvider {
  calls: Stripe.Checkout.SessionCreateParams[] = [];
  sessions = new Map<string, Stripe.Checkout.Session>();
  keys = new Map<string, Stripe.Checkout.Session>();
  async create(params: Stripe.Checkout.SessionCreateParams, key: string) {
    this.calls.push(params);
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
    assert(session);
    return session;
  }
  paid(id: string) {
    const session = this.sessions.get(id)!;
    session.status = 'complete';
    session.payment_status = 'paid';
    return session;
  }
}

test('guest creation isolates a contact matching an existing account and issues no normal session', async () => {
  const db = setup();
  const existing = store.createUser({
    name: 'Existing Employer',
    email: 'existing@example.org',
    passwordHash: 'existing-fixture-password-hash',
  });
  const body = input(existing.email);
  const response = await create(request('POST', body));
  assert.equal(response.status, 201);
  const result = await response.json();
  const listing = result.listing;
  assert.notEqual(listing.ownerId, existing.id);
  assert.equal(store.isGuestOwner(listing.ownerId), true);
  assert.match(store.findUserById(listing.ownerId)!.email, /^[a-f0-9]{64}@guest\.eujobs\.invalid$/);
  assert.equal(store.findUserByEmail(existing.email)!.id, existing.id);
  assert.equal(listing.status, 'draft');
  assert.equal(listing.paidAt, null);
  assert.equal(count('sessions'), 0);
  assert.equal(
    new URL(result.manageUrl, process.env.APP_ORIGIN).hash,
    `#token=${body.requestToken}`,
  );
  const headers = response.headers.get('set-cookie')!;
  assert.match(headers, /HttpOnly/);
  assert.match(headers, /Secure/);
  assert.match(headers, /SameSite=lax/);
  assert.match(headers, new RegExp(`Path=/api/guest-jobs/${listing.id}`));
  assert(!headers.includes('eujobs_session'));
  const stored =
    JSON.stringify(db.prepare('SELECT * FROM guest_postings').all()) +
    JSON.stringify(db.prepare('SELECT * FROM guest_management_tokens').all());
  assert(!stored.includes(body.requestToken));
  assert.equal(getGuestPosting(listing.id)!.contactEmail, existing.email);
});

test('replaying a lost create response returns one original draft and rejects changed credentials or input', async () => {
  setup();
  const body = input();
  const responses = await Promise.all([
    create(request('POST', body)),
    create(request('POST', body)),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  const [a, b] = await Promise.all(responses.map((r) => r.json()));
  assert.equal(a.listing.id, b.listing.id);
  assert.equal(a.manageUrl, b.manageUrl);
  assert.equal(count('users'), 1);
  assert.equal(count('listings'), 1);
  assert.equal(count('guest_management_tokens'), 1);
  for (const patch of [
    { requestToken: randomBytes(32).toString('base64url') },
    { contactEmail: 'changed@example.org' },
    { listing: { ...body.listing, title: 'Changed policy role' } },
  ])
    assert.equal((await create(request('POST', { ...body, ...patch }))).status, 409);
  assert.equal(count('listings'), 1);
});

test('failed guest record insertion rolls back owner, organization, draft and audit together', () => {
  const db = setup();
  db.exec(
    "CREATE TRIGGER fail_guest BEFORE INSERT ON guest_postings BEGIN SELECT RAISE(ABORT,'fixture failure'); END;",
  );
  assert.throws(() => createGuestPosting(input()), /fixture failure/);
  for (const table of [
    'users',
    'organizations',
    'listings',
    'audit',
    'guest_postings',
    'guest_management_tokens',
  ])
    assert.equal(count(table), 0);
});

test('management credentials grant access to exactly one job and never another guest or account job', async () => {
  setup();
  const a = input(),
    b = input(),
    first = createGuestPosting(a),
    second = createGuestPosting(b);
  const validCookie = cookie(first.listing.id, a.requestToken);
  const own = await read(request('GET', undefined, validCookie), context(first.listing.id));
  assert.equal(own.status, 200);
  const data = await own.json();
  assert.deepEqual(Object.keys(data).sort(), ['contactEmail', 'expiresAt', 'listing', 'payments']);
  assert.equal(data.contactEmail, a.contactEmail);
  const forgedCookie = cookie(second.listing.id, a.requestToken);
  for (const handler of [read, checkout, payment]) {
    const req =
      handler === read
        ? request('GET', undefined, forgedCookie)
        : request('POST', { plan: 'basic', sessionId: 'cs_test_other' }, forgedCookie);
    assert.equal((await handler(req, context(second.listing.id))).status, 401);
  }
  assert.equal(
    (
      await edit(
        request(
          'PATCH',
          { action: 'save', version: 1, title: 'Unauthorized change' },
          forgedCookie,
        ),
        context(second.listing.id),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await access(
        request('POST', { action: 'access', token: a.requestToken }),
        context(second.listing.id),
      )
    ).status,
    401,
  );
  assert.equal(store.getListingById(second.listing.id)!.version, 1);
  const owner = store.createUser({
    name: 'Member Owner',
    email: 'member@example.org',
    passwordHash: 'member-fixture-password-hash',
  });
  const regular = store.createListing(owner.id, listingInput);
  assert.equal(
    (await read(request('GET', undefined, cookie(regular.id, a.requestToken)), context(regular.id)))
      .status,
    401,
  );
});

test('fragment token access sets only a scoped cookie; missing, revoked, expired and malformed tokens fail', async () => {
  const db = setup();
  const body = input(),
    result = createGuestPosting(body),
    id = result.listing.id;
  assert.equal((await read(request('GET'), context(id))).status, 401);
  const response = await access(
    request('POST', { action: 'access', token: body.requestToken }),
    context(id),
  );
  assert.equal(response.status, 200);
  assert(response.headers.get('set-cookie')!.startsWith(`${guestCookieName(id)}=`));
  assert(!JSON.stringify(await response.json()).includes(body.requestToken));
  assert.throws(() => authorizeGuest(id, 'a'.repeat(43)), { status: 401 });
  db.prepare(
    "UPDATE guest_management_tokens SET expiresAt='2000-01-01T00:00:00.000Z' WHERE listingId=?",
  ).run(id);
  assert.throws(() => authorizeGuest(id, body.requestToken), { status: 401 });
  db.prepare('UPDATE guest_management_tokens SET expiresAt=? WHERE listingId=?').run(
    result.expiresAt,
    id,
  );
  db.prepare(
    "UPDATE guest_postings SET expiresAt='2000-01-01T00:00:00.000Z' WHERE listingId=?",
  ).run(id);
  assert.throws(() => authorizeGuest(id, body.requestToken), { status: 401 });
});

test('guest endpoints reject cross-origin actions, events and protected field overposting', async () => {
  setup();
  const body = input();
  assert.equal(
    (await create(request('POST', body, undefined, 'https://attacker.example'))).status,
    403,
  );
  assert.equal(count('listings'), 0);
  for (const extra of [
    { status: 'published' },
    { ownerId: randomUUID() },
    { paidAt: new Date().toISOString() },
    { publicationOrigin: 'editorial' },
  ]) {
    assert.equal(
      (await create(request('POST', { ...body, listing: { ...body.listing, ...extra } }))).status,
      400,
    );
  }
  assert.equal(
    (
      await create(
        request('POST', {
          ...body,
          listing: {
            ...body.listing,
            kind: 'event',
            eventType: 'Webinar',
            startsAt: '2028-01-01T10:00:00Z',
            endsAt: '2028-01-01T11:00:00Z',
          },
        }),
      )
    ).status,
    400,
  );
  const result = createGuestPosting(body),
    id = result.listing.id,
    auth = cookie(id, body.requestToken);
  assert.equal(
    (await edit(request('PATCH', { action: 'approve', version: 1 }, auth), context(id))).status,
    400,
  );
  assert.equal(
    (
      await edit(
        request('PATCH', { action: 'save', version: 1, paidAt: new Date().toISOString() }, auth),
        context(id),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await edit(
        request('PATCH', { action: 'submit', version: 1, publicationOrigin: 'editorial' }, auth),
        context(id),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await edit(
        request(
          'PATCH',
          { action: 'save', version: 1, title: 'Updated Policy Analyst' },
          auth,
          'https://attacker.example',
        ),
        context(id),
      )
    ).status,
    403,
  );
  assert.equal(store.getListingById(id)!.version, 1);
});

test('guest drafts can be edited, but both submit and approval still require actual payment', async () => {
  const db = setup();
  const body = input(),
    result = createGuestPosting(body),
    id = result.listing.id,
    auth = cookie(id, body.requestToken);
  const saved = await edit(
    request('PATCH', { action: 'save', version: 1, title: 'Senior Policy Analyst' }, auth),
    context(id),
  );
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).listing.version, 2);
  assert.equal(
    (await edit(request('PATCH', { action: 'submit', version: 2 }, auth), context(id))).status,
    402,
  );
  assert.equal(
    (
      await edit(
        request('PATCH', { action: 'save', version: 1, title: 'Stale update title' }, auth),
        context(id),
      )
    ).status,
    409,
  );
  assert.equal(hasJobEntitlement(store.getListingById(id)!), false);
  const admin = store.createUser({
    name: 'Moderator',
    email: 'admin@example.org',
    passwordHash: 'admin-fixture-password-hash',
    role: 'admin',
  });
  db.prepare("UPDATE listings SET status='pending' WHERE id=?").run(id);
  assert.throws(() => store.transitionListing(id, admin.id, 'admin', 2, 'approve'), {
    status: 402,
  });
});

test('guest Stripe checkout uses real contact, unchanged prices and secret-free management return URLs', async () => {
  setup();
  const body = input(),
    result = createGuestPosting(body),
    stripe = new FakeStripe();
  const a = await createCheckout(result.listing.ownerId!, result.listing.id, 'basic', stripe);
  const b = await createCheckout(result.listing.ownerId!, result.listing.id, 'basic', stripe);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal(stripe.calls.length, 1);
  const params = stripe.calls[0];
  assert.equal(params.customer_email, body.contactEmail);
  assert.equal(params.line_items![0].price_data!.unit_amount, 9999);
  assert.equal(params.line_items![0].price_data!.currency, 'eur');
  assert.equal(
    params.success_url,
    `https://eujobs.example/manage-job/${result.listing.id}?session_id={CHECKOUT_SESSION_ID}`,
  );
  assert.equal(
    params.cancel_url,
    `https://eujobs.example/manage-job/${result.listing.id}?checkout=cancelled`,
  );
  assert(!JSON.stringify(params).includes(body.requestToken));
  assert(!JSON.stringify(params).includes('@guest.eujobs.invalid'));
  const unpaid = await reconcileCheckout(result.listing.ownerId!, a.sessionId, stripe);
  assert.equal(unpaid.listing!.status, 'draft');
  assert.equal(unpaid.order!.status, 'open');
  assert.equal(hasJobEntitlement(unpaid.listing!), false);
});

test('confirmed guest payment queues one private management email, preserves original token and still needs moderation', async () => {
  const db = setup();
  const body = input(),
    result = createGuestPosting(body),
    stripe = new FakeStripe();
  const checkout = await createCheckout(result.listing.ownerId!, result.listing.id, 'pro', stripe);
  const paid = stripe.paid(checkout.sessionId);
  applyPaidSession(paid, { id: 'evt_guest_paid', type: 'checkout.session.completed' });
  applyPaidSession(paid, { id: 'evt_guest_paid_again', type: 'checkout.session.completed' });
  const updated = store.getListingById(result.listing.id)!;
  assert.equal(updated.status, 'pending');
  assert.equal(hasJobEntitlement(updated), true);
  assert.equal(updated.planId, 'pro');
  assert.equal(count('email_outbox'), 1);
  assert.equal(count('guest_management_tokens'), 2);
  const email = db.prepare('SELECT * FROM email_outbox').get()!;
  assert.equal(email.recipient, body.contactEmail);
  assert.equal(email.status, 'pending');
  assert.equal(
    email.idempotencyKey,
    `guest-payment:${listPayments(result.listing.ownerId!)[0].id}`,
  );
  const link = String(email.text)
    .split(/\s+/)
    .find((word) => word.startsWith('https://eujobs.example/'))!;
  const url = new URL(link),
    secondToken = new URLSearchParams(url.hash.slice(1)).get('token')!;
  assert.equal(url.search, '');
  assert.notEqual(secondToken, body.requestToken);
  assert.equal(authorizeGuest(result.listing.id, secondToken).listing.id, result.listing.id);
  assert.equal(authorizeGuest(result.listing.id, body.requestToken).listing.id, result.listing.id);
  assert.equal(email.expiresAt, Date.parse(getGuestPosting(result.listing.id)!.expiresAt));
  assert.equal((await processEmailOutbox()).disabled, true); // unconfigured email never loses the paid entitlement
  let calls = 0;
  await processEmailOutbox({
    deliver: async (message) => {
      calls++;
      assert.equal(message.to, body.contactEmail);
      return 'fake-provider-id';
    },
  });
  await processEmailOutbox({
    deliver: async () => {
      calls++;
      return 'unexpected';
    },
  });
  assert.equal(calls, 1);
  assert.equal(db.prepare('SELECT status FROM email_outbox').get()!.status, 'sent');
});

test('guest payment confirmation rejects foreign sessions, and modified payment totals grant nothing or email', async () => {
  setup();
  const a = input(),
    b = input(),
    first = createGuestPosting(a),
    second = createGuestPosting(b),
    stripe = new FakeStripe();
  const otherCheckout = await createCheckout(
    second.listing.ownerId!,
    second.listing.id,
    'recruiter',
    stripe,
  );
  const response = await payment(
    request(
      'POST',
      { sessionId: otherCheckout.sessionId },
      cookie(first.listing.id, a.requestToken),
    ),
    context(first.listing.id),
  );
  assert.equal(response.status, 404);
  const invalid = { ...stripe.paid(otherCheckout.sessionId), amount_total: 1 };
  assert.throws(() => applyPaidSession(invalid), { status: 409 });
  assert.equal(hasJobEntitlement(store.getListingById(second.listing.id)!), false);
  assert.equal(count('email_outbox'), 0);
  assert.equal(count('guest_management_tokens'), 2);
});

test('verified delayed payment renews expired management access for120days; reads and duplicate payments do not extend it', async () => {
  const db = setup(),
    body = input(),
    result = createGuestPosting(body),
    stripe = new FakeStripe();
  const checkout = await createCheckout(
    result.listing.ownerId!,
    result.listing.id,
    'basic',
    stripe,
  );
  const beforeExpiry = new Date(Date.now() + 1000).toISOString();
  db.prepare('UPDATE guest_postings SET expiresAt=? WHERE listingId=?').run(
    beforeExpiry,
    result.listing.id,
  );
  db.prepare('UPDATE guest_management_tokens SET expiresAt=? WHERE listingId=?').run(
    beforeExpiry,
    result.listing.id,
  );
  await read(
    request('GET', undefined, cookie(result.listing.id, body.requestToken)),
    context(result.listing.id),
  );
  assert.equal(getGuestPosting(result.listing.id)!.expiresAt, beforeExpiry);
  const oldExpiry = '2000-01-01T00:00:00.000Z';
  db.prepare('UPDATE guest_postings SET expiresAt=? WHERE listingId=?').run(
    oldExpiry,
    result.listing.id,
  );
  db.prepare('UPDATE guest_management_tokens SET expiresAt=? WHERE listingId=?').run(
    oldExpiry,
    result.listing.id,
  );
  assert.throws(() => authorizeGuest(result.listing.id, body.requestToken), { status: 401 });
  const started = Date.now();
  applyPaidSession(stripe.paid(checkout.sessionId));
  const renewed = getGuestPosting(result.listing.id)!.expiresAt;
  assert(Date.parse(renewed) >= started + 120 * 24 * 3600000);
  assert.equal(authorizeGuest(result.listing.id, body.requestToken).listing.status, 'pending');
  assert.equal(count('email_outbox'), 1);
  const response = await read(
    request('GET', undefined, cookie(result.listing.id, body.requestToken)),
    context(result.listing.id),
  );
  assert.equal(response.status, 200);
  const refreshedCookie = response.headers.get('set-cookie')!;
  const cookieExpiry = refreshedCookie.match(/(?:^|; )Expires=([^;]+)/i)?.[1];
  const maxAge = Number(refreshedCookie.match(/(?:^|; )Max-Age=(\d+)/i)?.[1]);
  assert(cookieExpiry);
  // Next recomputes Expires from integer Max-Age; HTTP dates also truncate
  // milliseconds, so it can serialize one second before the durable expiry.
  const expirySeconds = Math.floor(Date.parse(renewed) / 1000) * 1000;
  assert(Math.abs(Date.parse(cookieExpiry) - expirySeconds) <= 1000);
  assert(maxAge <= 120 * 24 * 3600 && maxAge >= 120 * 24 * 3600 - 2);
  applyPaidSession(stripe.paid(checkout.sessionId));
  assert.equal(getGuestPosting(result.listing.id)!.expiresAt, renewed);
  assert.equal(count('email_outbox'), 1);
  assert.equal(count('guest_management_tokens'), 2);
});
