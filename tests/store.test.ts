import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as store from '../src/lib/store';
import { createSampleListings } from '../src/lib/seed';
import type { User, Listing } from '../src/lib/types';

process.env.EUJOBS_REQUIRE_PAYMENT = '0';
const directories: string[] = [],
  databases: DatabaseSync[] = [];
function fresh(seed = false) {
  const dir = mkdtempSync(join(tmpdir(), 'eujobs-store-'));
  directories.push(dir);
  process.env.DATA_DIR = dir;
  process.env.EUJOBS_SEED = seed ? '1' : '0';
  const db = store.getDb();
  databases.push(db);
  return { dir, db };
}
after(() => {
  for (const db of databases) db.close();
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});
const day = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
function user(name = 'Member User', role: User['role'] = 'member') {
  return store.createUser({
    name,
    email: `${randomBytes(6).toString('hex')}@example.org`,
    passwordHash: 'scrypt$example-hash-for-domain-tests',
    role,
  });
}
function job(overrides: Record<string, unknown> = {}) {
  return {
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
    deadline: day(20),
    ...overrides,
  };
}
function event(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'event',
    title: 'European Policy Exchange',
    organization: 'Example Policy Lab',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Meet peers for a thoughtful exchange on European policy.',
    description:
      'Join researchers and policy practitioners for an accessible afternoon of discussion, practical case studies, questions and opportunities to connect.',
    url: 'https://example.org/register',
    eventType: 'Panel discussion',
    startsAt: day(10),
    endsAt: new Date(Date.now() + 10 * 86400000 + 7200000).toISOString(),
    timezone: 'Europe/Brussels',
    venue: 'Example Forum',
    price: 0,
    ...overrides,
  };
}
function publish(owner: User, admin: User, input: Record<string, unknown> = job()): Listing {
  const draft = store.createListing(owner.id, input);
  const pending = store.transitionListing(draft.id, owner.id, owner.role, draft.version, 'submit');
  return store.transitionListing(pending.id, admin.id, admin.role, pending.version, 'approve');
}
function status(error: unknown, expected: number) {
  return error instanceof store.StoreError && error.status === expected;
}

test('seed is fictional, diverse, upcoming, complete and not duplicated on reopen', () => {
  fresh(true);
  const stats = store.getStats();
  assert.deepEqual(stats, { jobs: 24, events: 14, organizations: 12 });
  const all = store.searchListings({ pageSize: 100 }).items;
  assert.equal(all.length, 38);
  assert.equal(new Set(all.map((x) => x.slug)).size, 38);
  assert.ok(
    all.every(
      (x) =>
        x.isSample &&
        x.sourceUrl === null &&
        x.url === null &&
        x.sourceCheckedAt === null &&
        x.ownerId === null,
    ),
  );
  assert.ok(
    all
      .filter((x) => x.kind === 'event')
      .every((x) => x.startsAt! > day(0) && x.endsAt! > x.startsAt!),
  );
  assert.ok(all.every((x) => x.createdAt <= day(0)));
  assert.equal(store.getDb().prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 0);
  assert.equal(store.getStats().jobs, 24);
  const facets = store.getFacets();
  assert.equal(facets.locations.length, 6);
  assert.equal(facets.topics.length, 8);
  const fixed = createSampleListings(new Date('2026-10-02T12:00:00Z'));
  assert.ok(
    fixed.filter((x) => x.kind === 'event').every((x) => x.startsAt! > '2026-10-02T12:00:00Z'),
  );
});

