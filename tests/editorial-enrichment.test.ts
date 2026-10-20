import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../src/lib/store';
import { formatSalary } from '../src/lib/types';

const fixtures: { directory: string; db: ReturnType<typeof store.getDb> }[] = [];
after(() => {
  for (const { directory, db } of fixtures) {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eujobs-enrichment-'));
  process.env.DATA_DIR = directory;
  process.env.EUJOBS_SEED = '0';
  const db = store.getDb();
  fixtures.push({ directory, db });
  const admin = store.createUser({
    name: 'Editor',
    email: 'editor@example.org',
    passwordHash: 'test-only-password-hash-placeholder',
    role: 'admin',
  });
  const member = store.createUser({
    name: 'Member',
    email: 'member@example.org',
    passwordHash: 'test-only-password-hash-placeholder',
  });
  const listing = {
    kind: 'job',
    title: 'Policy Research Officer',
    organization: 'Example Institute',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Research European policy and prepare briefings for the policy team.',
    description:
      'Research European policy and prepare briefings for the policy team, working with colleagues across the organisation.',
    sourceUrl: 'https://www.eurobrussels.com/jobs/fixture',
    url: 'https://www.eurobrussels.com/jobs/fixture',
  };
  const imported = store.importEditorialListings(
    admin.id,
    'eurobrussels.com',
    [{ sourceId: 'fixture', checkedAt: new Date().toISOString(), listing }],
    { dryRun: false, publish: true },
  );
  const current = store.getListingById(imported.listings[0].listingId)!;
  const enrichment = {
    source: 'eurobrussels.com',
    sourceId: 'fixture',
    expectedVersion: current.version,
    description:
      '## Responsibilities\n- Research legislative proposals, prepare policy briefings and coordinate research inputs with the team.\n\n## Requirements\n- Relevant research experience, fluent English and strong writing skills.\n\n## Terms\n- Brussels-based role; salary is not disclosed.',
    applicationMethod: 'url',
    applicationUrl: 'https://example.org/careers/policy-officer',
    applicationInstructions:
      'Submit your CV and a covering letter through the employer application form.',
    employerSourceUrl: 'https://example.org/careers/policy-officer',
    checkedAt: new Date().toISOString(),
  };
  return { db, admin, member, current, enrichment };
}
test('enrichment defaults to dry-run, preserves identity/payment/publication, and replays without another revision', () => {
  const { db, admin, current, enrichment } = setup();
  assert.equal(store.enrichEditorialListings(admin.id, [enrichment]).wouldUpdate, 1);
  assert.equal(store.getListingById(current.id)!.description, current.description);
  assert.equal(store.enrichEditorialListings(admin.id, [enrichment], { dryRun: false }).updated, 1);
  const result = store.getListingById(current.id)!;
  for (const key of [
    'id',
    'slug',
    'ownerId',
    'status',
    'publishedAt',
    'entitlementExpiresAt',
    'paidAt',
    'paymentOrderId',
    'planId',
    'sourceIdentity',
    'sourceUrl',
  ] as const)
    assert.equal(result[key], current[key], key);
  assert.equal(result.url, enrichment.applicationUrl);
  assert.equal(result.version, current.version + 1);
  assert.equal(store.enrichEditorialListings(admin.id, [enrichment], { dryRun: false }).skipped, 1);
  const revisions = db.prepare('SELECT * FROM editorial_revisions').all();
  assert.equal(revisions.length, 1);
  assert.equal(JSON.parse(String(revisions[0].previousContent)).description, current.description);
});
test('enrichment rejects authority, stale content and unreviewed identity changes', () => {
  const { db, admin, member, enrichment } = setup();
  assert.throws(() => store.enrichEditorialListings(member.id, [enrichment], { dryRun: false }), {
    status: 403,
  });
  assert.throws(
    () =>
      store.enrichEditorialListings(admin.id, [{ ...enrichment, expectedVersion: 99 }], {
        dryRun: false,
      }),
    { status: 409 },
  );
  assert.throws(() =>
    store.enrichEditorialListings(admin.id, [{ ...enrichment, paidAt: new Date().toISOString() }], {
      dryRun: false,
    }),
  );
  assert.throws(
    () =>
      store.enrichEditorialListings(admin.id, [{ ...enrichment, sourceId: 'unknown' }], {
        dryRun: false,
      }),
    { status: 404 },
  );
  assert.equal(db.prepare('SELECT count(*) n FROM editorial_revisions').get()!.n, 0);
});
test('unsafe and competitor apply links fail; explicit email and on-page instructions are supported', () => {
  const { admin, enrichment } = setup();
  for (const applicationUrl of [
    'https://www.eurobrussels.com/job/track_click?id=1',
    'https://jobsin.brussels/jobs/test',
    'https://www.jobsin.brussels./jobs/test',
    'javascript:alert(1)',
    'https://user:pass@example.org/apply',
    'mailto:hr@example.org',
  ])
    assert.throws(() =>
      store.enrichEditorialListings(admin.id, [{ ...enrichment, applicationUrl }]),
    );
  assert.throws(() =>
    store.enrichEditorialListings(admin.id, [
      {
        ...enrichment,
        applicationMethod: 'email',
        applicationUrl: 'mailto:hr@example.org?bcc=other@example.org',
      },
    ]),
  );
  assert.throws(() =>
    store.enrichEditorialListings(admin.id, [
      {
        ...enrichment,
        applicationMethod: 'email',
        applicationUrl: 'mailto:hr@example.org?subject=x%0d%0abcc:other@example.org',
      },
    ]),
  );
  assert.equal(
    store.enrichEditorialListings(admin.id, [
      {
        ...enrichment,
        applicationMethod: 'email',
        applicationUrl: 'mailto:hr@example.org?subject=Policy%20officer',
      },
    ]).wouldUpdate,
    1,
  );
  assert.equal(
    store.enrichEditorialListings(admin.id, [
      { ...enrichment, applicationMethod: 'instructions', applicationUrl: null },
    ]).wouldUpdate,
    1,
  );
});
test('multiple updates are atomic and reject two sources targeting one listing', () => {
  const { admin, db, current, enrichment } = setup();
  assert.throws(() =>
    store.enrichEditorialListings(admin.id, [enrichment, { ...enrichment, sourceId: 'missing' }], {
      dryRun: false,
    }),
  );
  assert.equal(store.getListingById(current.id)!.description, current.description);
  assert.equal(db.prepare('SELECT count(*) n FROM editorial_revisions').get()!.n, 0);
  db.prepare('INSERT INTO import_sources VALUES(?,?,?,?)').run(
    'jobsin.brussels',
    'alias',
    current.id,
    new Date().toISOString(),
  );
  assert.throws(() =>
    store.enrichEditorialListings(
      admin.id,
      [enrichment, { ...enrichment, source: 'jobsin.brussels', sourceId: 'alias' }],
      { dryRun: false },
    ),
  );
  assert.equal(store.getListingById(current.id)!.description, current.description);
});

test('editorial email enrichment stores every required recipient and supports at most five', () => {
  const { admin, current, enrichment } = setup();
  for (const applicationUrl of [
    'mailto:first@example.org%2Csecond@example.org?subject=Policy%20Officer',
    'mailto:one@example.org,two@example.org,three@example.org,four@example.org,five@example.org',
  ])
    assert.equal(
      store.enrichEditorialListings(admin.id, [
        { ...enrichment, applicationMethod: 'email', applicationUrl },
      ]).wouldUpdate,
      1,
    );
  const applicationUrl = 'mailto:first@example.org,second@example.org?subject=Policy%20Officer';
  store.enrichEditorialListings(
    admin.id,
    [{ ...enrichment, applicationMethod: 'email', applicationUrl }],
    { dryRun: false },
  );
  const saved = store.getListingById(current.id)!;
  assert.equal(saved.url, applicationUrl);
  assert.equal(saved.applicationMethod, 'email');
  assert.equal(saved.paymentOrderId, current.paymentOrderId);
});

test('editorial email enrichment rejects unsafe recipient lists without writing a revision', () => {
  const { admin, db, current, enrichment } = setup();
  for (const applicationUrl of [
    'mailto:',
    'mailto:,second@example.org',
    'mailto:first@example.org,',
    'mailto:first@example.org,,second@example.org',
    'mailto:first@example.org,%20,second@example.org',
    'mailto:first@example.org,invalid',
    'mailto:first@example.org,second@bad..example.org',
    'mailto:one@example.org,two@example.org,three@example.org,four@example.org,five@example.org,six@example.org',
    'mailto:first@example.org,second@example.org?bcc=hidden@example.org',
    'mailto:first@example.org,second@example.org?to=hidden@example.org',
    'mailto:first@example.org,second@example.org?body=Not%20permitted%20by%20the%20importer',
    'mailto:first@example.org,second@example.org?subject=Application%0D%0ABcc:other@example.org',
    'mailto:first@example.org,second@example.org\r\n?subject=Application',
    'mailto:first@example.org,%0asecond@example.org',
    'mailto:first@example.org,%not-encoding@example.org',
    'mailto:first@example.org,second@example.org#ignored',
  ])
    assert.throws(
      () =>
        store.enrichEditorialListings(
          admin.id,
          [{ ...enrichment, applicationMethod: 'email', applicationUrl }],
          { dryRun: false },
        ),
      /valid application email/,
      applicationUrl,
    );
  assert.equal(store.getListingById(current.id)!.url, current.url);
  assert.equal(db.prepare('SELECT count(*) n FROM editorial_revisions').get()!.n, 0);
});

test('a verified employer deadline correction changes the deadline without extending publication entitlement', () => {
  const { admin, current, enrichment } = setup();
  store.enrichEditorialListings(admin.id, [{ ...enrichment, deadlineOverride: '2026-10-09' }], {
    dryRun: false,
  });
  const saved = store.getListingById(current.id)!;
  assert.equal(saved.deadline, '2026-10-09T21:59:59.999Z');
  assert.equal(saved.entitlementExpiresAt, current.entitlementExpiresAt);
  assert.equal(saved.publishedAt, current.publishedAt);
});

test('verified salary corrections update salary display and search with dry-run, replay and revision history', () => {
  const { admin, db, current, enrichment } = setup();
  const reviewed = {
    ...enrichment,
    salaryOverride: {
      min: 2500,
      max: 3100,
      period: 'month',
      display: '€2,500–€3,100 gross / month',
    },
  };
  assert.equal(store.searchListings({ salaryOnly: true }).total, 0);
  assert.equal(store.enrichEditorialListings(admin.id, [reviewed]).wouldUpdate, 1);
  assert.equal(store.getListingById(current.id)!.salaryMin, null);
  assert.equal(db.prepare('SELECT count(*) n FROM editorial_revisions').get()!.n, 0);

  assert.equal(store.enrichEditorialListings(admin.id, [reviewed], { dryRun: false }).updated, 1);
  const saved = store.getListingById(current.id)!;
  assert.equal(formatSalary(saved), '€2,500–€3,100 gross / month');
  assert.equal(store.searchListings({ salaryOnly: true }).total, 1);
  assert.equal(saved.version, current.version + 1);
  assert.equal(store.enrichEditorialListings(admin.id, [reviewed], { dryRun: false }).skipped, 1);
  assert.equal(db.prepare('SELECT count(*) n FROM editorial_revisions').get()!.n, 1);
  const firstRevision = JSON.parse(
    String(db.prepare('SELECT previousContent FROM editorial_revisions').get()!.previousContent),
  );
  assert.equal(firstRevision.salaryMin, null);
  assert.equal(firstRevision.salaryMax, null);
  assert.equal(firstRevision.salaryPeriod, null);
  assert.equal(firstRevision.salaryDisplay, null);

  const corrected = {
    ...reviewed,
    expectedVersion: saved.version,
    salaryOverride: { min: 33000, max: null, period: 'year', display: 'From €33,000 gross / year' },
  };
  assert.equal(store.enrichEditorialListings(admin.id, [corrected], { dryRun: false }).updated, 1);
  const final = store.getListingById(current.id)!;
  assert.equal(formatSalary(final), 'From €33,000 gross / year');
  assert.equal(final.salaryMax, null);
  assert.equal(final.version, current.version + 2);
  for (const key of [
    'id',
    'slug',
    'ownerId',
    'status',
    'publishedAt',
    'entitlementExpiresAt',
    'paidAt',
    'paymentOrderId',
    'planId',
    'sourceIdentity',
    'sourceUrl',
  ] as const)
    assert.equal(final[key], current[key], key);
  const revisions = db.prepare('SELECT previousContent FROM editorial_revisions').all();
  assert.equal(revisions.length, 2);
  assert.ok(
    revisions.some((row) => {
      const previous = JSON.parse(String(row.previousContent));
      return (
        previous.salaryMin === 2500 &&
        previous.salaryMax === 3100 &&
        previous.salaryPeriod === 'month' &&
        previous.salaryDisplay === '€2,500–€3,100 gross / month'
      );
    }),
  );
  // A later content refresh that omits an override retains the reviewed salary.
  assert.equal(
    store.enrichEditorialListings(admin.id, [{ ...enrichment, expectedVersion: final.version }], {
      dryRun: false,
    }).skipped,
    1,
  );
  assert.equal(store.getListingById(current.id)!.salaryMin, 33000);
});

test('salary corrections require a strict positive finite EUR range and supported period', () => {
  const { admin, db, current, enrichment } = setup();
  for (const salaryOverride of [
    { min: 3100, max: 2500, period: 'month' },
    { min: 0, max: null, period: 'month' },
    { min: -1, max: 2500, period: 'month' },
    { min: Number.NaN, max: null, period: 'month' },
    { min: Number.POSITIVE_INFINITY, max: null, period: 'month' },
    { min: 2500, max: Number.POSITIVE_INFINITY, period: 'month' },
    { min: '2500', max: 3100, period: 'month' },
    { min: 2500, period: 'month' },
    { min: 2500, max: null, period: 'week' },
    { min: 2500, max: 3100, period: 'month', currency: 'USD' },
    { min: null, max: null, period: 'month' },
    { min: 2500, max: null, period: null },
    { min: null, max: 3100, period: null },
    { min: null, max: null, period: null, display: '' },
    { min: null, max: null, period: null, display: ' '.repeat(10) },
    { min: null, max: null, period: null, display: 'x'.repeat(251) },
  ])
    assert.throws(() =>
      store.enrichEditorialListings(
        admin.id,
        [{ ...enrichment, salaryOverride: { display: 'Reviewed pay', ...salaryOverride } }],
        {
          dryRun: false,
        },
      ),
    );
  assert.equal(store.getListingById(current.id)!.salaryMin, null);
  assert.equal(db.prepare('SELECT count(*) n FROM editorial_revisions').get()!.n, 0);
  assert.equal(
    store.enrichEditorialListings(admin.id, [
      {
        ...enrichment,
        salaryOverride: { min: 2500, max: 2500, period: 'month', display: '€2,500 gross / month' },
      },
    ]).wouldUpdate,
    1,
  );
});

test('display-only pay preserves hourly or consultancy terms without fabricating a salary for filters', () => {
  const { admin, db, current, enrichment } = setup();
  const reviewed = {
    ...enrichment,
    salaryOverride: {
      min: null,
      max: null,
      period: null,
      display: '€15.50 gross / hour (student contract)',
    },
  };
  store.enrichEditorialListings(admin.id, [reviewed], { dryRun: false });
  const saved = store.getListingById(current.id)!;
  assert.equal(formatSalary(saved), reviewed.salaryOverride.display);
  assert.equal(saved.salaryMin, null);
  assert.equal(saved.salaryMax, null);
  assert.equal(saved.salaryPeriod, null);
  assert.equal(store.searchListings({ salaryOnly: true }).total, 0);
  assert.equal(saved.entitlementExpiresAt, current.entitlementExpiresAt);
  assert.equal(saved.paymentOrderId, current.paymentOrderId);
  assert.equal(store.enrichEditorialListings(admin.id, [reviewed], { dryRun: false }).skipped, 1);
  assert.equal(db.prepare('SELECT count(*) n FROM editorial_revisions').get()!.n, 1);
  // An explicit upper bound is valid when the source gives only an "up to" amount.
  assert.equal(
    store.enrichEditorialListings(admin.id, [
      {
        ...enrichment,
        expectedVersion: saved.version,
        salaryOverride: {
          min: null,
          max: 3500,
          period: 'month',
          display: 'Up to €3,500 gross / month',
        },
      },
    ]).wouldUpdate,
    1,
  );
});
