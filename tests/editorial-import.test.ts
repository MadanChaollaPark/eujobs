import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as store from '../src/lib/store';
import { hasJobEntitlement } from '../src/lib/plans';
import { createCheckout, type BillingProvider } from '../src/lib/billing';

const databases: ReturnType<typeof store.getDb>[] = [],
  directories: string[] = [];
after(() => {
  for (const db of databases) db.close();
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eujobs-editorial-'));
  directories.push(directory);
  process.env.DATA_DIR = directory;
  process.env.EUJOBS_SEED = '0';
  process.env.APP_ORIGIN = 'https://eujobs.example';
  delete process.env.EUJOBS_REQUIRE_PAYMENT;
  const db = store.getDb();
  databases.push(db);
  const admin = store.createUser({
    name: 'Editorial Administrator',
    email: `${randomUUID()}@example.org`,
    passwordHash: 'test-only-password-hash-placeholder',
    role: 'admin',
  });
  const member = store.createUser({
    name: 'Ordinary Member',
    email: `${randomUUID()}@example.org`,
    passwordHash: 'test-only-password-hash-placeholder',
  });
  return { directory, db, admin, member };
}
function sourceRow(
  sourceId = 'job-001',
  overrides: Record<string, unknown> = {},
  source = 'eurobrussels.com',
) {
  return {
    sourceId,
    checkedAt: new Date().toISOString(),
    listing: {
      kind: 'job',
      title: 'European Policy Analyst',
      organization: 'Example Policy Lab',
      location: 'Brussels',
      country: 'Belgium',
      topic: 'EU policy',
      summary: 'Conduct research and share European public policy analysis.',
      description:
        'Conduct research and share European public policy analysis, prepare written briefings and work with colleagues to explain relevant developments.',
      employmentType: null,
      seniority: null,
      workMode: null,
      sourceUrl: `https://www.${source}/jobs/${sourceId}`,
      url: `https://example.org/jobs/${sourceId}`,
      ...overrides,
    },
  };
}
const errorStatus = (status: number) => (error: unknown) =>
  error instanceof store.StoreError && error.status === status;
function count(db: ReturnType<typeof store.getDb>, table: string) {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
}

test('editorial imports default to a no-write dry run and then drafts; only explicit admin publication bypasses payment', () => {
  const { admin, member, db } = setup(),
    row = sourceRow();
  assert.throws(
    () =>
      store.importEditorialListings(member.id, 'eurobrussels.com', [row], {
        dryRun: false,
        publish: true,
      }),
    errorStatus(403),
  );
  const preview = store.importEditorialListings(admin.id, 'eurobrussels.com', [row], {
    publish: true,
  });
  assert.equal(preview.wouldImport, 1);
  assert.equal(preview.wouldPublish, 1);
  assert.equal(preview.imported, 0);
  assert.equal(count(db, 'listings'), 0);
  assert.equal(count(db, 'import_runs'), 0);
  const draft = store.importEditorialListings(admin.id, 'eurobrussels.com', [row], {
    dryRun: false,
  });
  assert.equal(draft.imported, 1);
  assert.equal(draft.published, 0);
  assert.equal(store.getStats().jobs, 0);
  const saved = store.getListingById(draft.listings[0].listingId)!;
  assert.equal(saved.status, 'draft');
  assert.equal(saved.publicationOrigin, 'editorial');
  assert.equal(saved.employmentType, null);
  assert.equal(saved.seniority, null);
  assert.equal(saved.workMode, null);
  assert.throws(
    () => store.transitionListing(saved.id, admin.id, admin.role, saved.version, 'submit'),
    errorStatus(403),
  );
  const published = store.importEditorialListings(admin.id, 'eurobrussels.com', [row], {
    dryRun: false,
    publish: true,
  });
  assert.equal(published.imported, 0);
  assert.equal(published.published, 1);
  assert.equal(store.getStats().jobs, 1);
  const live = store.getListingById(saved.id)!;
  assert.equal(live.paidAt, null);
  assert.equal(live.paymentOrderId, null);
  assert.equal(live.planId, null);
  assert.equal(live.featured, false);
  assert.equal(live.placement, 0);
  assert.equal(hasJobEntitlement(live), false);
  assert.equal(count(db, 'payment_orders'), 0);
  assert.equal(live.sourceCheckedAt, row.checkedAt);
  assert.ok(Date.parse(live.entitlementExpiresAt!) - Date.now() <= 30 * 86400000);
});
test('source provenance, recency, known source and server-owned metadata are mandatory', () => {
  const { admin, db } = setup();
  assert.throws(() =>
    store.importEditorialListings(
      admin.id,
      'untrusted.example' as store.EditorialSource,
      [sourceRow()],
      { dryRun: false, publish: true },
    ),
  );
  for (const sourceUrl of [
    'https://eurobrussels.com.attacker.example/jobs/1',
    'http://www.eurobrussels.com/jobs/1',
    'https://www.jobsin.brussels/jobs/1',
    'https://www.eurobrussels.com/',
    'https://user:pass@www.eurobrussels.com/jobs/1',
  ]) {
    assert.throws(() =>
      store.importEditorialListings(
        admin.id,
        'eurobrussels.com',
        [sourceRow('one', { sourceUrl })],
        { dryRun: false, publish: true },
      ),
    );
  }
  assert.throws(() =>
    store.importEditorialListings(
      admin.id,
      'eurobrussels.com',
      [{ ...sourceRow(), checkedAt: new Date(Date.now() - 73 * 3600000).toISOString() }],
      { dryRun: false },
    ),
  );
  assert.throws(() =>
    store.importEditorialListings(
      admin.id,
      'eurobrussels.com',
      [sourceRow('one', { deadline: new Date(Date.now() - 1000).toISOString() })],
      { dryRun: false },
    ),
  );
  assert.throws(() =>
    store.importEditorialListings(
      admin.id,
      'eurobrussels.com',
      [sourceRow('one', { publicationOrigin: 'editorial', paidAt: new Date().toISOString() })],
      { dryRun: false },
    ),
  );
  assert.equal(count(db, 'listings'), 0);
  assert.equal(count(db, 'import_sources'), 0);
});
test('editorial expiry follows the earlier application deadline and only actual administrators can close it', () => {
  const { admin, member } = setup(),
    deadline = new Date(Date.now() + 2 * 86400000).toISOString();
  const result = store.importEditorialListings(
    admin.id,
    'eurobrussels.com',
    [sourceRow('deadline', { deadline })],
    { dryRun: false, publish: true },
  );
  const listing = store.getListingById(result.listings[0].listingId)!;
  assert.equal(listing.entitlementExpiresAt, deadline);
  assert.throws(
    () => store.transitionListing(listing.id, member.id, 'admin', listing.version, 'close'),
    errorStatus(403),
  );
  assert.throws(
    () =>
      store.updateListing(listing.id, admin.id, admin.role, listing.version, {
        title: 'Replacement employer post',
      }),
    errorStatus(403),
  );
  assert.equal(
    store.transitionListing(listing.id, admin.id, admin.role, listing.version, 'close').status,
    'closed',
  );
  assert.equal(store.getStats().jobs, 0);
});
test('deduplication covers source identity and matching title, organization, location and country across sources', () => {
  const { admin, db } = setup();
  const row = sourceRow('first', { url: 'https://example.org/jobs/role?utm_source=board' });
  const first = store.importEditorialListings(admin.id, 'eurobrussels.com', [row], {
    dryRun: false,
    publish: true,
  });
  const before = store.getListingById(first.listings[0].listingId)!;
  assert.equal(
    store.importEditorialListings(admin.id, 'eurobrussels.com', [row], {
      dryRun: false,
      publish: true,
    }).skipped,
    1,
  );
  const sameUrl = sourceRow(
    'second',
    {
      title: ' european   POLICY analyst ',
      location: ' brussels ',
      country: 'BELGIUM',
      url: 'https://example.org/jobs/role?utm_source=other',
    },
    'jobsin.brussels',
  );
  assert.equal(
    store.importEditorialListings(admin.id, 'jobsin.brussels', [sameUrl], {
      dryRun: false,
      publish: true,
    }).skipped,
    1,
  );
  const sameIdentity = sourceRow(
    'third',
    {
      title: ' european   POLICY analyst ',
      organization: 'example POLICY lab',
      url: 'https://example.org/careers/different-url',
    },
    'jobsin.brussels',
  );
  assert.equal(
    store.importEditorialListings(admin.id, 'jobsin.brussels', [sameIdentity], {
      dryRun: false,
      publish: true,
    }).skipped,
    1,
  );
  const distinct = sourceRow('fourth', { organization: 'Example Policy-Lab' }, 'jobsin.brussels');
  assert.equal(
    store.importEditorialListings(admin.id, 'jobsin.brussels', [distinct], {
      dryRun: false,
      publish: true,
    }).imported,
    1,
  );
  assert.equal(count(db, 'listings'), 2);
  assert.equal(count(db, 'import_sources'), 4);
  const after = store.getListingById(before.id)!;
  assert.equal(after.version, before.version);
  assert.equal(after.entitlementExpiresAt, before.entitlementExpiresAt);
});
test('an import failure rolls back listings, organizations, source reservations, audit and import run together', () => {
  const { admin, db } = setup();
  db.exec(
    "CREATE TRIGGER fail_second_import BEFORE INSERT ON listings WHEN NEW.title='Fail this import' BEGIN SELECT RAISE(ABORT,'fixture storage failure'); END",
  );
  assert.throws(() =>
    store.importEditorialListings(
      admin.id,
      'eurobrussels.com',
      [
        sourceRow('first'),
        sourceRow('second', { title: 'Fail this import', organization: 'Another Company' }),
      ],
      { dryRun: false, publish: true },
    ),
  );
  for (const table of ['listings', 'organizations', 'audit', 'import_sources', 'import_runs'])
    assert.equal(count(db, table), 0, table);
});
test('ordinary employer requirements and payment gates remain unchanged and editorial records cannot enter checkout', async () => {
  const { admin, member, db } = setup();
  assert.throws(() => store.createListing(member.id, sourceRow().listing));
  const input = {
    ...sourceRow().listing,
    employmentType: 'Permanent',
    seniority: 'Mid-level',
    workMode: 'Hybrid',
  };
  assert.throws(() => store.createListing(member.id, { ...input, publicationOrigin: 'editorial' }));
  const employer = store.createListing(member.id, input);
  assert.equal(employer.publicationOrigin, 'employer');
  assert.throws(
    () => store.transitionListing(employer.id, member.id, member.role, employer.version, 'submit'),
    errorStatus(402),
  );
  const duplicate = store.importEditorialListings(admin.id, 'eurobrussels.com', [sourceRow()], {
    dryRun: false,
    publish: true,
  });
  assert.equal(duplicate.skipped, 1);
  assert.equal(store.getListingById(employer.id)?.publicationOrigin, 'employer');
  assert.equal(store.getListingById(employer.id)?.status, 'draft');
  const imported = store.importEditorialListings(
    admin.id,
    'eurobrussels.com',
    [sourceRow('different', { title: 'Different sourced job' })],
    { dryRun: false },
  );
  const provider: BillingProvider = {
    create: async () => {
      throw new Error('Must not call Stripe');
    },
    retrieve: async () => {
      throw new Error('Must not call Stripe');
    },
  };
  await assert.rejects(
    () => createCheckout(admin.id, imported.listings[0].listingId, 'basic', provider),
    errorStatus(403),
  );
  assert.equal(count(db, 'payment_orders'), 0);
});
test('CLI --publish alone remains a dry run; --apply creates drafts; --apply --publish requires an administrator', () => {
  const { directory, admin, member, db } = setup();
  const file = join(directory, 'source.json');
  writeFileSync(file, JSON.stringify([sourceRow('cli')]));
  const run = (identity: string, flags: string[]) =>
    spawnSync(
      process.execPath,
      [
        resolve('node_modules/tsx/dist/cli.mjs'),
        'scripts/import-listings.ts',
        '--file',
        file,
        '--source',
        'eurobrussels.com',
        '--admin',
        identity,
        ...flags,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATA_DIR: directory, EUJOBS_SEED: '0' },
        encoding: 'utf8',
      },
    );
  const denied = run(member.email, ['--apply', '--publish']);
  assert.equal(denied.status, 1);
  assert.equal(count(db, 'listings'), 0);
  const preview = run(admin.email, ['--publish']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).wouldPublish, 1);
  assert.equal(count(db, 'listings'), 0);
  const applied = run(admin.email, ['--apply']);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).published, 0);
  assert.equal(store.getStats().jobs, 0);
  const published = run(admin.email, ['--apply', '--publish']);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(JSON.parse(published.stdout).published, 1);
  assert.equal(store.getStats().jobs, 1);
});

