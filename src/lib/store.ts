import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createSampleListings } from './seed';
import { hasJobEntitlement, JOB_DURATION_DAYS } from './plans';
import { CATEGORIES } from './categories';
import { resourceList } from './resources';
import { isCompetitorUrl, stripCompetitorLinks } from './competitors';
import { TOPICS, WORK_MODES, EMPLOYMENT_TYPES, SENIORITIES, EVENT_TYPES } from './types';
import type {
  Listing,
  SearchFilters,
  SearchResult,
  User,
  UserRole,
  SavedSearch,
  ContactMessage,
  AuditEntry,
} from './types';

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}
const connections = new Map<string, DatabaseSync>();
const nowIso = () => new Date().toISOString();
const listingColumns: (keyof Listing)[] = [
  'id',
  'slug',
  'kind',
  'title',
  'organization',
  'organizationId',
  'initials',
  'color',
  'location',
  'country',
  'topic',
  'summary',
  'description',
  'status',
  'ownerId',
  'version',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'isSample',
  'featured',
  'sourceUrl',
  'sourceCheckedAt',
  'url',
  'employmentType',
  'seniority',
  'workMode',
  'salaryMin',
  'salaryMax',
  'salaryPeriod',
  'salaryDisplay',
  'deadline',
  'startsAt',
  'endsAt',
  'timezone',
  'eventType',
  'eventDateOnly',
  'entitySlug',
  'venue',
  'price',
  'rejectionReason',
  'paymentOrderId',
  'paidAt',
  'planId',
  'entitlementExpiresAt',
  'placement',
  'categorySlug',
  'policyTags',
  'blockAIApplications',
  'publicationOrigin',
  'externalSource',
  'sourceIdentity',
  'applicationMethod',
  'applicationInstructions',
  'employerSourceUrl',
];
const boolFields = new Set<keyof Listing>([
  'isSample',
  'featured',
  'blockAIApplications',
  'eventDateOnly',
]);
function listingValues(listing: Listing): SQLInputValue[] {
  return listingColumns.map((k) =>
    k === 'policyTags'
      ? JSON.stringify(listing.policyTags || [])
      : boolFields.has(k)
        ? Number(!!listing[k])
        : ((listing[k] ??
            (k === 'placement'
              ? 0
              : k === 'categorySlug'
                ? 'unknown'
                : k === 'publicationOrigin'
                  ? 'employer'
                  : null)) as SQLInputValue),
  );
}
function listingFromRow(row: Record<string, unknown>): Listing {
  const clean = (v: unknown) => (isCompetitorUrl(v) ? null : v);
  return {
    ...row,
    url: clean(row.url),
    sourceUrl: clean(row.sourceUrl),
    ...('employerSourceUrl' in row ? { employerSourceUrl: clean(row.employerSourceUrl) } : {}),
    ...(typeof row.description === 'string'
      ? { description: stripCompetitorLinks(row.description) }
      : {}),
    ...(typeof row.applicationInstructions === 'string'
      ? { applicationInstructions: stripCompetitorLinks(row.applicationInstructions) }
      : {}),
    isSample: !!row.isSample,
    featured: !!row.featured,
    blockAIApplications: !!row.blockAIApplications,
    eventDateOnly: !!row.eventDateOnly,
    policyTags: JSON.parse(String(row.policyTags || '[]')),
  } as unknown as Listing;
}
function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function insertListing(db: DatabaseSync, listing: Listing) {
  db.prepare(
    `INSERT INTO listings (${listingColumns.join(',')}) VALUES (${listingColumns.map(() => '?').join(',')})`,
  ).run(...listingValues(listing));
}

/** Lazy local SQLite, with no fallback that could mistake a database failure for zero inventory. */
export function getDb(): DatabaseSync {
  const directory = resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || './data');
  const existing = connections.get(directory);
  if (existing) return existing;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, 'eujobs.sqlite'));
  try {
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')), createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expiresAt);
      CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, identityKey TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('job','event')),
        title TEXT NOT NULL, organization TEXT NOT NULL, organizationId TEXT NOT NULL REFERENCES organizations(id),
        initials TEXT NOT NULL, color TEXT NOT NULL, location TEXT NOT NULL, country TEXT NOT NULL, topic TEXT NOT NULL,
        summary TEXT NOT NULL, description TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','pending','published','rejected','closed')),
        ownerId TEXT REFERENCES users(id), version INTEGER NOT NULL CHECK(version > 0),
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, publishedAt TEXT,
        isSample INTEGER NOT NULL DEFAULT 0 CHECK(isSample IN (0,1)), featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
        sourceUrl TEXT, sourceCheckedAt TEXT, url TEXT, employmentType TEXT, seniority TEXT, workMode TEXT,
        salaryMin REAL, salaryMax REAL, salaryPeriod TEXT CHECK(salaryPeriod IS NULL OR salaryPeriod IN ('year','month')),
        deadline TEXT, startsAt TEXT, endsAt TEXT, timezone TEXT NOT NULL, eventType TEXT, venue TEXT, price REAL, rejectionReason TEXT,
        CHECK(salaryMin IS NULL OR salaryMin >= 0), CHECK(salaryMax IS NULL OR salaryMax >= salaryMin),
        CHECK(price IS NULL OR price >= 0), CHECK(endsAt IS NULL OR endsAt > startsAt),
        CHECK(isSample = 0 OR (sourceUrl IS NULL AND sourceCheckedAt IS NULL AND url IS NULL))
      );
      CREATE INDEX IF NOT EXISTS listings_discovery ON listings(status,kind,createdAt DESC,id);
      CREATE INDEX IF NOT EXISTS listings_events ON listings(status,kind,startsAt,endsAt);
      CREATE INDEX IF NOT EXISTS listings_deadlines ON listings(status,kind,deadline);
      CREATE INDEX IF NOT EXISTS listings_organization ON listings(organizationId,status);
      CREATE INDEX IF NOT EXISTS listings_owner ON listings(ownerId,updatedAt DESC);
      CREATE INDEX IF NOT EXISTS listings_facets ON listings(status,kind,location,topic);
      CREATE TABLE IF NOT EXISTS saved (
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, createdAt TEXT NOT NULL,
        PRIMARY KEY(userId,listingId)
      );
      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, filters TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS saved_search_owner ON saved_searches(userId,createdAt DESC);
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY, listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        actorId TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_listing ON audit(listingId,createdAt DESC);
    `);
    // Additive migration: keep existing drafts, accounts, and listings intact.
    if (
      !db
        .prepare('PRAGMA table_info(users)')
        .all()
        .some((field) => field.name === 'accountKind')
    )
      db.exec(
        "ALTER TABLE users ADD COLUMN accountKind TEXT NOT NULL DEFAULT 'registered' CHECK(accountKind IN ('registered','guest'))",
      );
    const listingFields = new Set(
      db
        .prepare('PRAGMA table_info(listings)')
        .all()
        .map((r) => r.name),
    );
    for (const [field, declaration] of Object.entries({
      paymentOrderId: 'TEXT',
      paidAt: 'TEXT',
      planId: 'TEXT',
      entitlementExpiresAt: 'TEXT',
      placement: 'INTEGER NOT NULL DEFAULT 0',
      categorySlug: "TEXT NOT NULL DEFAULT 'unknown'",
      policyTags: "TEXT NOT NULL DEFAULT '[]'",
      blockAIApplications: 'INTEGER NOT NULL DEFAULT 0',
      publicationOrigin: "TEXT NOT NULL DEFAULT 'employer'",
      externalSource: 'TEXT',
      sourceIdentity: 'TEXT',
      applicationMethod: 'TEXT',
      applicationInstructions: 'TEXT',
      employerSourceUrl: 'TEXT',
      salaryDisplay: 'TEXT',
      eventDateOnly: 'INTEGER NOT NULL DEFAULT 0',
      entitySlug: 'TEXT',
    })) {
      if (!listingFields.has(field))
        db.exec(`ALTER TABLE listings ADD COLUMN ${field} ${declaration}`);
    }
    db.exec(`CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY, listingId TEXT NOT NULL REFERENCES listings(id), ownerId TEXT NOT NULL REFERENCES users(id),
      plan TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'eur', listingVersion INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','expired','refunded')),
      sessionId TEXT UNIQUE, checkoutUrl TEXT, expiresAt TEXT, createdAt TEXT NOT NULL, paidAt TEXT,
      paymentIntentId TEXT, invoiceUrl TEXT, receiptUrl TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payment_open_listing ON payment_orders(listingId) WHERE status='open';
    CREATE INDEX IF NOT EXISTS payment_owner ON payment_orders(ownerId,createdAt DESC);
    CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY, type TEXT NOT NULL, receivedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS import_sources (source TEXT NOT NULL, sourceId TEXT NOT NULL, listingId TEXT REFERENCES listings(id), importedAt TEXT NOT NULL, PRIMARY KEY(source, sourceId));
    CREATE TABLE IF NOT EXISTS import_runs (id TEXT PRIMARY KEY, source TEXT NOT NULL, sha256 TEXT NOT NULL, state TEXT NOT NULL, imported INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS editorial_revisions (
      id TEXT PRIMARY KEY, listingId TEXT NOT NULL REFERENCES listings(id), actorId TEXT NOT NULL REFERENCES users(id),
      source TEXT NOT NULL, sourceId TEXT NOT NULL, inputHash TEXT NOT NULL, previousContent TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guest_postings (
      listingId TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
      ownerId TEXT NOT NULL UNIQUE REFERENCES users(id), contactEmail TEXT NOT NULL,
      requestId TEXT NOT NULL UNIQUE, requestTokenHash TEXT NOT NULL, inputHash TEXT NOT NULL,
      createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guest_management_tokens (
      tokenHash TEXT PRIMARY KEY, listingId TEXT NOT NULL REFERENCES guest_postings(listingId) ON DELETE CASCADE,
      createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guest_tokens_listing ON guest_management_tokens(listingId);
    `);
    if (
      process.env.EUJOBS_SEED === '1' &&
      !db.prepare("SELECT value FROM metadata WHERE key='sample-seed-v1'").get()
    ) {
      transaction(db, () => {
        // Recheck under the write lock in case another server worker initialized concurrently.
        if (db.prepare("SELECT value FROM metadata WHERE key='sample-seed-v1'").get()) return;
        const count = db.prepare('SELECT COUNT(*) AS n FROM listings').get() as { n: number };
        if (count.n === 0) {
          for (const listing of createSampleListings()) {
            db.prepare(
              'INSERT OR IGNORE INTO organizations(id,name,identityKey) VALUES(?,?,?)',
            ).run(
              listing.organizationId,
              listing.organization,
              organizationKey(listing.organization),
            );
            insertListing(db, listing);
          }
        }
        db.prepare("INSERT INTO metadata(key,value) VALUES('sample-seed-v1',?)").run(nowIso());
      });
    }
    connections.set(directory, db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new StoreError(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'Input'}: ${issue.message}`)
        .join('; '),
    );
  return result.data;
}
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);
const webUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a complete http:// or https:// URL without credentials.')
  .nullable()
  .optional()
  .transform((value) => value || null);
