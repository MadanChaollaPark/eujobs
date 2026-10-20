process.env.EUJOBS_REQUIRE_PAYMENT = '0';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  getRequestUser,
  hashSessionToken,
  createUserSession,
  SESSION_COOKIE,
} from '../src/lib/auth';
import {
  getDb,
  getSession,
  createSession,
  createUser,
  findUserByEmail,
  getListing,
  listContacts,
} from '../src/lib/store';
import { GET as authGet, POST as authPost } from '../src/app/api/auth/route';
import { POST as contactPost } from '../src/app/api/contact/route';
import { GET as savedGet, POST as savedPost } from '../src/app/api/saved/route';
import { POST as listingPost } from '../src/app/api/listings/route';
import { PATCH as listingPatch } from '../src/app/api/listings/[id]/route';
import { POST as searchPost, DELETE as searchDelete } from '../src/app/api/searches/route';
import { GET as calendarGet } from '../src/app/api/events/[slug]/calendar/route';
import { GET as healthGet } from '../src/app/api/health/route';
import { protectMutation, rateLimit, readJson, searchParams } from '../src/app/api/_shared';
import { eventCalendar, foldIcsLine } from '../src/app/api/events/[slug]/calendar/ics';
import type { Listing } from '../src/lib/types';

const directory = mkdtempSync(join(tmpdir(), 'eujobs-api-test-'));
process.env.DATA_DIR = directory;
process.env.EUJOBS_SEED = '0';
delete process.env.APP_ORIGIN;
delete process.env.TRUST_PROXY;
after(() => rmSync(directory, { recursive: true, force: true }));
const origin = 'http://localhost:3210';
function request(body: unknown, cookie?: string, pathname = '/api/auth') {
  return new Request(origin + pathname, {
    method: 'POST',
    headers: {
      origin,
      host: new URL(origin).host,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

test('password hashes have unique salts and reject incorrect and malformed credentials', async () => {
  const password = 'only-a-fixture-password-123';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect-password', first), false);
  assert.equal(await verifyPassword(password, 'scrypt$999999999$8$1$bad$bad'), false);
  await assert.rejects(hashPassword('short'));
});

test('registration, session rotation, expiry and logout enforce real sessions without disclosing hashes', async () => {
  const email = 'auth-fixture@example.invalid';
  const password = 'only-a-fixture-password-123';
  const registered = await authPost(
    request({ action: 'register', name: 'API Fixture', email, password, role: 'admin' }),
  );
  assert.equal(registered.status, 201);
  const body = await registered.json();
  assert.equal(body.user.role, 'member', 'registration must never accept an administrator role');
  assert.equal(body.user.passwordHash, undefined);
  const cookieHeader = registered.headers.get('set-cookie')!;
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=lax/i);
  const cookie = cookieHeader.split(';')[0];
  const token = cookie.slice(SESSION_COOKIE.length + 1);
  assert.equal(token.length, 43);
  assert.equal(
    getSession(token),
    null,
    'the bearer token itself must not be stored as a lookup key',
  );
  assert.equal(getSession(hashSessionToken(token))?.id, body.user.id);
  const profile = await authGet(new Request(origin + '/api/auth', { headers: { cookie } }));
  assert.equal((await profile.json()).user.id, body.user.id);
  const wrong = await authPost(request({ action: 'login', email, password: 'wrong-password' }));
  assert.equal(wrong.status, 401);
  const loggedIn = await authPost(request({ action: 'login', email, password }, cookie));
  assert.equal(loggedIn.status, 200);
  assert.equal(
    getSession(hashSessionToken(token)),
    null,
    'successful login rotates the previous session',
  );
  const newCookie = loggedIn.headers.get('set-cookie')!.split(';')[0];
  assert.notEqual(newCookie, cookie);
  const loggedOut = await authPost(request({ action: 'logout' }, newCookie));
  assert.equal(loggedOut.status, 200);
  assert.equal(getRequestUser(new Request(origin, { headers: { cookie: newCookie } })), null);
  const expiredHash = hashSessionToken('expired-test-fixture');
  createSession(expiredHash, body.user.id, new Date(Date.now() + 60_000).toISOString());
  getDb()
    .prepare('UPDATE sessions SET expiresAt=? WHERE tokenHash=?')
    .run(new Date(Date.now() - 1000).toISOString(), expiredHash);
  assert.equal(getSession(expiredHash), null);
  assert(findUserByEmail(email)?.passwordHash.startsWith('scrypt$'));
});

test('mutations reject foreign or absent Origin; reads and writes enforce authentication', async () => {
  assert.throws(
    () =>
      protectMutation(
        new Request(origin, { method: 'POST', headers: { origin: 'https://other.invalid' } }),
      ),
    { status: 403 },
  );
  assert.throws(() => protectMutation(new Request(origin, { method: 'POST' })), { status: 403 });
  assert.equal((await listingPost(request({}, undefined, '/api/listings'))).status, 401);
  assert.equal((await savedGet(new Request(origin + '/api/saved'))).status, 401);
  const crossOrigin = new Request(origin + '/api/auth', {
    method: 'POST',
    headers: { origin: 'https://other.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'logout' }),
  });
  assert.equal((await authPost(crossOrigin)).status, 403);
});

test('same-origin checks use HTTP Host when Next normalizes its internal URL', () => {
  const internal = 'http://localhost:3210/api/auth';
  const browserOrigin = 'http://127.0.0.1:3210';
  assert.doesNotThrow(() =>
    protectMutation(
      new Request(internal, {
        method: 'POST',
        headers: { host: '127.0.0.1:3210', origin: browserOrigin },
      }),
    ),
  );
  assert.throws(
    () =>
      protectMutation(
        new Request(internal, {
          method: 'POST',
          headers: { host: '127.0.0.1:3210', origin: 'https://other.invalid' },
        }),
      ),
    { status: 403 },
  );
  assert.throws(
    () =>
      protectMutation(
        new Request(internal, {
          method: 'POST',
          headers: {
            host: '127.0.0.1:3210',
            origin: 'https://other.invalid',
            'x-forwarded-host': 'other.invalid',
          },
        }),
      ),
    { status: 403 },
  );
  for (const host of [
    '',
    'localhost:3210/path',
    'user@localhost:3210',
    'localhost:3210,other.invalid',
    'localhost:999999',
    '\\other.invalid',
  ]) {
    assert.throws(
      () =>
        protectMutation(
          new Request(internal, { method: 'POST', headers: { host, origin: browserOrigin } }),
        ),
      { status: 403 },
    );
  }
  assert.throws(
    () =>
      protectMutation(
        new Request(internal, { method: 'POST', headers: { origin: browserOrigin } }),
      ),
    { status: 403 },
  );
  process.env.APP_ORIGIN = 'https://eujobs.example';
  try {
    assert.doesNotThrow(() =>
      protectMutation(
        new Request(internal, {
          method: 'POST',
          headers: { host: '127.0.0.1:3210', origin: 'https://eujobs.example' },
        }),
      ),
    );
    assert.throws(
      () =>
        protectMutation(
          new Request(internal, {
            method: 'POST',
            headers: { host: '127.0.0.1:3210', origin: browserOrigin },
          }),
        ),
      { status: 403 },
    );
  } finally {
    delete process.env.APP_ORIGIN;
  }
});

test('JSON and pagination limits fail explicitly and rate limits bound repeated requests', async () => {
  await assert.rejects(readJson(request({ text: 'x'.repeat(2000) }), 1000), { status: 413 });
  await assert.rejects(readJson(request([])), { status: 400 });
  assert.throws(() => searchParams(origin + '/api/listings?pageSize=999999'));
  assert.throws(() => searchParams(origin + '/api/listings?page=-1'));
  assert.throws(() => searchParams(origin + '/api/listings?salaryOnly=maybe'));
  assert.throws(() => searchParams(origin + '/api/listings?savedIds=private'));
  assert.equal(searchParams(origin + '/api/listings?kind=job&page=2&salaryOnly=true').page, 2);
  const key = 'fixture:' + randomUUID();
  rateLimit(key, 2, 60_000);
  rateLimit(key, 2, 60_000);
  assert.throws(() => rateLimit(key, 2, 60_000), { status: 429 });
});

test('contact acknowledgment follows persistence, and readiness checks the database', async () => {
  const reply = await contactPost(
    request(
      {
        name: 'Contact Fixture',
        email: 'contact-fixture@example.invalid',
        subject: 'A fixture question',
        message: 'This message exists only in an isolated test database.',
      },
      undefined,
      '/api/contact',
    ),
  );
  assert.equal(reply.status, 201);
  const body = await reply.json();
  assert.match(body.message, /saved/);
  assert(!/sent|email sent/i.test(body.message));
  assert.equal(
    listContacts().find((message) => message.id === body.reference)?.subject,
    'A fixture question',
  );
  assert.equal((await healthGet()).status, 200);
});

test('listing APIs enforce owner/admin roles, publication gates, version conflicts and private saved searches', async () => {
  const passwordHash = await hashPassword('only-a-fixture-password-123');
  const owner = createUser({ name: 'Listing Owner', email: 'owner@example.invalid', passwordHash });
  const other = createUser({ name: 'Other Member', email: 'other@example.invalid', passwordHash });
  const admin = createUser({
    name: 'Test Administrator',
    email: 'admin@example.invalid',
    passwordHash,
    role: 'admin',
  });
  const cookieFor = (id: string) => `${SESSION_COOKIE}=${createUserSession(id)}`;
  const ownerCookie = cookieFor(owner.id),
    otherCookie = cookieFor(other.id),
    adminCookie = cookieFor(admin.id);
  const fixture = {
    kind: 'job',
    title: 'Policy Analyst',
    organization: 'Example Policy Lab',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Research European policy and share accessible analysis.',
    description:
      'Research European policy across member states, prepare accessible briefings, and collaborate with an interdisciplinary team on clear recommendations.',
    employmentType: 'Permanent',
    seniority: 'Mid-level',
    workMode: 'Hybrid',
    url: 'https://example.org/apply',
  };
  const created = await listingPost(request(fixture, ownerCookie, '/api/listings'));
  assert.equal(created.status, 201);
  let listing = (await created.json()).listing;
  assert.equal(listing.status, 'draft');
  assert.equal(getListing(listing.slug), null);
  const mutate = (body: unknown, cookie: string) =>
    listingPatch(
      new Request(request(body, cookie, '/api/listings/' + listing.id), { method: 'PATCH' }),
      { params: Promise.resolve({ id: listing.id }) },
    );
  assert.equal(
    (
      await mutate(
        { action: 'save', version: listing.version, title: 'Unauthorized edit' },
        otherCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await savedPost(request({ listingId: listing.id }, otherCookie, '/api/saved'))).status,
    404,
  );
  const submitted = await mutate({ action: 'submit', version: listing.version }, ownerCookie);
  assert.equal(submitted.status, 200);
  listing = (await submitted.json()).listing;
  assert.equal(listing.status, 'pending');
  assert.equal(getListing(listing.slug), null);
  assert.equal(
    (await mutate({ action: 'approve', version: listing.version }, ownerCookie)).status,
    403,
  );
  const approved = await mutate({ action: 'approve', version: listing.version }, adminCookie);
  assert.equal(approved.status, 200);
  listing = (await approved.json()).listing;
  assert.equal(getListing(listing.slug)?.status, 'published');
  assert.equal(
    (await mutate({ action: 'save', version: 1, title: 'Stale update' }, ownerCookie)).status,
    409,
  );
  assert.equal(
    (await savedPost(request({ listingId: listing.id }, otherCookie, '/api/saved'))).status,
    200,
  );
  const saved = await savedGet(
    new Request(origin + '/api/saved', { headers: { cookie: otherCookie } }),
  );
  assert.deepEqual((await saved.json()).ids, [listing.id]);
  const edited = await mutate(
    { action: 'save', version: listing.version, title: 'Updated Policy Analyst' },
    ownerCookie,
  );
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).listing.status, 'draft');
  assert.equal(getListing(listing.slug), null, 'editing revokes publication');
  const search = await searchPost(
    request(
      { name: 'Policy positions', filters: { kind: 'job', topic: 'EU policy' } },
      ownerCookie,
      '/api/searches',
    ),
  );
  assert.equal(search.status, 201);
  const searchId = (await search.json()).search.id;
  const deletion = (cookie: string) =>
    searchDelete(
      new Request(origin + '/api/searches?id=' + searchId, {
        method: 'DELETE',
        headers: { origin, host: new URL(origin).host, cookie },
      }),
    );
  assert.equal((await deletion(otherCookie)).status, 404);
  assert.equal((await deletion(ownerCookie)).status, 200);

  const eventInput = {
    ...fixture,
    kind: 'event',
    title: 'Policy Event Fixture',
    employmentType: null,
    seniority: null,
    workMode: null,
    startsAt: new Date(Date.now() + 86400_000).toISOString(),
    endsAt: new Date(Date.now() + 90000_000).toISOString(),
    eventType: 'Panel discussion',
    venue: 'Example venue',
    price: 0,
  };
  const draftEvent = (
    await (await listingPost(request(eventInput, ownerCookie, '/api/listings'))).json()
  ).listing;
  assert(draftEvent.id);
  const hiddenCalendar = await calendarGet(
    new Request(origin + '/api/events/' + draftEvent.slug + '/calendar'),
    { params: Promise.resolve({ slug: draftEvent.slug }) },
  );
  assert.equal(
    hiddenCalendar.status,
    404,
    'calendar downloads must never expose pending or draft events',
  );
});

test('calendar output converts offsets to UTC and folds UTF-8 lines without splitting characters', () => {
  const event = {
    id: 'fixture-event',
    slug: 'fixture-calendar',
    kind: 'event',
    title: 'Policy, climate; café ' + '🌍'.repeat(50),
    description: 'First line\r\nSecond line; text, with \\ a slash',
    venue: 'Auditorium',
    location: 'Brussels',
    startsAt: '2027-03-29T10:00:00+02:00',
    endsAt: '2027-03-29T11:30:00+02:00',
    updatedAt: '2027-03-01T12:00:00.000Z',
    status: 'published',
    version: 4,
    isSample: true,
  } as Listing;
  const calendar = eventCalendar(event, origin);
  assert(calendar.includes('DTSTART:20270329T080000Z\r\n'));
  assert(calendar.includes('DTEND:20270329T093000Z\r\n'));
  const unfolded = calendar.replace(/\r\n /g, '');
  assert(unfolded.includes('SUMMARY:[Sample] Policy\\, climate\\; café'));
  assert(unfolded.includes('First line\\nSecond line\\; text\\, with \\\\ a slash'));
  assert(calendar.endsWith('END:VCALENDAR\r\n'));
  for (const line of calendar.split('\r\n')) assert(Buffer.byteLength(line, 'utf8') <= 75);
  const original = 'SUMMARY:' + 'é🌍'.repeat(80);
  assert.equal(foldIcsLine(original).replace(/\r\n /g, ''), original);
});