test('search filters the complete dataset before pagination and sorting', () => {
  fresh(true);
  const all = store.searchListings({ kind: 'job', pageSize: 100 }).items;
  const expected = all.filter((x) => x.workMode === 'Remote');
  const filtered = store.searchListings({ kind: 'job', workMode: 'Remote', pageSize: 1 });
  assert.equal(filtered.total, expected.length);
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.pages, expected.length);
  const second = store.searchListings({ kind: 'job', workMode: 'Remote', pageSize: 1, page: 2 });
  assert.notEqual(second.items[0].id, filtered.items[0].id);
  assert.equal(store.searchListings({ savedIds: [] }).total, 0);
  assert.equal(store.searchListings({ q: "' OR 1=1 --" }).total, 0);
  assert.equal(store.searchListings({ q: '%' }).total, 0);
  assert.equal(store.searchListings({ q: '_' }).total, 0);
  assert.throws(
    () => store.searchListings({ pageSize: 0 }),
    (e) => status(e, 400),
  );
  assert.throws(
    () => store.searchListings({ pageSize: 1000 }),
    (e) => status(e, 400),
  );
  const salarySorted = store.searchListings({
    kind: 'job',
    salaryOnly: true,
    sort: 'salary',
    pageSize: 100,
  }).items;
  const annual = salarySorted.map((x) => x.salaryMin! * (x.salaryPeriod === 'month' ? 12 : 1));
  assert.deepEqual(
    annual,
    [...annual].sort((a, b) => b - a),
  );
});

test('expiry removes listings from search, facets and totals but preserves public detail URLs', () => {
  const { db } = fresh();
  const owner = user(),
    admin = user('Admin', 'admin');
  const listing = publish(owner, admin, job({ location: 'Test City' }));
  assert.equal(store.getStats().jobs, 1);
  db.prepare('UPDATE listings SET deadline=? WHERE id=?').run(day(-1), listing.id);
  assert.equal(store.searchListings({}).total, 0);
  assert.equal(store.getStats().jobs, 0);
  assert.deepEqual(store.getFacets().locations, []);
  assert.equal(store.getListing(listing.slug)?.id, listing.id);
});

test('draft and pending never leak publicly; admin approval is required and audited', () => {
  fresh();
  const owner = user(),
    other = user(),
    admin = user('Admin', 'admin');
  const draft = store.createListing(owner.id, job());
  assert.equal(store.getListing(draft.slug), null);
  assert.equal(store.searchListings({}).total, 0);
  assert.throws(
    () => store.toggleSaved(other.id, draft.id),
    (e) => status(e, 404),
  );
  assert.throws(
    () => store.transitionListing(draft.id, other.id, 'member', 1, 'submit'),
    (e) => status(e, 403),
  );
  const pending = store.transitionListing(draft.id, owner.id, 'member', 1, 'submit');
  assert.equal(store.getListing(pending.slug), null);
  assert.equal(store.listModeration().length, 1);
  assert.throws(
    () => store.transitionListing(pending.id, owner.id, 'admin', pending.version, 'approve'),
    (e) => status(e, 403),
  );
  const live = store.transitionListing(pending.id, admin.id, 'admin', pending.version, 'approve');
  assert.equal(store.getListing(live.slug)?.status, 'published');
  assert.equal(store.searchListings({}).total, 1);
  assert.equal(store.listAudit(live.id).length, 3);
});

test('edits revoke publication and stale versions conflict without changing saved data', () => {
  fresh();
  const owner = user(),
    admin = user('Admin', 'admin'),
    other = user();
  const live = publish(owner, admin);
  assert.throws(
    () =>
      store.updateListing(live.id, other.id, 'admin', live.version, {
        title: 'Unauthorized replacement',
      }),
    (e) => status(e, 403),
  );
  const edited = store.updateListing(live.id, owner.id, 'member', live.version, {
    title: 'Senior Policy Analyst',
  });
  assert.equal(edited.slug, live.slug);
  assert.equal(edited.status, 'draft');
  assert.equal(edited.publishedAt, null);
  assert.equal(store.getListing(live.slug), null);
  assert.throws(
    () =>
      store.updateListing(live.id, owner.id, 'member', live.version, {
        title: 'Stale replacement',
      }),
    (e) => status(e, 409),
  );
  assert.equal(store.getListingById(live.id)?.title, 'Senior Policy Analyst');
  assert.throws(
    () => store.updateListing(live.id, owner.id, 'member', edited.version, { featured: true }),
    (e) => status(e, 400),
  );
  assert.equal(store.getListingById(live.id)?.version, edited.version);
});