const amount = z
  .number()
  .finite()
  .min(0)
  .max(10000000)
  .nullable()
  .optional()
  .transform((value) => value ?? null);
export const JOB_DESCRIPTION_MIN = 30;
export const EVENT_DESCRIPTION_MIN = 80;
const inputSchema = z
  .object({
    kind: z.enum(['job', 'event']),
    title: z.string().trim().min(4).max(140),
    organization: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(100),
    country: z.string().trim().min(2).max(100),
    topic: z.enum(TOPICS),
    categorySlug: z.enum(CATEGORIES.map((c) => c.slug)).default('unknown'),
    policyTags: z.array(z.string().trim().min(2).max(60)).max(4).default([]),
    blockAIApplications: z.boolean().default(false),
    summary: z.string().trim().min(20).max(300),
    description: z.string().trim().min(JOB_DESCRIPTION_MIN).max(20000),
    sourceUrl: webUrl,
    url: webUrl,
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
    seniority: z.enum(SENIORITIES).nullable().optional(),
    workMode: z.enum(WORK_MODES).nullable().optional(),
    salaryMin: amount,
    salaryMax: amount,
    salaryPeriod: z.enum(['year', 'month']).nullable().optional(),
    deadline: optionalText(50),
    startsAt: optionalText(50),
    endsAt: optionalText(50),
    timezone: z.string().trim().max(100).default('Europe/Brussels'),
    eventType: z.enum(EVENT_TYPES).nullable().optional(),
    venue: optionalText(200),
    price: amount,
  })
  .strict();
type ListingInput = z.infer<typeof inputSchema>;

function parseTimestamp(value: string, name: string, endOfDay = false): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const valid = dateOnly
    ? z.iso.date().safeParse(value)
    : z.iso.datetime({ offset: true }).safeParse(value);
  if (!valid.success) throw new StoreError(`${name}: use an ISO date with an explicit timezone.`);
  const parsed = new Date(
    dateOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value,
  );
  if (Number.isNaN(parsed.getTime()) || (dateOnly && parsed.toISOString().slice(0, 10) !== value))
    throw new StoreError(`${name}: enter a valid date.`);
  return parsed.toISOString();
}
/** Date-only controls describe the Brussels calendar; explicit ISO timestamps stay exact. */
export function calendarBoundary(
  value: string,
  name: string,
  endOfDay = false,
  timezone = 'Europe/Brussels',
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseTimestamp(value, name);
  validate(z.iso.date(), value);
  const wallDay = new Date(`${value}T00:00:00.000Z`);
  if (endOfDay) wallDay.setUTCDate(wallDay.getUTCDate() + 1);
  const target = wallDay.getTime();
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  // Resolve the offset at that midnight, rather than assuming every local day lasts 24h.
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = formatter.formatToParts(new Date(guess));
    const part = (key: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === key)!.value;
    const actualWallTime = Date.parse(
      `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.000Z`,
    );
    const adjustment = target - actualWallTime;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess - (endOfDay ? 1 : 0)).toISOString();
}
function parseInput(input: unknown, allowUnknownJobFields = false): ListingInput {
  const value = validate(inputSchema, input);
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format();
  } catch {
    throw new StoreError('timezone: select a valid IANA timezone.');
  }
  // Jobs need 30+ characters (the team formats during review); events keep the 80-character minimum.
  if (value.kind === 'event' && value.description.length < EVENT_DESCRIPTION_MIN)
    throw new StoreError(
      `description: use at least ${EVENT_DESCRIPTION_MIN} characters for an event.`,
    );
  if (value.kind === 'job') {
    if (!allowUnknownJobFields && (!value.employmentType || !value.seniority || !value.workMode))
      throw new StoreError('Choose an employment type, seniority and work mode.');
    if (value.salaryMin !== null && !value.salaryPeriod)
      throw new StoreError('Choose a salary period.');
    if (value.salaryMax !== null && (value.salaryMin === null || value.salaryMax < value.salaryMin))
      throw new StoreError('Salary maximum must be at least the minimum.');
    if (value.deadline) value.deadline = calendarBoundary(value.deadline, 'deadline', true);
    value.startsAt = null;
    value.endsAt = null;
    value.eventType = null;
    value.venue = null;
    value.price = null;
    if (value.salaryMin === null) value.salaryPeriod = null;
  } else {
    if (!value.startsAt || !value.endsAt || !value.eventType)
      throw new StoreError('Choose an event type, start and end time.');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.startsAt) || /^\d{4}-\d{2}-\d{2}$/.test(value.endsAt))
      throw new StoreError('Event times must include a time and timezone.');
    value.startsAt = parseTimestamp(value.startsAt, 'startsAt');
    value.endsAt = parseTimestamp(value.endsAt, 'endsAt');
    if (value.endsAt <= value.startsAt) throw new StoreError('The event must end after it starts.');
    if (value.eventType !== 'Webinar' && !value.venue) throw new StoreError('Add the event venue.');
    value.employmentType = null;
    value.seniority = null;
    value.workMode = null;
    value.salaryMin = null;
    value.salaryMax = null;
    value.salaryPeriod = null;
    value.deadline = null;
  }
  return value;
}
function organizationKey(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}
function organizationId(db: DatabaseSync, name: string) {
  const key = organizationKey(name);
  const found = db.prepare('SELECT id FROM organizations WHERE identityKey=?').get(key) as
    { id: string } | undefined;
  if (found) return found.id;
  const id = randomUUID();
  db.prepare('INSERT INTO organizations(id,name,identityKey) VALUES(?,?,?)').run(id, name, key);
  return id;
}
const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
const slugFor = (title: string, id: string) =>
  `${
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 85) || 'listing'
  }-${id}`;