test('shared application pages never merge different roles, employers, cities or countries', () => {
  const { admin, db } = setup();
  const url = 'https://example.org/careers';
  const rows = [
    sourceRow('shared-a', { title: 'Policy Officer', url }),
    sourceRow('shared-b', { title: 'Communications Officer', url }),
    sourceRow('shared-c', { title: 'Policy Officer', organization: 'Different Employer', url }),
    sourceRow('shared-d', { title: 'Policy Officer', location: 'Paris', country: 'France', url }),
    sourceRow('shared-e', { title: 'Policy Officer', country: 'Different Country', url }),
  ];
  const preview = store.importEditorialListings(admin.id, 'eurobrussels.com', rows, {
    publish: true,
  });
  assert.equal(preview.wouldImport, 5);
  assert.equal(preview.skipped, 0);
  const imported = store.importEditorialListings(admin.id, 'eurobrussels.com', rows, {
    dryRun: false,
    publish: true,
  });
  assert.equal(imported.imported, 5);
  assert.equal(imported.skipped, 0);
  assert.equal(store.getStats().jobs, 5);
  assert.equal(new Set(imported.listings.map((row) => row.listingId)).size, 5);
  assert.equal(count(db, 'import_sources'), 5);
  // Source ID remains authoritative even if a subsequent scrape changes its display fields.
  const replay = store.importEditorialListings(
    admin.id,
    'eurobrussels.com',
    [sourceRow('shared-a', { title: 'Changed displayed title', location: 'Another city', url })],
    { dryRun: false, publish: true },
  );
  assert.equal(replay.skipped, 1);
  assert.equal(replay.listings[0].listingId, imported.listings[0].listingId);
});

