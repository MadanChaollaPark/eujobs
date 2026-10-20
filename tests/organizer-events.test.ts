import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../src/lib/store';

const dirs: string[] = [],
  databases: ReturnType<typeof store.getDb>[] = [];
after(() => {
  for (const db of databases) db.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'eujobs-organizer-'));
  dirs.push(dir);
  process.env.DATA_DIR = dir;
  process.env.EUJOBS_SEED = '0';
  process.env.EUJOBS_RESOURCES_FILE = join(dir, 'resources.json');
  writeFileSync(
    process.env.EUJOBS_RESOURCES_FILE,
    JSON.stringify({
      lobbyingEntities: [
        { slug: 'policy-lab', name: 'Policy Lab', website: 'https://policy.example.org' },
      ],
    }),
  );
  const db = store.getDb();
  databases.push(db);
  const admin = store.createUser({
    name: 'Admin',
    email: 'admin@example.org',
    passwordHash: 'test-only-placeholder',
    role: 'admin',
  });
  const member = store.createUser({
    name: 'Member',
    email: 'member@example.org',
    passwordHash: 'test-only-placeholder',
  });
  const start = new Date(Date.now() + 30 * 86400000),
    end = new Date(start.getTime() + 3600000);
  const row = {
    sourceId: 'event-1',
    organizationSlug: 'policy-lab',
    checkedAt: new Date().toISOString(),
    datePrecision: 'datetime',
    listing: {
      kind: 'event',
      title: 'European policy roundtable',
      organization: 'Policy Lab',
      location: 'Brussels',
      country: 'Belgium',
      topic: 'EU policy',
      summary: 'A policy discussion with researchers and practitioners.',
      description:
        '## Programme\nResearchers and practitioners will discuss current European policy questions and compare practical approaches.\n\n## Attendance\nThis event requires an invitation from the organizer.',
      sourceUrl: 'https://policy.example.org/events/roundtable',
      url: 'https://registration.example.org/roundtable',
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone: 'Europe/Brussels',
      eventType: 'Panel discussion',
      venue: 'Policy Lab, Brussels',
      price: null,
    },
  };
  return { db, admin, member, row };
}
const count = (db: ReturnType<typeof store.getDb>, table: string) =>
  Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);

test('organizer imports require an administrator, default to dry-run and drafts, then explicitly publish', () => {
  const { db, admin, member, row } = setup();
  assert.throws(() => store.importOrganizerEvents(member.id, [row]), /Administrator/);
  assert.equal(store.importOrganizerEvents(admin.id, [row], { publish: true }).wouldPublish, 1);
  assert.equal(count(db, 'listings'), 0);
  assert.equal(count(db, 'import_runs'), 0);
  const draft = store.importOrganizerEvents(admin.id, [row], { dryRun: false });
  let saved = store.getListingById(draft.listings[0].listingId)!;
  assert.equal(saved.status, 'draft');
  assert.equal(saved.entitySlug, 'policy-lab');
  assert.equal(saved.price, null);
  assert.equal(saved.externalSource, 'organizer');
  assert.equal(saved.paidAt, null);
  assert.throws(
    () =>
      store.importOrganizerEvents(
        admin.id,
        [
          {
            ...row,
            sourceId: 'changed-alias',
            listing: { ...row.listing, title: 'A different reviewed title' },
          },
        ],
        { dryRun: false, publish: true },
      ),
    /different listing identity/,
  );
  assert.equal(store.getListingById(saved.id)!.status, 'draft');
  assert.throws(
    () => store.transitionListing(saved.id, admin.id, admin.role, saved.version, 'approve'),
    /administrator can close/,
  );
  const published = store.importOrganizerEvents(admin.id, [row], { dryRun: false, publish: true });
  assert.equal(published.published, 1);
  saved = store.getListingById(saved.id)!;
  assert.equal(saved.status, 'published');
  assert.equal(saved.entitlementExpiresAt, null);
  assert.equal(store.getStats().events, 1);
  assert.equal(count(db, 'payment_orders'), 0);
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE name='email_outbox'").get(),
    undefined,
  );
  const version = saved.version;
  assert.equal(
    store.importOrganizerEvents(admin.id, [row], { dryRun: false, publish: true }).skipped,
    1,
  );
  assert.equal(store.getListingById(saved.id)!.version, version);
});