test('rejection, resubmission, close and edit follow explicit state transitions', () => {
  fresh();
  const owner = user(),
    admin = user('Admin', 'admin');
  let listing = store.createListing(owner.id, job());
  assert.throws(
    () => store.transitionListing(listing.id, admin.id, 'admin', listing.version, 'approve'),
    (e) => status(e, 409),
  );
  listing = store.transitionListing(listing.id, owner.id, 'member', listing.version, 'submit');
  assert.throws(
    () => store.transitionListing(listing.id, admin.id, 'admin', listing.version, 'reject', ''),
    (e) => status(e, 400),
  );
  listing = store.transitionListing(
    listing.id,
    admin.id,
    'admin',
    listing.version,
    'reject',
    'Please add the application details.',
  );
  assert.equal(listing.status, 'rejected');
  assert.ok(listing.rejectionReason);
  listing = store.updateListing(listing.id, owner.id, 'member', listing.version, {
    description: job().description,
  });
  listing = store.transitionListing(listing.id, owner.id, 'member', listing.version, 'submit');
  listing = store.transitionListing(listing.id, admin.id, 'admin', listing.version, 'approve');
  listing = store.transitionListing(listing.id, owner.id, 'member', listing.version, 'close');
  assert.equal(store.getListing(listing.slug)?.status, 'closed');
  assert.equal(store.searchListings({}).total, 0);
  const reopened = store.updateListing(listing.id, owner.id, 'member', listing.version, {
    deadline: day(30),
  });
  assert.equal(reopened.status, 'draft');
});

test('validation prevents impossible salaries, dates, unsafe links and unactionable publication', () => {
  fresh();
  const owner = user();
  assert.throws(
    () =>
      store.createListing(
        owner.id,
        job({ salaryMin: 50000, salaryMax: 40000, salaryPeriod: 'year' }),
      ),
    (e) => status(e, 400),
  );
  assert.throws(
    () => store.createListing(owner.id, job({ url: 'javascript:alert(1)' })),
    (e) => status(e, 400),
  );
  assert.throws(
    () => store.createListing(owner.id, job({ deadline: '2027-02-30' })),
    (e) => status(e, 400),
  );
  assert.throws(
    () => store.createListing(owner.id, event({ endsAt: day(1) })),
    (e) => status(e, 400),
  );
  assert.throws(
    () => store.createListing(owner.id, event({ timezone: 'Invalid/Planet' })),
    (e) => status(e, 400),
  );
  assert.throws(
    () => store.createListing(owner.id, event({ startsAt: '2026-11-20' })),
    (e) => status(e, 400),
  );
  assert.throws(
    () =>
      store.createListing(
        owner.id,
        event({ startsAt: '2027-02-30T10:00:00Z', endsAt: '2027-03-02T14:00:00Z' }),
      ),
    (e) => status(e, 400),
  );
  const noUrl = store.createListing(owner.id, job({ url: null }));
  assert.throws(
    () => store.transitionListing(noUrl.id, owner.id, 'member', noUrl.version, 'submit'),
    (e) => status(e, 400),
  );
  const expired = store.createListing(owner.id, job({ deadline: day(-1) }));
  assert.throws(
    () => store.transitionListing(expired.id, owner.id, 'member', expired.version, 'submit'),
    (e) => status(e, 400),
  );
});

test('organization identity preserves punctuation; job facts and stable IDs survive edits', () => {
  fresh();
  const owner = user();
  const one = store.createListing(
    owner.id,
    job({ organization: 'A&B', location: 'Berlin', country: 'Germany', workMode: 'Remote' }),
  );
  const two = store.createListing(owner.id, job({ organization: 'A B' }));
  const three = store.createListing(owner.id, job({ organization: 'a&b' }));
  assert.notEqual(one.organizationId, two.organizationId);
  assert.equal(one.organizationId, three.organizationId);
  assert.equal(one.workMode, 'Remote');
  assert.equal(one.country, 'Germany');
  assert.equal(one.location, 'Berlin');
  const edited = store.updateListing(one.id, owner.id, 'member', one.version, {
    title: 'Updated role title',
  });
  assert.equal(edited.organizationId, one.organizationId);
  assert.equal(edited.slug, one.slug);
});