test('same role and employer in separate locations stays distinct and maps cross-source duplicates to the right city', () => {
  const { admin, db } = setup();
  const rows = [
    sourceRow('brussels', {
      title: 'Policy Officer',
      location: 'Brussels',
      country: 'Belgium',
      url: 'https://example.org/jobs/brussels',
    }),
    sourceRow('paris', {
      title: 'Policy Officer',
      location: 'Paris',
      country: 'France',
      url: 'https://example.org/jobs/paris',
    }),
  ];
  const original = store.importEditorialListings(admin.id, 'eurobrussels.com', rows, {
    dryRun: false,
    publish: true,
  });
  assert.equal(original.imported, 2);
  assert.equal(original.skipped, 0);
  const candidates = [
    sourceRow(
      'copy-paris',
      {
        title: ' policy   OFFICER ',
        organization: 'EXAMPLE POLICY LAB',
        location: ' paris ',
        country: 'FRANCE',
        url: 'https://example.org/careers',
      },
      'jobsin.brussels',
    ),
    sourceRow(
      'copy-brussels',
      {
        title: 'Policy Officer',
        location: 'Brussels',
        country: 'Belgium',
        url: 'https://example.org/careers',
      },
      'jobsin.brussels',
    ),
  ];
  const duplicate = store.importEditorialListings(admin.id, 'jobsin.brussels', candidates, {
    dryRun: false,
    publish: true,
  });
  assert.equal(duplicate.imported, 0);
  assert.equal(duplicate.skipped, 2);
  assert.equal(duplicate.listings[0].listingId, original.listings[1].listingId);
  assert.equal(duplicate.listings[1].listingId, original.listings[0].listingId);
  assert.equal(count(db, 'listings'), 2);
  assert.equal(count(db, 'import_sources'), 4);
});