function audit(db: DatabaseSync, listingId: string, actorId: string, action: string) {
  db.prepare('INSERT INTO audit(id,listingId,actorId,action,createdAt) VALUES(?,?,?,?,?)').run(
    randomUUID(),
    listingId,
    actorId,
    action,
    nowIso(),
  );
}
function mustUser(userId: string): User {
  const user = findUserById(userId);
  if (!user) throw new StoreError('Sign in to continue.', 401);
  return user;
}
function mustListing(db: DatabaseSync, id: string): Listing {
  const row = db.prepare('SELECT * FROM listings WHERE id=?').get(id);
  if (!row) throw new StoreError('Listing not found.', 404);
  return listingFromRow(row);
}
function checkVersion(listing: Listing, version: number) {
  if (!Number.isInteger(version) || version < 1)
    throw new StoreError('A valid listing version is required.');
  if (listing.version !== version)
    throw new StoreError('This listing changed in another session. Refresh and try again.', 409);
}
function writeListing(db: DatabaseSync, listing: Listing, previousVersion: number) {
  const columns = listingColumns.filter((k) => k !== 'id');
  const values = columns.map((k) =>
    k === 'policyTags'
      ? JSON.stringify(listing.policyTags || [])
      : boolFields.has(k)
        ? Number(!!listing[k])
        : ((listing[k] ??
            (k === 'placement'
              ? 0
              : k === 'categorySlug'
                ? 'unknown'
                : k === 'publicationOrigin'
                  ? 'employer'
                  : null)) as SQLInputValue),
  );
  const result = db
    .prepare(
      `UPDATE listings SET ${columns.map((k) => `${k}=?`).join(',')} WHERE id=? AND version=?`,
    )
    .run(...values, listing.id, previousVersion);
  if (result.changes !== 1)
    throw new StoreError('This listing changed in another session. Refresh and try again.', 409);
}

function buildDraftListing(db: DatabaseSync, userId: string, parsed: ListingInput): Listing {
  const id = randomUUID(),
    now = nowIso();
  const listing: Listing = {
    ...parsed,
    id,
    slug: slugFor(parsed.title, id),
    organizationId: organizationId(db, parsed.organization),
    initials: initialsFor(parsed.organization),
    color: '#d9edc9',
    ownerId: userId,
    status: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    isSample: false,
    featured: false,
    sourceCheckedAt: null,
    publicationOrigin: 'employer',
    externalSource: null,
    sourceIdentity: null,
    paymentOrderId: null,
    paidAt: null,
    planId: null,
    entitlementExpiresAt: null,
    placement: 0,
    employmentType: parsed.employmentType ?? null,
    seniority: parsed.seniority ?? null,
    workMode: parsed.workMode ?? null,
    salaryPeriod: parsed.salaryPeriod ?? null,
    eventType: parsed.eventType ?? null,
    rejectionReason: null,
  };
  return listing;
}
export function createListing(userId: string, input: unknown): Listing {
  mustUser(userId);
  const parsed = parseInput(input);
  const db = getDb();
  return transaction(db, () => {
    const listing = buildDraftListing(db, userId, parsed);
    insertListing(db, listing);
    audit(db, listing.id, userId, 'created');
    return listing;
  });
}
export interface GuestPostingRecord {
  listingId: string;
  ownerId: string;
  contactEmail: string;
  requestId: string;
  requestTokenHash: string;
  inputHash: string;
  createdAt: string;
  expiresAt: string;
}
/** Server-only creation: an isolated, non-login owner and its draft are committed together. */
export function createGuestOwnedListing(
  input: unknown,
  registration: {
    requestId: string;
    tokenHash: string;
    contactEmail: string;
  },
): { listing: Listing; guest: GuestPostingRecord; replayed: boolean } {
  const parsed = parseInput(input);
  if (parsed.kind !== 'job') throw new StoreError('Guest posting is available for jobs only.');
  const details = validate(
    z
      .object({
        requestId: z.uuid(),
        tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
        contactEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
      })
      .strict(),
    registration,
  );
  const inputHash = createHash('sha256')
    .update(JSON.stringify({ listing: parsed, contactEmail: details.contactEmail }))
    .digest('hex');
  const db = getDb();
  return transaction(db, () => {
    const existing = db
      .prepare('SELECT * FROM guest_postings WHERE requestId=?')
      .get(details.requestId) as unknown as GuestPostingRecord | undefined;
    if (existing) {
      if (
        !timingSafeEqual(
          Buffer.from(existing.requestTokenHash, 'hex'),
          Buffer.from(details.tokenHash, 'hex'),
        ) ||
        existing.inputHash !== inputHash
      )
        throw new StoreError(
          'This draft request has already been used with different details.',
          409,
        );
      if (existing.expiresAt <= nowIso())
        throw new StoreError('This management link has expired.', 401);
      return { listing: mustListing(db, existing.listingId), guest: existing, replayed: true };
    }
    const ownerId = randomUUID(),
      createdAt = nowIso();
    db.prepare(
      "INSERT INTO users(id,name,email,passwordHash,role,createdAt,accountKind) VALUES(?,?,?,?,?,?, 'guest')",
    ).run(
      ownerId,
      'Guest employer',
      `${randomBytes(32).toString('hex')}@guest.eujobs.invalid`,
      `guest-disabled$${randomBytes(32).toString('hex')}`,
      'member',
      createdAt,
    );
    const listing = buildDraftListing(db, ownerId, parsed);
    insertListing(db, listing);
    const guest: GuestPostingRecord = {
      listingId: listing.id,
      ownerId,
      contactEmail: details.contactEmail,
      requestId: details.requestId,
      requestTokenHash: details.tokenHash,
      inputHash,
      createdAt,
      expiresAt: new Date(Date.now() + 120 * 24 * 3600000).toISOString(),
    };
    db.prepare(
      'INSERT INTO guest_postings(listingId,ownerId,contactEmail,requestId,requestTokenHash,inputHash,createdAt,expiresAt) VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      guest.listingId,
      guest.ownerId,
      guest.contactEmail,
      guest.requestId,
      guest.requestTokenHash,
      guest.inputHash,
      guest.createdAt,
      guest.expiresAt,
    );
    db.prepare(
      'INSERT INTO guest_management_tokens(tokenHash,listingId,createdAt,expiresAt) VALUES(?,?,?,?)',
    ).run(details.tokenHash, listing.id, createdAt, guest.expiresAt);
    audit(db, listing.id, ownerId, 'guest draft created');
    return { listing, guest, replayed: false };
  });
}
export function updateListing(
  id: string,
  userId: string,
  _role: UserRole,
  version: number,
  input: unknown,
): Listing {
  mustUser(userId);
  const db = getDb();
  return transaction(db, () => {
    const current = mustListing(db, id);
    if (current.publicationOrigin === 'editorial')
      throw new StoreError(
        'Sourced listings are managed through the editorial import process.',
        403,
      );
    if (current.ownerId !== userId)
      throw new StoreError('Only the listing owner can edit this submission.', 403);
    checkVersion(current, version);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new StoreError('Provide listing fields.');
    const editable = Object.fromEntries(
      Object.keys(inputSchema.shape).map((key) => [key, current[key as keyof Listing]]),
    );
    const parsed = parseInput({ ...editable, ...input });
    if (parsed.kind !== current.kind)
      throw new StoreError('A listing cannot change between job and event.');
    const updated: Listing = {
      ...current,
      ...parsed,
      ...(current.kind === 'job' && current.status === 'closed'
        ? {
            paymentOrderId: null,
            paidAt: null,
            planId: null,
            entitlementExpiresAt: null,
            placement: 0,
            featured: false,
          }
        : {}),
      organizationId: organizationId(db, parsed.organization),
      initials: initialsFor(parsed.organization),
      employmentType: parsed.employmentType ?? null,
      seniority: parsed.seniority ?? null,
      workMode: parsed.workMode ?? null,
      salaryPeriod: parsed.salaryPeriod ?? null,
      eventType: parsed.eventType ?? null,
      status: 'draft',
      version: current.version + 1,
      updatedAt: nowIso(),
      publishedAt: null,
      sourceCheckedAt: null,
      rejectionReason: null,
    };
    writeListing(db, updated, current.version);
    audit(db, id, userId, 'edited; publication revoked');
    return updated;
  });
}
export function transitionListing(
  id: string,
  userId: string,
  _role: UserRole,
  version: number,
  action: 'submit' | 'approve' | 'reject' | 'close',
  reason?: string,
): Listing {
  const user = mustUser(userId),
    db = getDb();
  return transaction(db, () => {
    const current = mustListing(db, id);
    const editorial = current.publicationOrigin === 'editorial';
    if (editorial && (action !== 'close' || user.role !== 'admin'))
      throw new StoreError(
        'Only an administrator can close sourced listings; publication requires an editorial import.',
        403,
      );
    const review = action === 'approve' || action === 'reject';
    if (
      editorial
        ? user.role !== 'admin'
        : review
          ? user.role !== 'admin'
          : current.ownerId !== userId
    )
      throw new StoreError(
        review
          ? 'Administrator access required.'
          : 'Only the listing owner can change this submission.',
        403,
      );
    checkVersion(current, version);
    const allowed: Record<string, Listing['status'][]> = {
      submit: ['draft', 'rejected'],
      approve: ['pending'],
      reject: ['pending'],
      close: ['published'],
    };
    if (!allowed[action]?.includes(current.status))
      throw new StoreError(`Cannot ${action} a ${current.status} listing.`, 409);
    if (action === 'submit' || action === 'approve') {
      if (
        current.kind === 'job' &&
        process.env.EUJOBS_REQUIRE_PAYMENT !== '0' &&
        !hasJobEntitlement(current)
      )
        throw new StoreError(
          'Payment is required before this job can be reviewed or published. Choose a posting plan.',
          402,
        );
      if (!current.url)
        throw new StoreError('Add an application or registration URL before submitting.');
      if (current.kind === 'job' && current.deadline && current.deadline <= nowIso())
        throw new StoreError('The application deadline has already passed.');
      if (current.kind === 'event' && (!current.startsAt || current.startsAt <= nowIso()))
        throw new StoreError('Choose an event start time in the future.');
    }
    const rejectionReason =
      action === 'reject' ? validate(z.string().trim().min(5).max(1000), reason) : null;
    const status = (
      { submit: 'pending', approve: 'published', reject: 'rejected', close: 'closed' } as const
    )[action];
    const updated: Listing = {
      ...current,
      status,
      version: current.version + 1,
      updatedAt: nowIso(),
      rejectionReason,
      publishedAt: action === 'approve' ? nowIso() : current.publishedAt,
      entitlementExpiresAt:
        action === 'approve' &&
        current.kind === 'job' &&
        current.paidAt &&
        !current.entitlementExpiresAt
          ? new Date(Date.now() + JOB_DURATION_DAYS * 86400000).toISOString()
          : current.entitlementExpiresAt,
    };
    writeListing(db, updated, current.version);
    audit(db, id, userId, action);
    return updated;
  });
}

