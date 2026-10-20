import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../src/lib/store';
import { createCalendarPurchase, reconcileCalendarPurchase } from '../src/lib/calendar-billing';
import { currentCalendarMonth, shiftMonth } from '../src/lib/monthly-calendar';
import { FakeCalendarStripe } from './fixtures/calendar-stripe';
import {
  beginGoogleCalendarConnection,
  completeGoogleCalendarConnection,
  getGoogleCalendarStatus,
  googleCalendarConfigured,
  googleEventPayload,
  GoogleCalendarRequestError,
  GOOGLE_CALENDAR_SCOPE,
  syncGoogleCalendar,
  type GoogleCalendarProvider,
} from '../src/lib/google-calendar';

const dirs: string[] = [],
  databases: ReturnType<typeof store.getDb>[] = [];
after(() => {
  for (const db of databases) db.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
class FakeGoogle implements GoogleCalendarProvider {
  subject = 'google-subject-original';
  exchanged = 0;
  creates = 0;
  inserts = 0;
  updates = 0;
  removals = 0;
  scope = `openid ${GOOGLE_CALENDAR_SCOPE}`;
  token = 'fixture-access-token-never-real';
  createFailure: number | null = null;
  loseNextInsert = false;
  calendar = new Map<string, Record<string, unknown>>();
  async exchange(_code: string, verifier: string) {
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
    this.exchanged++;
    return { accessToken: this.token, expiresIn: 3600, scope: this.scope };
  }
  async identity() {
    return this.subject;
  }
  async createCalendar(_token: string, name: string) {
    assert.match(name, /^EUJobs — /);
    this.creates++;
    if (this.createFailure !== null) throw new GoogleCalendarRequestError(this.createFailure);
    return 'dedicated-calendar@group.calendar.google.com';
  }
  async insertEvent(_token: string, calendar: string, event: Record<string, unknown>) {
    assert.notEqual(calendar, 'primary');
    this.inserts++;
    if (this.calendar.has(String(event.id))) throw new GoogleCalendarRequestError(409);
    this.calendar.set(String(event.id), event);
    if (this.loseNextInsert) {
      this.loseNextInsert = false;
      throw new GoogleCalendarRequestError(0);
    }
  }
  async updateEvent(_token: string, _calendar: string, id: string, event: Record<string, unknown>) {
    this.updates++;
    this.calendar.set(id, event);
  }
  async removeEvent(_token: string, _calendar: string, id: string) {
    this.removals++;
    this.calendar.delete(id);
  }
}
async function setup(paid = true) {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'eujobs-google-calendar-'));
  dirs.push(process.env.DATA_DIR);
  process.env.APP_ORIGIN = 'https://eujobs.example';
  process.env.EUJOBS_SEED = '0';
  process.env.GOOGLE_CALENDAR_ENABLED = '1';
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'fixture-client';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'fixture-secret';
  process.env.CALENDAR_TOKEN_KEY = randomBytes(32).toString('base64');
  const db = store.getDb();
  databases.push(db);
  const owner = store.createUser({
    name: 'Fixture Owner',
    email: `${randomUUID()}@example.org`,
    passwordHash: 'domain-test-password-hash-only',
  });
  const month = shiftMonth(currentCalendarMonth(), 1);
  const listing = store.createListing(owner.id, {
    kind: 'event',
    title: 'European policy calendar conference',
    organization: 'Policy Institute',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Independent policy discussions for researchers and the public.',
    description:
      'An independent European policy conference bringing together researchers, civil society and practitioners to discuss policy priorities and future opportunities.',
    startsAt: `${month}-03T09:00:00Z`,
    endsAt: `${month}-03T11:00:00Z`,
    timezone: 'Europe/Brussels',
    eventType: 'Conference',
    venue: 'Brussels conference hall',
    url: 'https://example.org/register',
    price: 0,
  });
  db.prepare("UPDATE listings SET status='published',publishedAt=? WHERE id=?").run(
    new Date().toISOString(),
    listing.id,
  );
  const token = randomBytes(32).toString('base64url'),
    billing = new FakeCalendarStripe(),
    google = new FakeGoogle();
  const purchase = await createCalendarPurchase(
    { month, email: 'buyer@example.org', requestId: randomUUID(), requestToken: token },
    billing,
  );
  if (paid) {
    billing.paid();
    await reconcileCalendarPurchase(purchase.id, token, undefined, billing);
  }
  return {
    db,
    listing: store.getListingById(listing.id)!,
    purchase,
    token,
    billing,
    google,
    deps: { billing, google },
  };
}
async function connect(fixture: Awaited<ReturnType<typeof setup>>) {
  const start = await beginGoogleCalendarConnection(
    fixture.purchase.id,
    fixture.token,
    fixture.billing,
  );
  const state = new URL(start.url).searchParams.get('state')!;
  return {
    start,
    state,
    result: await completeGoogleCalendarConnection(
      state,
      start.browserToken,
      'fixture-code',
      fixture.deps,
    ),
  };
}
test('Google configuration is explicitly gated and invalid encryption keys fail closed', async () => {
  const f = await setup();
  assert.equal(googleCalendarConfigured(), true);
  process.env.GOOGLE_CALENDAR_ENABLED = '0';
  assert.equal(googleCalendarConfigured(), false);
  await assert.rejects(
    () => beginGoogleCalendarConnection(f.purchase.id, f.token, f.billing),
    /not available/,
  );
  process.env.GOOGLE_CALENDAR_ENABLED = '1';
  process.env.CALENDAR_TOKEN_KEY = 'not-a-key';
  assert.equal(googleCalendarConfigured(), false);
});
test('OAuth requires a verified paid purchase and uses narrow consent, PKCE, encrypted browser-bound single-use state', async () => {
  const f = await setup(false);
  await assert.rejects(() => beginGoogleCalendarConnection(f.purchase.id, f.token, f.billing));
  f.billing.paid();
  await reconcileCalendarPurchase(f.purchase.id, f.token, undefined, f.billing);
  const start = await beginGoogleCalendarConnection(f.purchase.id, f.token, f.billing),
    url = new URL(start.url),
    state = url.searchParams.get('state')!;
  assert.equal(url.searchParams.get('scope'), `openid ${GOOGLE_CALENDAR_SCOPE}`);
  assert.equal(url.searchParams.get('access_type'), 'online');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('code_challenge')!, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://eujobs.example/api/calendar/google/callback',
  );
  const row = JSON.stringify(f.db.prepare('SELECT * FROM google_calendar_states').get());
  for (const secret of [f.token, start.browserToken, state]) assert.ok(!row.includes(secret));
  await assert.rejects(() =>
    completeGoogleCalendarConnection(state, randomBytes(32).toString('base64url'), 'code', f.deps),
  );
  assert.equal(f.google.exchanged, 0);
  assert.equal(
    (await completeGoogleCalendarConnection(state, start.browserToken, 'code', f.deps)).connected,
    true,
  );
  await assert.rejects(() =>
    completeGoogleCalendarConnection(state, start.browserToken, 'code', f.deps),
  );
  assert.equal(f.google.exchanged, 1);
  assert.ok(
    !JSON.stringify(f.db.prepare('SELECT * FROM google_calendar_connections').get()).includes(
      f.google.token,
    ),
  );
});
test('cancelled or expired consent never reaches Google; missing scope is rejected', async () => {
  const f = await setup();
  let start = await beginGoogleCalendarConnection(f.purchase.id, f.token, f.billing);
  assert.equal(
    (
      await completeGoogleCalendarConnection(
        new URL(start.url).searchParams.get('state'),
        start.browserToken,
        null,
        f.deps,
      )
    ).connected,
    false,
  );
  assert.equal(f.google.exchanged, 0);
  start = await beginGoogleCalendarConnection(f.purchase.id, f.token, f.billing);
  f.db.prepare('UPDATE google_calendar_states SET expiresAt=0').run();
  await assert.rejects(() =>
    completeGoogleCalendarConnection(
      new URL(start.url).searchParams.get('state'),
      start.browserToken,
      'code',
      f.deps,
    ),
  );
  f.google.scope = 'openid';
  assert.equal((await connect(f)).result.connected, false);
  assert.equal(f.google.creates, 0);
});
test('sync uses one dedicated calendar, stable event IDs, skips unchanged records and applies changes/removals', async () => {
  const f = await setup();
  assert.equal((await connect(f)).result.connected, true);
  assert.equal(f.google.creates, 1);
  assert.equal(f.google.calendar.size, 1);
  assert.match([...f.google.calendar.keys()][0], /^[a-v0-9]{5,1024}$/);
  const unchanged = await syncGoogleCalendar(f.purchase.id, f.token, f.deps);
  assert.equal(unchanged.added, 0);
  assert.equal(unchanged.updated, 0);
  assert.equal(f.google.creates, 1);
  f.db
    .prepare('UPDATE listings SET title=? WHERE id=?')
    .run('Updated policy conference title', f.listing.id);
  assert.equal((await syncGoogleCalendar(f.purchase.id, f.token, f.deps)).updated, 1);
  assert.equal(f.google.calendar.size, 1);
  f.db.prepare("UPDATE listings SET status='closed' WHERE id=?").run(f.listing.id);
  assert.equal((await syncGoogleCalendar(f.purchase.id, f.token, f.deps)).count, 0);
  assert.equal(f.google.removals, 1);
  assert.equal(getGoogleCalendarStatus(f.purchase.id).syncedCount, 0);
});
test('a lost event-insert response retries the deterministic ID without duplicating the calendar or event', async () => {
  const f = await setup();
  f.google.loseNextInsert = true;
  assert.equal((await connect(f)).result.connected, false);
  assert.equal(f.google.calendar.size, 1);
  assert.equal(getGoogleCalendarStatus(f.purchase.id).syncedCount, 0);
  const retried = await syncGoogleCalendar(f.purchase.id, f.token, f.deps);
  assert.equal(retried.updated, 1);
  assert.equal(retried.count, 1);
  assert.equal(f.google.calendar.size, 1);
  assert.equal(f.google.creates, 1);
});
test('uncertain calendar creation blocks retries, while definitive rejection allows a safe retry', async () => {
  const f = await setup();
  f.google.createFailure = 0;
  assert.equal((await connect(f)).result.connected, false);
  assert.equal(getGoogleCalendarStatus(f.purchase.id).needsReview, true);
  f.google.createFailure = null;
  await assert.rejects(() => syncGoogleCalendar(f.purchase.id, f.token, f.deps), /needs review/);
  assert.equal(f.google.creates, 1);
  const g = await setup();
  g.google.createFailure = 429;
  assert.equal((await connect(g)).result.connected, false);
  assert.equal(getGoogleCalendarStatus(g.purchase.id).needsReview, false);
  g.google.createFailure = null;
  assert.equal((await syncGoogleCalendar(g.purchase.id, g.token, g.deps)).count, 1);
});
test('reconnection is pinned to the same Google account and expired tokens require fresh consent', async () => {
  const f = await setup();
  await connect(f);
  const original = f.db
    .prepare('SELECT subject,encryptedToken FROM google_calendar_connections')
    .get();
  f.google.subject = 'another-google-account';
  assert.equal((await connect(f)).result.connected, false);
  assert.deepEqual(
    f.db.prepare('SELECT subject,encryptedToken FROM google_calendar_connections').get(),
    original,
  );
  assert.equal(f.google.creates, 1);
  f.db.prepare('UPDATE google_calendar_connections SET tokenExpiresAt=0').run();
  assert.equal(getGoogleCalendarStatus(f.purchase.id).connected, false);
  await assert.rejects(() => syncGoogleCalendar(f.purchase.id, f.token, f.deps), /Reconnect/);
  f.google.subject = 'google-subject-original';
  assert.equal((await connect(f)).result.connected, true);
  assert.equal(f.google.creates, 1);
});
test('lease prevents simultaneous imports and refunds block Google writes', async () => {
  const f = await setup();
  await connect(f);
  f.db
    .prepare('UPDATE google_calendar_connections SET lease=?,leaseExpiresAt=?')
    .run('held', Date.now() + 60000);
  await assert.rejects(() => syncGoogleCalendar(f.purchase.id, f.token, f.deps), /wait/);
  f.db.prepare('UPDATE google_calendar_connections SET lease=NULL,leaseExpiresAt=0').run();
  f.billing.charge().refunded = true;
  f.billing.charge().amount_refunded = 1000;
  const writes = f.google.inserts + f.google.updates + f.google.removals;
  await assert.rejects(() => syncGoogleCalendar(f.purchase.id, f.token, f.deps));
  assert.equal(f.google.inserts + f.google.updates + f.google.removals, writes);
});
test('all-day dates remain local and timed events retain timezone without invitations or reminders', async () => {
  const f = await setup();
  const payload = googleEventPayload({
    ...f.listing,
    eventDateOnly: true,
    startsAt: '2026-10-24T22:00:00Z',
    endsAt: '2026-10-25T23:00:00Z',
  });
  assert.deepEqual(payload.start, { date: '2026-10-25' });
  assert.deepEqual(payload.end, { date: '2026-10-26' });
  assert.deepEqual(payload.reminders, { useDefault: false });
  assert.equal(payload.transparency, 'transparent');
  assert.ok(!('attendees' in payload));
  assert.match(payload.description, /does not book admission/);
  const timed = googleEventPayload(f.listing);
  assert.deepEqual(timed.start, { dateTime: f.listing.startsAt, timeZone: 'Europe/Brussels' });
});