test('event provenance, future dates, organization binding, price and public mutation boundaries fail closed', () => {
  const { db, admin, row } = setup();
  for (const bad of [
    { ...row, organizationSlug: 'unknown' },
    { ...row, checkedAt: new Date(Date.now() - 4 * 86400000).toISOString() },
    { ...row, listing: { ...row.listing, organization: 'Different Lab' } },
    {
      ...row,
      listing: { ...row.listing, sourceUrl: 'https://policy.example.org.evil.test/events/x' },
    },
    { ...row, listing: { ...row.listing, sourceUrl: 'https://policy.example.org/' } },
    { ...row, listing: { ...row.listing, startsAt: new Date(Date.now() - 3600000).toISOString() } },
    { ...row, listing: { ...row.listing, price: -1 } },
    { ...row, listing: { ...row.listing, publicationOrigin: 'editorial' } },
  ])
    assert.throws(() =>
      store.importOrganizerEvents(admin.id, [bad], { dryRun: false, publish: true }),
    );
  assert.equal(count(db, 'listings'), 0);
  assert.throws(
    () => store.createListing(admin.id, { ...row.listing, entitySlug: 'policy-lab' }),
    /Unrecognized/,
  );
});

test('date-only ranges use local exclusive boundaries across DST without invented event hours', () => {
  const { admin, row } = setup();
  const year = new Date().getUTCFullYear() + 1;
  const sunday = new Date(Date.UTC(year, 2, 31));
  sunday.setUTCDate(31 - sunday.getUTCDay());
  const start = new Date(sunday.getTime() - 86400000).toISOString().slice(0, 10),
    end = sunday.toISOString().slice(0, 10);
  const result = store.importOrganizerEvents(
    admin.id,
    [{ ...row, datePrecision: 'date', listing: { ...row.listing, startsAt: start, endsAt: end } }],
    { dryRun: false, publish: true },
  );
  const event = store.getListingById(result.listings[0].listingId)!;
  assert.equal(event.eventDateOnly, true);
  assert.equal(Date.parse(event.endsAt!) - Date.parse(event.startsAt!), 47 * 3600000);
  assert.ok(event.startsAt!.endsWith('23:00:00.000Z'));
  assert.ok(event.endsAt!.endsWith('22:00:00.000Z'));
});

test('duplicate events retain one listing and aliases while schedule changes and batch conflicts roll back', () => {
  const { db, admin, row } = setup();
  const result = store.importOrganizerEvents(admin.id, [row, { ...row, sourceId: 'event-alias' }], {
    dryRun: false,
    publish: true,
  });
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.equal(count(db, 'import_sources'), 2);
  const id = result.listings[0].listingId;
  const conflict = { ...row, listing: { ...row.listing, title: 'Changed event identity' } };
  assert.throws(
    () =>
      store.importOrganizerEvents(admin.id, [{ ...conflict, sourceId: 'other-title' }], {
        dryRun: false,
        publish: true,
      }),
    /different listing identity/,
  );
  assert.equal(count(db, 'import_sources'), 2);
  const second = {
    ...row,
    sourceId: 'second',
    listing: {
      ...row.listing,
      title: 'A second policy event',
      sourceUrl: 'https://policy.example.org/events/second',
    },
  };
  assert.throws(
    () =>
      store.importOrganizerEvents(admin.id, [second, conflict], { dryRun: false, publish: true }),
    /changed identity/,
  );
  assert.equal(count(db, 'listings'), 1);
  assert.equal(count(db, 'import_sources'), 2);
  const event = store.getListingById(id)!;
  store.transitionListing(id, admin.id, admin.role, event.version, 'close');
  assert.equal(
    store.importOrganizerEvents(admin.id, [row], { dryRun: false, publish: true }).skipped,
    1,
  );
  assert.equal(store.getListingById(id)!.status, 'closed');
});

test('event date filters include multi-day events continuing into the selected month', () => {
  const { admin, row } = setup();
  const year = new Date().getUTCFullYear() + 1;
  const result = store.importOrganizerEvents(
    admin.id,
    [
      {
        ...row,
        datePrecision: 'date',
        listing: {
          ...row.listing,
          startsAt: `${year}-01-31`,
          endsAt: `${year}-02-02`,
          timezone: 'Europe/Vilnius',
        },
      },
    ],
    { dryRun: false, publish: true },
  );
  const event = store.getListingById(result.listings[0].listingId)!;
  assert.equal(
    store.searchListings({ kind: 'event', from: `${year}-02-01`, to: `${year}-02-28` }).total,
    1,
  );
  assert.equal(store.searchListings({ kind: 'event', from: event.endsAt! }).total, 0);
});