test('events preserve UTC times, support date range and soonest ordering, and expire consistently', () => {
  const { db } = fresh();
  const owner = user(),
    admin = user('Admin', 'admin');
  const a = publish(
    owner,
    admin,
    event({ title: 'Later Policy Exchange', startsAt: day(15), endsAt: day(16) }),
  );
  const b = publish(
    owner,
    admin,
    event({ title: 'Earlier Policy Exchange', startsAt: day(5), endsAt: day(6) }),
  );
  assert.equal(store.searchListings({ kind: 'event' }).items[0].id, b.id);
  const bounded = store.searchListings({ kind: 'event', from: day(10), to: day(20) });
  assert.equal(bounded.total, 1);
  assert.equal(bounded.items[0].id, a.id);
  db.prepare('UPDATE listings SET startsAt=?,endsAt=? WHERE id=?').run(day(-2), day(-1), b.id);
  assert.equal(store.getStats().events, 1);
  assert.equal(store.getListing(b.slug)?.id, b.id);
});

test('event filters include events overlapping the Brussels calendar month at midnight boundaries', () => {
  fresh();
  const owner = user(),
    admin = user('Admin', 'admin');
  const examples = [
    ['Previous month', '2027-10-31T22:30:00.000Z'],
    ['First local day', '2027-10-31T23:30:00.000Z'],
    ['Last local day', '2027-11-30T22:30:00.000Z'],
    ['Following month', '2027-11-30T23:30:00.000Z'],
  ];
  for (const [title, start] of examples)
    publish(
      owner,
      admin,
      event({
        title,
        startsAt: start,
        endsAt: new Date(Date.parse(start) + 3600000).toISOString(),
      }),
    );
  const results = store.searchListings({ kind: 'event', from: '2027-11-01', to: '2027-11-30' });
  assert.deepEqual(
    results.items.map((x) => x.title),
    ['Previous month', 'First local day', 'Last local day'],
  );
  // Explicit ISO bounds remain precise instants, with no implicit timezone conversion.
  const exact = store.searchListings({
    kind: 'event',
    from: '2027-11-01T00:00:00Z',
    to: '2027-12-01T00:00:00Z',
  });
  assert.deepEqual(
    exact.items.map((x) => x.title),
    ['First local day', 'Last local day', 'Following month'],
  );
});

test('Brussels date-only ranges and job deadlines respect 23-hour and 25-hour DST days', () => {
  fresh();
  const owner = user(),
    admin = user('Admin', 'admin');
  const changes = [
    {
      date: '2027-03-28',
      start: '2027-03-27T23:00:00.000Z',
      end: '2027-03-28T22:00:00.000Z',
      hours: 23,
    },
    {
      date: '2027-10-31',
      start: '2027-10-30T22:00:00.000Z',
      end: '2027-10-31T23:00:00.000Z',
      hours: 25,
    },
  ];
  for (const change of changes) {
    const midnight = Date.parse(change.start),
      nextMidnight = Date.parse(change.end);
    assert.equal((nextMidnight - midnight) / 3600000, change.hours);
    for (const [label, start] of [
      ['Before start', midnight - 1],
      ['At start', midnight],
      ['Before end', nextMidnight - 1],
      ['At end', nextMidnight],
    ] as const)
      publish(
        owner,
        admin,
        event({
          title: `${change.date} ${label}`,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + 3600000).toISOString(),
        }),
      );
    const matches = store.searchListings({ kind: 'event', from: change.date, to: change.date });
    assert.deepEqual(
      matches.items.map((x) => x.title),
      [`${change.date} Before start`, `${change.date} At start`, `${change.date} Before end`],
    );
    const draft = store.createListing(owner.id, job({ deadline: change.date }));
    assert.equal(draft.deadline, new Date(nextMidnight - 1).toISOString());
    assert.equal(
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Brussels',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(draft.deadline!)),
      change.date,
    );
  }
});