const liveWhere =
  "status='published' AND ((kind='job' AND (deadline IS NULL OR deadline > ?) AND (entitlementExpiresAt IS NULL OR entitlementExpiresAt > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) OR (kind='event' AND endsAt > ?))";
const filterSchema = z
  .object({
    kind: z.enum(['job', 'event']).optional(),
    q: z.string().trim().max(200).optional(),
    location: z.string().trim().max(100).optional(),
    topic: z.enum(TOPICS).optional(),
    categorySlug: z.enum(CATEGORIES.map((c) => c.slug)).optional(),
    policyTag: z.string().trim().min(2).max(60).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    seniority: z.enum(SENIORITIES).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    salaryOnly: z.boolean().optional(),
    from: z.string().max(50).optional(),
    to: z.string().max(50).optional(),
    sort: z.enum(['recent', 'salary', 'deadline', 'soonest']).optional(),
    page: z.coerce.number().int().min(1).max(100000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    savedIds: z.array(z.string().min(1).max(100)).max(2000).optional(),
  })
  .strict();
function parsedFilters(filters: unknown): SearchFilters {
  // Empty select controls mean no restriction, not an invalid enum value.
  if (filters !== undefined && (!filters || typeof filters !== 'object' || Array.isArray(filters)))
    throw new StoreError('Provide valid search filters.');
  const cleaned = Object.fromEntries(
    Object.entries((filters || {}) as Record<string, unknown>).filter(
      ([, value]) => value !== '' && value !== undefined,
    ),
  );
  const parsed = validate(filterSchema, cleaned);
  // Validate dates before saving a search as well as before executing one.
  const start = parsed.from ? calendarBoundary(parsed.from, 'from') : null;
  const end = parsed.to ? calendarBoundary(parsed.to, 'to', true) : null;
  if (start && end && start > end) throw new StoreError('The end date must follow the start date.');
  return parsed;
}
const likeLiteral = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
export function searchListings(
  filters: SearchFilters = {},
  options: { excludeSamples?: boolean; publishedAfter?: string; chronological?: boolean } = {},
): SearchResult {
  const f = parsedFilters(filters),
    db = getDb(),
    now = nowIso();
  const clauses = [liveWhere],
    values: SQLInputValue[] = [now, now];
  if (options.excludeSamples) clauses.push('isSample=0');
  if (options.publishedAfter) {
    const publishedAfter = z.iso.datetime({ offset: true }).parse(options.publishedAfter);
    clauses.push('publishedAt >= ?');
    values.push(new Date(publishedAfter).toISOString());
  }
  for (const key of [
    'kind',
    'location',
    'topic',
    'categorySlug',
    'workMode',
    'employmentType',
    'seniority',
    'eventType',
  ] as const) {
    if (f[key]) {
      clauses.push(`${key}=?`);
      values.push(f[key]!);
    }
  }
  if (f.policyTag) {
    clauses.push(
      'EXISTS (SELECT 1 FROM json_each(listings.policyTags) WHERE value = ? COLLATE NOCASE)',
    );
    values.push(f.policyTag);
  }
  if (f.q) {
    clauses.push(
      "(title LIKE ? ESCAPE '\\' OR organization LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')",
    );
    values.push(...Array(4).fill(likeLiteral(f.q)));
  }
  if (f.salaryOnly) clauses.push("kind='job' AND salaryMin IS NOT NULL");
  if (f.from) {
    clauses.push("((kind='event' AND endsAt > ?) OR (kind='job' AND deadline >= ?))");
    const boundary = calendarBoundary(f.from, 'from');
    values.push(boundary, boundary);
  }
  if (f.to) {
    clauses.push("(CASE WHEN kind='event' THEN startsAt ELSE deadline END) <= ?");
    values.push(calendarBoundary(f.to, 'to', true));
  }
  if (f.savedIds) {
    if (!f.savedIds.length) clauses.push('0');
    else {
      clauses.push(`id IN (${f.savedIds.map(() => '?').join(',')})`);
      values.push(...f.savedIds);
    }
  }
  const where = clauses.join(' AND ');
  const order =
    f.sort === 'salary'
      ? "(salaryMin IS NULL), CASE WHEN salaryPeriod='month' THEN salaryMin*12 ELSE salaryMin END DESC, createdAt DESC, id ASC"
      : f.sort === 'deadline'
        ? '(deadline IS NULL), deadline ASC, id ASC'
        : f.sort === 'soonest' || (!f.sort && f.kind === 'event')
          ? '(startsAt IS NULL), startsAt ASC, id ASC'
          : options.chronological
            ? 'publishedAt DESC, id ASC'
            : 'placement DESC, createdAt DESC, id ASC';
  const page = f.page || 1,
    pageSize = f.pageSize || 12;
  const count = db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE ${where}`).get(...values) as {
    n: number;
  };
  const rows = db
    .prepare(`SELECT * FROM listings WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...values, pageSize, (page - 1) * pageSize);
  return {
    items: rows.map(listingFromRow),
    total: count.n,
    page,
    pageSize,
    pages: Math.ceil(count.n / pageSize),
  };
}
export function getListing(slug: string): Listing | null {
  const row = getDb()
    .prepare("SELECT * FROM listings WHERE slug=? AND status IN ('published','closed')")
    .get(slug);
  return row ? listingFromRow(row) : null;
}
export function getListingById(id: string): Listing | null {
  const row = getDb().prepare('SELECT * FROM listings WHERE id=?').get(id);
  return row ? listingFromRow(row) : null;
}
export function getStats(): { jobs: number; events: number; organizations: number } {
  const now = nowIso();
  const row = getDb()
    .prepare(
      `SELECT SUM(kind='job') AS jobs, SUM(kind='event') AS events, COUNT(DISTINCT organizationId) AS organizations FROM listings WHERE ${liveWhere}`,
    )
    .get(now, now) as Record<string, number | null>;
  return { jobs: row.jobs || 0, events: row.events || 0, organizations: row.organizations || 0 };
}
export function getFacets(): { locations: string[]; topics: string[] } {
  const db = getDb(),
    now = nowIso();
  const locations = db
    .prepare(`SELECT DISTINCT location FROM listings WHERE ${liveWhere} ORDER BY location`)
    .all(now, now)
    .map((row) => String(row.location));
  const topics = db
    .prepare(`SELECT DISTINCT topic FROM listings WHERE ${liveWhere} ORDER BY topic`)
    .all(now, now)
    .map((row) => String(row.topic));
  return { locations, topics };
}
export function listOwned(userId: string): Listing[] {
  return getDb()
    .prepare('SELECT * FROM listings WHERE ownerId=? ORDER BY updatedAt DESC,id')
    .all(userId)
    .map(listingFromRow);
}
export function listModeration(): Listing[] {
  return getDb()
    .prepare("SELECT * FROM listings WHERE status='pending' ORDER BY updatedAt,id")
    .all()
    .map(listingFromRow);
}

function userFromRow(row: Record<string, unknown>): User {
  const { id, name, email, role, createdAt } = row;
  return { id, name, email, role, createdAt } as User;
}
export function findUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const row = getDb().prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
  return row ? { ...userFromRow(row), passwordHash: String(row.passwordHash) } : null;
}
export function findUserById(id: string): User | null {
  const row = getDb().prepare('SELECT id,name,email,role,createdAt FROM users WHERE id=?').get(id);
  return row ? userFromRow(row) : null;
}
export function isGuestOwner(userId: string): boolean {
  return (
    getDb().prepare("SELECT 1 FROM users WHERE id=? AND accountKind='guest'").get(userId) !==
    undefined
  );
}
export function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}): User {
  const parsed = validate(
    z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().trim().toLowerCase().max(254),
        passwordHash: z.string().min(20).max(500),
        role: z.enum(['member', 'admin']).default('member'),
      })
      .strict(),
    input,
  );
  const user: User = {
    id: randomUUID(),
    name: parsed.name,
    email: parsed.email,
    role: parsed.role,
    createdAt: nowIso(),
  };
  try {
    getDb()
      .prepare('INSERT INTO users(id,name,email,passwordHash,role,createdAt) VALUES(?,?,?,?,?,?)')
      .run(user.id, user.name, user.email, parsed.passwordHash, user.role, user.createdAt);
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed: users.email'))
      throw new StoreError('An account with this email already exists.', 409);
    throw error;
  }
  return user;
}
/** CLI-only administrative operation; never expose role assignment through registration. */
export function setUserRole(id: string, role: UserRole): User {
  validate(z.enum(['member', 'admin']), role);
  const user = mustUser(id);
  getDb().prepare('UPDATE users SET role=? WHERE id=?').run(role, id);
  return { ...user, role };
}
export function createSession(tokenHash: string, userId: string, expiresAt: string): void {
  mustUser(userId);
  if (isGuestOwner(userId))
    throw new StoreError('Use the private job management link to continue.', 401);
  validate(z.string().regex(/^[a-f0-9]{64}$/), tokenHash);
  const expiry = parseTimestamp(expiresAt, 'session expiry');
  if (expiry <= nowIso()) throw new StoreError('Session expiry must be in the future.');
  const db = getDb();
  transaction(db, () => {
    db.prepare('DELETE FROM sessions WHERE expiresAt<=?').run(nowIso());
    db.prepare('INSERT INTO sessions(tokenHash,userId,expiresAt) VALUES(?,?,?)').run(
      tokenHash,
      userId,
      expiry,
    );
  });
}
export function getSession(tokenHash: string): User | null {
  const row = getDb()
    .prepare(
      "SELECT u.id,u.name,u.email,u.role,u.createdAt FROM sessions s JOIN users u ON s.userId=u.id WHERE s.tokenHash=? AND s.expiresAt>? AND u.accountKind='registered'",
    )
    .get(tokenHash, nowIso());
  return row ? userFromRow(row) : null;
}
export function deleteSession(tokenHash: string): void {
  getDb().prepare('DELETE FROM sessions WHERE tokenHash=?').run(tokenHash);
}
export function getSavedIds(userId: string): string[] {
  return getDb()
    .prepare('SELECT listingId FROM saved WHERE userId=? ORDER BY createdAt DESC,listingId')
    .all(userId)
    .map((row) => String(row.listingId));
}
export function toggleSaved(userId: string, listingId: string): boolean {
  mustUser(userId);
  const db = getDb();
  return transaction(db, () => {
    const existing = db
      .prepare('SELECT 1 FROM saved WHERE userId=? AND listingId=?')
      .get(userId, listingId);
    if (existing) {
      db.prepare('DELETE FROM saved WHERE userId=? AND listingId=?').run(userId, listingId);
      return false;
    }
    const listing = mustListing(db, listingId);
    if (!['published', 'closed'].includes(listing.status))
      throw new StoreError('Listing not found.', 404);
    db.prepare('INSERT INTO saved(userId,listingId,createdAt) VALUES(?,?,?)').run(
      userId,
      listingId,
      nowIso(),
    );
    return true;
  });
}
export function getSavedSearches(userId: string): SavedSearch[] {
  return getDb()
    .prepare('SELECT * FROM saved_searches WHERE userId=? ORDER BY createdAt DESC,id')
    .all(userId)
    .map((row) => ({ ...row, filters: JSON.parse(String(row.filters)) }) as unknown as SavedSearch);
}
export function createSavedSearch(
  userId: string,
  input: { name: string; filters: SearchFilters },
): SavedSearch {
  mustUser(userId);
  const name = validate(z.string().trim().min(2).max(100), input.name),
    filters = parsedFilters(input.filters);
  if (filters.savedIds)
    throw new StoreError('Save a discovery search without a saved-items filter.');
  delete filters.page;
  delete filters.pageSize;
  const result: SavedSearch = { id: randomUUID(), userId, name, filters, createdAt: nowIso() };
  getDb()
    .prepare('INSERT INTO saved_searches(id,userId,name,filters,createdAt) VALUES(?,?,?,?,?)')
    .run(result.id, userId, name, JSON.stringify(filters), result.createdAt);
  return result;
}
export function deleteSavedSearch(userId: string, id: string): void {
  const result = getDb()
    .prepare('DELETE FROM saved_searches WHERE id=? AND userId=?')
    .run(id, userId);
  if (!result.changes) throw new StoreError('Saved search not found.', 404);
}
export function saveContact(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): ContactMessage {
  const parsed = validate(
    z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().trim().toLowerCase().max(254),
        subject: z.string().trim().min(3).max(160),
        message: z.string().trim().min(10).max(5000),
      })
      .strict(),
    input,
  );
  const message: ContactMessage = { ...parsed, id: randomUUID(), createdAt: nowIso() };
  getDb()
    .prepare('INSERT INTO contacts(id,name,email,subject,message,createdAt) VALUES(?,?,?,?,?,?)')
    .run(
      message.id,
      message.name,
      message.email,
      message.subject,
      message.message,
      message.createdAt,
    );
  return message;
}
export function listContacts(): ContactMessage[] {
  return getDb()
    .prepare('SELECT * FROM contacts ORDER BY createdAt DESC,id')
    .all() as unknown as ContactMessage[];
}
export function listAudit(listingId: string): AuditEntry[] {
  return getDb()
    .prepare('SELECT * FROM audit WHERE listingId=? ORDER BY createdAt DESC,id')
    .all(listingId) as unknown as AuditEntry[];
}

export { parseInput as validateListingInput };