test('accounts, sessions and saved items are persistent and scoped to their owner', () => {
  const { dir, db } = fresh();
  const owner = user(),
    other = user(),
    admin = user('Admin', 'admin');
  const role = publish(owner, admin);
  const hash = 'a'.repeat(64);
  store.createSession(hash, owner.id, day(1));
  assert.equal(store.getSession(hash)?.id, owner.id);
  db.prepare('UPDATE sessions SET expiresAt=? WHERE tokenHash=?').run(day(-1), hash);
  assert.equal(store.getSession(hash), null);
  assert.equal(store.toggleSaved(owner.id, role.id), true);
  assert.deepEqual(store.getSavedIds(owner.id), [role.id]);
  assert.deepEqual(store.getSavedIds(other.id), []);
  const secondConnection = new DatabaseSync(join(dir, 'eujobs.sqlite'));
  assert.equal(
    secondConnection.prepare('SELECT COUNT(*) AS n FROM saved WHERE userId=?').get(owner.id)?.n,
    1,
  );
  secondConnection.close();
  assert.equal(store.toggleSaved(owner.id, role.id), false);
  const search = store.createSavedSearch(owner.id, {
    name: 'Remote policy roles',
    filters: { kind: 'job', workMode: 'Remote', page: 5 },
  });
  assert.throws(
    () =>
      store.createSavedSearch(owner.id, {
        name: 'Invalid date',
        filters: { kind: 'event', from: '2027-02-30' },
      }),
    (e) => status(e, 400),
  );
  assert.throws(
    () =>
      store.createSavedSearch(owner.id, {
        name: 'Reversed range',
        filters: { kind: 'event', from: '2027-12-20', to: '2027-12-01' },
      }),
    (e) => status(e, 400),
  );
  assert.equal(store.getSavedSearches(owner.id).length, 1);
  assert.equal(search.filters.page, undefined);
  assert.equal(store.getSavedSearches(other.id).length, 0);
  assert.throws(
    () => store.deleteSavedSearch(other.id, search.id),
    (e) => status(e, 404),
  );
  assert.equal(store.getSavedSearches(owner.id).length, 1);
  store.deleteSavedSearch(owner.id, search.id);
  assert.equal(store.getSavedSearches(owner.id).length, 0);
});

test('contacts retain their exact submitted text; duplicate account email returns conflict', () => {
  fresh();
  const account = store.createUser({
    name: 'Example Person',
    email: 'person@example.org',
    passwordHash: 'scrypt$example-hash-for-domain-tests',
  });
  assert.throws(
    () =>
      store.createUser({
        name: 'Someone Else',
        email: 'PERSON@example.org',
        passwordHash: 'scrypt$example-hash-for-domain-tests',
      }),
    (e) => status(e, 409),
  );
  assert.equal(store.findUserByEmail('PERSON@example.org')?.id, account.id);
  assert.equal('passwordHash' in store.findUserById(account.id)!, false);
  const message = store.saveContact({
    name: 'Example Person',
    email: 'person@example.org',
    subject: 'A question about a role',
    message: "Can I add a role about Europe's energy policy?",
  });
  assert.equal(store.listContacts()[0].id, message.id);
  assert.equal(store.listContacts()[0].message, message.message);
  assert.throws(
    () => store.saveContact({ name: 'A', email: 'invalid', subject: 'Hi', message: 'x' }),
    (e) => status(e, 400),
  );
});

test('r17: job descriptions need 30+ characters; events keep 80', () => {
  fresh();
  const owner = user('Short Description Owner');
  const thirty = 'Policy officer, Brussels team.'; // exactly 30 characters
  assert.equal(thirty.length, store.JOB_DESCRIPTION_MIN);
  assert.equal(store.createListing(owner.id, job({ description: thirty })).description, thirty);
  assert.throws(() => store.createListing(owner.id, job({ description: thirty.slice(0, 29) })));
  assert.throws(
    () => store.createListing(owner.id, event({ description: 'A'.repeat(79) })),
    /at least 80 characters for an event/,
  );
  assert.equal(
    store.createListing(owner.id, event({ description: 'A'.repeat(80) })).description.length,
    store.EVENT_DESCRIPTION_MIN,
  );
});