export const EDITORIAL_SOURCES = ['eurobrussels.com', 'jobsin.brussels', 'employer'] as const;
export type EditorialSource = (typeof EDITORIAL_SOURCES)[number];
function editorialApplicationUrl(value: string, emailAllowed = false): boolean {
  if (/[\r\n]/.test(value) || /%0[ad]/i.test(value)) return false;
  if (emailAllowed && value.startsWith('mailto:')) {
    try {
      const url = new URL(value);
      const recipients = decodeURIComponent(url.pathname).split(',');
      if (
        value.includes('#') ||
        recipients.length > 5 ||
        !recipients.every((recipient) => z.email().safeParse(recipient.trim()).success)
      )
        return false;
      return [...url.searchParams].every(
        ([key, content]) => key === 'subject' && !/[\r\n]/.test(content),
      );
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !isCompetitorUrl(url.href)
    );
  } catch {
    return false;
  }
}
const enrichmentSchema = z
  .object({
    source: z.enum(EDITORIAL_SOURCES),
    sourceId: z.string().trim().min(1).max(200),
    expectedVersion: z.number().int().positive(),
    description: z.string().trim().min(200).max(20000),
    applicationUrl: z.string().trim().max(2000).nullable(),
    applicationMethod: z.enum(['url', 'email', 'instructions']),
    applicationInstructions: z.string().trim().min(20).max(4000),
    employerSourceUrl: z.string().trim().max(2000).nullable(),
    deadlineOverride: z.string().trim().max(50).optional(),
    salaryOverride: z
      .object({
        min: z.number().finite().positive().nullable(),
        max: z.number().finite().positive().nullable(),
        period: z.enum(['month', 'year']).nullable(),
        display: z.string().trim().min(1).max(250),
      })
      .strict()
      .superRefine((salary, context) => {
        if (salary.min !== null && salary.max !== null && salary.max < salary.min)
          context.addIssue({
            code: 'custom',
            message: 'The maximum salary must be at least the minimum salary.',
            path: ['max'],
          });
        const hasAmount = salary.min !== null || salary.max !== null;
        if (hasAmount !== (salary.period !== null))
          context.addIssue({
            code: 'custom',
            message: 'A salary period is required only when a numeric amount is supplied.',
            path: ['period'],
          });
      })
      .optional(),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/** Operator-only content refresh: immutable identity, ownership, publication, and payment state. */
export function enrichEditorialListings(
  actorId: string,
  input: unknown,
  options: { dryRun?: boolean } = {},
) {
  const actor = mustUser(actorId);
  if (actor.role !== 'admin') throw new StoreError('Administrator access is required.', 403);
  const rows = validate(z.array(enrichmentSchema).min(1).max(1000), input);
  const db = getDb(),
    dryRun = options.dryRun !== false,
    now = nowIso();
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      Date.parse(row.checkedAt) > Date.now() + 300000 ||
      Date.parse(row.checkedAt) < Date.now() - 72 * 3600000
    )
      throw new StoreError(`Source check for ${row.sourceId} must be within 72 hours.`);
    if (
      row.applicationMethod === 'url' &&
      (!row.applicationUrl || !editorialApplicationUrl(row.applicationUrl))
    )
      throw new StoreError('A direct employer application URL is required.');
    if (
      row.applicationMethod === 'email' &&
      (!row.applicationUrl?.startsWith('mailto:') ||
        !editorialApplicationUrl(row.applicationUrl, true))
    )
      throw new StoreError('A valid application email is required.');
    if (
      row.applicationMethod === 'instructions' &&
      row.applicationUrl &&
      !editorialApplicationUrl(row.applicationUrl)
    )
      throw new StoreError('Application instructions must use an employer document or no URL.');
    if (row.employerSourceUrl && !editorialApplicationUrl(row.employerSourceUrl))
      throw new StoreError('Employer evidence must use a direct web URL.');
  }
  return transaction(db, () => {
    const result = {
      mode: dryRun ? 'dry-run' : 'apply',
      updated: 0,
      wouldUpdate: 0,
      skipped: 0,
      listings: [] as { id: string; slug: string; outcome: string }[],
    };
    for (const row of rows) {
      const identity = db
        .prepare('SELECT listingId FROM import_sources WHERE source=? AND sourceId=?')
        .get(row.source, row.sourceId);
      if (!identity?.listingId)
        throw new StoreError(`Unknown source identity: ${row.source}/${row.sourceId}.`, 404);
      const current = mustListing(db, String(identity.listingId));
      if (seen.has(current.id))
        throw new StoreError(`Two updates target the same listing: ${current.id}.`);
      seen.add(current.id);
      if (
        current.publicationOrigin !== 'editorial' ||
        current.kind !== 'job' ||
        current.isSample ||
        current.paidAt ||
        current.paymentOrderId ||
        current.planId
      )
        throw new StoreError('Only unpaid editorial jobs can be enriched.', 403);
      const content = {
        description: row.description,
        url: row.applicationUrl,
        applicationMethod: row.applicationMethod,
        applicationInstructions: row.applicationInstructions,
        employerSourceUrl: row.employerSourceUrl,
        ...(row.deadlineOverride
          ? { deadline: calendarBoundary(row.deadlineOverride, 'deadline', true) }
          : {}),
        ...(row.salaryOverride
          ? {
              salaryMin: row.salaryOverride.min,
              salaryMax: row.salaryOverride.max,
              salaryPeriod: row.salaryOverride.period,
              salaryDisplay: row.salaryOverride.display,
            }
          : {}),
      };
      const keys = Object.keys(content) as (keyof typeof content)[];
      if (keys.every((key) => (current[key] ?? null) === content[key])) {
        result.skipped++;
        result.listings.push({ id: current.id, slug: current.slug, outcome: 'unchanged' });
        continue;
      }
      if (current.version !== row.expectedVersion)
        throw new StoreError(`Listing changed since review: ${current.id}.`, 409);
      if (dryRun) result.wouldUpdate++;
      else {
        const previous = Object.fromEntries(keys.map((key) => [key, current[key] ?? null]));
        db.prepare(
          'INSERT INTO editorial_revisions(id,listingId,actorId,source,sourceId,inputHash,previousContent,createdAt) VALUES(?,?,?,?,?,?,?,?)',
        ).run(
          randomUUID(),
          current.id,
          actor.id,
          row.source,
          row.sourceId,
          createHash('sha256').update(JSON.stringify(row)).digest('hex'),
          JSON.stringify(previous),
          now,
        );
        writeListing(
          db,
          {
            ...current,
            ...content,
            sourceCheckedAt: row.checkedAt,
            version: current.version + 1,
            updatedAt: now,
          },
          current.version,
        );
        audit(
          db,
          current.id,
          actor.id,
          `editorial content enrichment: ${row.source}/${row.sourceId}`,
        );
        result.updated++;
      }
      result.listings.push({
        id: current.id,
        slug: current.slug,
        outcome: dryRun ? 'would-update' : 'updated',
      });
    }
    return result;
  });
}
const editorialRowSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(200),
    checkedAt: z.iso.datetime({ offset: true }),
    listing: z.unknown(),
  })
  .strict();
export function validateEditorialRows(source: unknown, input: unknown) {
  const checkedSource = validate(z.enum(EDITORIAL_SOURCES), source);
  const rows = validate(z.array(editorialRowSchema).max(1000), input);
  const seen = new Set<string>(),
    now = Date.now();
  return rows.map((row) => {
    if (seen.has(row.sourceId))
      throw new StoreError(`Duplicate sourceId in input: ${row.sourceId}`);
    seen.add(row.sourceId);
    const listing = parseInput(row.listing, true);
    if (listing.kind !== 'job') throw new StoreError('Editorial imports accept jobs only.');
    if (!listing.sourceUrl || !listing.url)
      throw new StoreError(`Source and application URLs are required for ${row.sourceId}.`);
    const sourceUrl = new URL(listing.sourceUrl);
    if (checkedSource === 'employer') {
      // Employer imports: both the notice and the apply link must be on the employer's own
      // site or ATS, never on a competing job board.
      if (
        !['https:', 'http:'].includes(sourceUrl.protocol) ||
        isCompetitorUrl(listing.sourceUrl) ||
        isCompetitorUrl(listing.url)
      )
        throw new StoreError(
          `Employer source for ${row.sourceId} must be the employer's own site.`,
        );
    } else if (
      sourceUrl.protocol !== 'https:' ||
      ![checkedSource, `www.${checkedSource}`].includes(sourceUrl.hostname) ||
      sourceUrl.pathname === '/'
    )
      throw new StoreError(
        `Source URL for ${row.sourceId} must be a job page on ${checkedSource}.`,
      );
    const checkedAt = new Date(row.checkedAt).toISOString();
    if (Date.parse(checkedAt) > now + 5 * 60000 || Date.parse(checkedAt) < now - 72 * 3600000)
      throw new StoreError(
        `Source check for ${row.sourceId} must be recent (within 72 hours) and cannot be in the future.`,
      );
    if (listing.deadline && Date.parse(listing.deadline) <= now)
      throw new StoreError(`Job ${row.sourceId} has already reached its application deadline.`);
    return { sourceId: row.sourceId, checkedAt, listing };
  });
}
function importApplicationKey(value: string | null): string | null {
  if (!value) return null;
  const url = new URL(value);
  url.hash = '';
  for (const name of [...url.searchParams.keys()])
    if (/^utm_/i.test(name) || ['fbclid', 'gclid'].includes(name.toLowerCase()))
      url.searchParams.delete(name);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}
function importJobIdentityKey(
  listing: Pick<Listing, 'title' | 'organization' | 'location' | 'country'>,
) {
  // Exact normalized identities only: punctuation and distinct job locations remain significant.
  return JSON.stringify(
    [listing.title, listing.organization, listing.location, listing.country].map(organizationKey),
  );
}
/** Server/CLI-only editorial authority. No HTTP handler exposes this function.
 * Validation, duplicate identity reservation, listing creation, and publication commit atomically. */
export function importEditorialListings(
  actorId: string,
  source: EditorialSource,
  input: unknown,
  options: { publish?: boolean; dryRun?: boolean; sha256?: string } = {},
) {
  const actor = mustUser(actorId);
  if (actor.role !== 'admin')
    throw new StoreError('Administrator access is required for editorial imports.', 403);
  const rows = validateEditorialRows(source, input);
  const db = getDb(),
    dryRun = options.dryRun !== false,
    publish = options.publish === true;
  return transaction(db, () => {
    const existingRows = db
      .prepare("SELECT * FROM listings WHERE kind='job'")
      .all()
      .map(listingFromRow);
    const byApplication = new Map<string, Listing[]>(),
      byJobIdentity = new Map<string, Listing>();
    for (const listing of existingRows) {
      const application = importApplicationKey(listing.url);
      if (application)
        byApplication.set(application, [...(byApplication.get(application) || []), listing]);
      byJobIdentity.set(importJobIdentityKey(listing), listing);
    }
    const result = {
      mode: dryRun ? 'dry-run' : 'apply',
      runId: dryRun ? null : randomUUID(),
      imported: 0,
      published: 0,
      skipped: 0,
      wouldImport: 0,
      wouldPublish: 0,
      listings: [] as { sourceId: string; listingId: string; slug: string; outcome: string }[],
    };
    for (const row of rows) {
      const known = db
        .prepare('SELECT listingId FROM import_sources WHERE source=? AND sourceId=?')
        .get(source, row.sourceId) as { listingId: string | null } | undefined;
      if (known && !known.listingId)
        throw new StoreError(
          `Uncertain previous import for ${row.sourceId}; inspect it before retrying.`,
          409,
        );
      const application = importApplicationKey(row.listing.url)!;
      const identity = importJobIdentityKey(row.listing);
      // Generic careers URLs can serve many roles. A URL match is only evidence for
      // deduplication when title, organization, location, and country also agree.
      const compatibleApplication = byApplication
        .get(application)
        ?.find((candidate) => importJobIdentityKey(candidate) === identity);
      const existing = known?.listingId
        ? mustListing(db, known.listingId)
        : compatibleApplication || byJobIdentity.get(identity);
      if (existing) {
        const canPublishDraft =
          publish &&
          existing.status === 'draft' &&
          existing.publicationOrigin === 'editorial' &&
          existing.externalSource === source &&
          existing.sourceIdentity === row.sourceId;
        if (canPublishDraft) {
          if (
            importApplicationKey(existing.url) !== application ||
            importJobIdentityKey(existing) !== identity ||
            (existing.sourceUrl ?? null) !==
              (isCompetitorUrl(row.listing.sourceUrl) ? null : row.listing.sourceUrl)
          )
            throw new StoreError(
              `Imported draft ${row.sourceId} differs from the checked source; inspect it before publishing.`,
              409,
            );
          result.wouldPublish++;
          if (!dryRun) {
            const timestamp = nowIso();
            const expiry = Math.min(
              Date.now() + JOB_DURATION_DAYS * 86400000,
              row.listing.deadline ? Date.parse(row.listing.deadline) : Infinity,
            );
            if (expiry <= Date.now())
              throw new StoreError(`Imported draft ${row.sourceId} has expired.`);
            const updated: Listing = {
              ...existing,
              ...row.listing,
              employmentType: row.listing.employmentType ?? null,
              seniority: row.listing.seniority ?? null,
              workMode: row.listing.workMode ?? null,
              salaryPeriod: row.listing.salaryPeriod ?? null,
              eventType: null,
              status: 'published',
              publishedAt: timestamp,
              updatedAt: timestamp,
              version: existing.version + 1,
              sourceCheckedAt: row.checkedAt,
              entitlementExpiresAt: new Date(expiry).toISOString(),
              featured: false,
              placement: 0,
              paidAt: null,
              paymentOrderId: null,
              planId: null,
            };
            writeListing(db, updated, existing.version);
            audit(
              db,
              existing.id,
              actor.id,
              `editorial publication: ${source}/${row.sourceId}; checked ${row.checkedAt}`,
            );
            result.published++;
          }
          result.listings.push({
            sourceId: row.sourceId,
            listingId: existing.id,
            slug: existing.slug,
            outcome: dryRun ? 'would-publish-draft' : 'published-draft',
          });
        } else {
          result.skipped++;
          result.listings.push({
            sourceId: row.sourceId,
            listingId: existing.id,
            slug: existing.slug,
            outcome: 'duplicate-skipped',
          });
        }
        if (!dryRun && !known)
          db.prepare(
            'INSERT INTO import_sources(source,sourceId,listingId,importedAt) VALUES(?,?,?,?)',
          ).run(source, row.sourceId, existing.id, nowIso());
        continue;
      }
      result.wouldImport++;
      if (publish) result.wouldPublish++;
      const listing = dryRun
        ? ({
            ...row.listing,
            id: `dry-run-${row.sourceId}`,
            slug: '',
            publicationOrigin: 'editorial',
            externalSource: source,
            sourceIdentity: row.sourceId,
            status: 'draft',
          } as Listing)
        : buildDraftListing(db, actor.id, row.listing);
      if (!dryRun) {
        const timestamp = nowIso();
        Object.assign(listing, {
          publicationOrigin: 'editorial',
          externalSource: source,
          sourceIdentity: row.sourceId,
          sourceCheckedAt: row.checkedAt,
          status: publish ? 'published' : 'draft',
          publishedAt: publish ? timestamp : null,
          entitlementExpiresAt: new Date(
            Math.min(
              Date.now() + JOB_DURATION_DAYS * 86400000,
              listing.deadline ? Date.parse(listing.deadline) : Infinity,
            ),
          ).toISOString(),
          featured: false,
          placement: 0,
          paidAt: null,
          paymentOrderId: null,
          planId: null,
        });
        insertListing(db, listing);
        db.prepare(
          'INSERT INTO import_sources(source,sourceId,listingId,importedAt) VALUES(?,?,?,?)',
        ).run(source, row.sourceId, listing.id, timestamp);
        audit(
          db,
          listing.id,
          actor.id,
          `editorial ${publish ? 'publication' : 'draft'}: ${source}/${row.sourceId}; checked ${row.checkedAt}`,
        );
        result.imported++;
        if (publish) result.published++;
      }
      byApplication.set(application, [...(byApplication.get(application) || []), listing]);
      byJobIdentity.set(identity, listing);
      result.listings.push({
        sourceId: row.sourceId,
        listingId: listing.id,
        slug: listing.slug,
        outcome: dryRun ? 'would-import' : publish ? 'published' : 'draft',
      });
    }
    if (!dryRun)
      db.prepare(
        'INSERT INTO import_runs(id,source,sha256,state,imported,skipped,createdAt) VALUES(?,?,?,?,?,?,?)',
      ).run(
        result.runId!,
        source,
        options.sha256 || createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        'complete',
        result.imported,
        result.skipped,
        nowIso(),
      );
    return result;
  });
}

const organizerEventSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(200),
    organizationSlug: z.string().trim().min(1).max(200),
    checkedAt: z.iso.datetime({ offset: true }),
    datePrecision: z.enum(['datetime', 'date']),
    listing: z.record(z.string(), z.unknown()),
  })
  .strict();

/** Operator-only import of reviewed organizer events; no HTTP or scheduled caller. */
export function importOrganizerEvents(
  actorId: string,
  input: unknown,
  options: { dryRun?: boolean; publish?: boolean; sha256?: string } = {},
) {
  const actor = mustUser(actorId);
  if (actor.role !== 'admin') throw new StoreError('Administrator access is required.', 403);
  const directory = new Map(
    resourceList('lobbyingEntities').map((entity) => [entity.slug, entity]),
  );
  const reviewed = validate(z.array(organizerEventSchema).min(1).max(500), input);
  const seen = new Set<string>();
  const rows = reviewed.map((row) => {
    const entity = directory.get(row.organizationSlug);
    if (!entity?.website)
      throw new StoreError(`Unknown organizer website: ${row.organizationSlug}`);
    const key = `${row.organizationSlug}/${row.sourceId}`;
    if (seen.has(key)) throw new StoreError(`Duplicate event source identity: ${key}`);
    seen.add(key);
    if (
      Date.parse(row.checkedAt) > Date.now() + 300000 ||
      Date.parse(row.checkedAt) < Date.now() - 72 * 3600000
    )
      throw new StoreError('Organizer source checks must be within 72 hours.');
    if (row.listing.organization !== entity.name || row.listing.kind !== 'event')
      throw new StoreError('An event must use its exact directory organizer name.');
    const raw = { ...row.listing };
    if (row.datePrecision === 'date') {
      const start = validate(z.iso.date(), raw.startsAt),
        end = validate(z.iso.date(), raw.endsAt);
      if (end < start) throw new StoreError('The final event date cannot precede the first.');
      const timezone = validate(z.string().min(1).max(100), raw.timezone);
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
      } catch {
        throw new StoreError('Use a valid event timezone.');
      }
      raw.startsAt = calendarBoundary(start, 'startsAt', false, timezone);
      raw.endsAt = new Date(
        Date.parse(calendarBoundary(end, 'endsAt', true, timezone)) + 1,
      ).toISOString();
    }
    const listing = parseInput(raw);
    if (!listing.sourceUrl || !listing.url)
      throw new StoreError('Organizer source and registration links are required.');
    const source = new URL(listing.sourceUrl),
      official = new URL(entity.website);
    const host = official.hostname.toLowerCase().replace(/^www\./, '');
    const sourceHost = source.hostname.toLowerCase().replace(/^www\./, '');
    if (
      source.protocol !== 'https:' ||
      (sourceHost !== host && !sourceHost.endsWith(`.${host}`)) ||
      source.pathname === '/'
    )
      throw new StoreError(`Use a specific event page on the organizer website: ${entity.name}`);
    if (Date.parse(listing.startsAt!) <= Date.now())
      throw new StoreError('Only upcoming events can be imported.');
    return { ...row, listing, sourceKey: `organizer:${entity.slug}` };
  });
  const db = getDb(),
    dryRun = options.dryRun !== false,
    publish = options.publish === true;
  const identity = (event: Pick<Listing, 'title' | 'organization' | 'startsAt'>) =>
    JSON.stringify([
      organizationKey(event.organization),
      organizationKey(event.title),
      event.startsAt,
    ]);
  return transaction(db, () => {
    const existing = db
      .prepare("SELECT * FROM listings WHERE kind='event'")
      .all()
      .map(listingFromRow);
    const byIdentity = new Map(existing.map((event) => [identity(event), event]));
    const byPage = new Map(
      existing
        .filter((event) => event.sourceUrl)
        .map((event) => [
          JSON.stringify([importApplicationKey(event.sourceUrl), event.startsAt]),
          event,
        ]),
    );
    const result = {
      mode: dryRun ? 'dry-run' : 'apply',
      imported: 0,
      published: 0,
      skipped: 0,
      wouldImport: 0,
      wouldPublish: 0,
      listings: [] as { sourceId: string; listingId: string; slug: string; outcome: string }[],
    };
    for (const row of rows) {
      const known = db
        .prepare('SELECT listingId FROM import_sources WHERE source=? AND sourceId=?')
        .get(row.sourceKey, row.sourceId);
      if (known && !known.listingId)
        throw new StoreError('Uncertain prior event import; inspect before retrying.', 409);
      const pageKey = JSON.stringify([
        importApplicationKey(row.listing.sourceUrl),
        row.listing.startsAt,
      ]);
      const match = known?.listingId
        ? mustListing(db, String(known.listingId))
        : byIdentity.get(identity(row.listing)) || byPage.get(pageKey);
      if (match) {
        if (!known && identity(match) !== identity(row.listing))
          throw new StoreError(
            'The event source page and date match a different listing identity; review it explicitly.',
            409,
          );
        if (
          known &&
          (match.kind !== 'event' ||
            identity(match) !== identity(row.listing) ||
            match.sourceUrl !== row.listing.sourceUrl)
        )
          throw new StoreError(
            'A previously imported event changed identity or schedule; review it explicitly.',
            409,
          );
        const promote =
          publish &&
          match.status === 'draft' &&
          match.externalSource === 'organizer' &&
          match.entitySlug === row.organizationSlug;
        if (promote) {
          if (
            identity(match) !== identity(row.listing) ||
            match.sourceUrl !== row.listing.sourceUrl
          )
            throw new StoreError(
              'The imported event draft identity differs from the reviewed source.',
              409,
            );
          for (const key of [
            'summary',
            'description',
            'url',
            'endsAt',
            'timezone',
            'eventType',
            'venue',
            'location',
            'country',
            'price',
            'topic',
          ] as const)
            if (match[key] !== row.listing[key])
              throw new StoreError(
                'The imported event draft differs from the reviewed source.',
                409,
              );
          if (!!match.eventDateOnly !== (row.datePrecision === 'date'))
            throw new StoreError('Event date precision changed.', 409);
          result.wouldPublish++;
          if (!dryRun) {
            const updated = {
              ...match,
              status: 'published' as const,
              publishedAt: nowIso(),
              updatedAt: nowIso(),
              version: match.version + 1,
            };
            writeListing(db, updated, match.version);
            audit(
              db,
              match.id,
              actor.id,
              `organizer event publication: ${row.sourceKey}/${row.sourceId}`,
            );
            result.published++;
          }
        } else result.skipped++;
        if (!dryRun && !known)
          db.prepare(
            'INSERT INTO import_sources(source,sourceId,listingId,importedAt) VALUES(?,?,?,?)',
          ).run(row.sourceKey, row.sourceId, match.id, nowIso());
        result.listings.push({
          sourceId: row.sourceId,
          listingId: match.id,
          slug: match.slug,
          outcome: promote
            ? dryRun
              ? 'would-publish-draft'
              : 'published-draft'
            : 'duplicate-skipped',
        });
        continue;
      }
      result.wouldImport++;
      if (publish) result.wouldPublish++;
      const event = dryRun
        ? ({ ...row.listing, id: `dry-run-${row.sourceKey}-${row.sourceId}`, slug: '' } as Listing)
        : buildDraftListing(db, actor.id, row.listing);
      Object.assign(event, {
        publicationOrigin: 'editorial',
        externalSource: 'organizer',
        sourceIdentity: row.sourceId,
        entitySlug: row.organizationSlug,
        eventDateOnly: row.datePrecision === 'date',
        sourceCheckedAt: row.checkedAt,
        status: publish ? 'published' : 'draft',
        publishedAt: publish ? nowIso() : null,
        featured: false,
        placement: 0,
        paidAt: null,
        paymentOrderId: null,
        planId: null,
        entitlementExpiresAt: null,
      });
      if (!dryRun) {
        insertListing(db, event);
        db.prepare(
          'INSERT INTO import_sources(source,sourceId,listingId,importedAt) VALUES(?,?,?,?)',
        ).run(row.sourceKey, row.sourceId, event.id, nowIso());
        audit(
          db,
          event.id,
          actor.id,
          `organizer event ${publish ? 'publication' : 'draft'}: ${row.sourceKey}/${row.sourceId}`,
        );
        result.imported++;
        if (publish) result.published++;
      }
      byIdentity.set(identity(event), event);
      byPage.set(pageKey, event);
      result.listings.push({
        sourceId: row.sourceId,
        listingId: event.id,
        slug: event.slug,
        outcome: dryRun ? 'would-import' : publish ? 'published' : 'draft',
      });
    }
    if (!dryRun)
      db.prepare(
        'INSERT INTO import_runs(id,source,sha256,state,imported,skipped,createdAt) VALUES(?,?,?,?,?,?,?)',
      ).run(
        randomUUID(),
        'organizer',
        options.sha256 || createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        'complete',
        result.imported,
        result.skipped,
        nowIso(),
      );
    return result;
  });
}
