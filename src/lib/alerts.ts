import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { StoreError } from './store';
import { EMPLOYMENT_TYPES, SENIORITIES, TOPICS, WORK_MODES } from './types';
import { CATEGORIES } from './categories';
import {
  appOrigin,
  emailDb,
  enqueueEmail,
  linkEmailListings,
  requireEmail,
  suppressEmails,
} from './email';
import { tokenHash, tokenSchema } from './account-tokens';

const optionalText = (max: number) => z.string().trim().max(max).default('');
export const alertSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    q: optionalText(200),
    location: optionalText(100),
    topic: z.union([z.enum(TOPICS), z.literal('')]).default(''),
    workMode: z.union([z.enum(WORK_MODES), z.literal('')]).default(''),
    employmentType: z.union([z.enum(EMPLOYMENT_TYPES), z.literal('')]).default(''),
    seniority: z.union([z.enum(SENIORITIES), z.literal('')]).default(''),
    categorySlug: z
      .union([z.enum(CATEGORIES.map((category) => category.slug)), z.literal('')])
      .default(''),
    organizationId: optionalText(100),
    salaryOnly: z.boolean().default(false),
    frequency: z.enum(['instant', 'daily', 'weekly']).default('daily'),
    kind: z.enum(['alert', 'newsletter']).default('alert'),
    consent: z.literal(true, { error: 'Confirm that you want to receive these emails.' }),
  })
  .strict();
type AlertInput = z.infer<typeof alertSchema>;
export type AlertSummary = {
  id: string;
  frequency: string;
  filters: Omit<AlertInput, 'email' | 'frequency' | 'consent' | 'kind'>;
  kind: string;
  status: string;
  createdAt: number;
  confirmedAt: number | null;
};
type AlertRow = {
  id: string;
  email: string;
  frequency: string;
  filters: string;
  kind: string;
  status: string;
  confirmationHash: string;
  confirmationExpiresAt: number;
  createdAt: number;
  confirmedAt: number | null;
  nextRunAt: number;
  revision: number;
};
const initialized = new WeakSet<DatabaseSync>();
function alertsDb() {
  const db = emailDb();
  if (!initialized.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS job_alerts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, preferenceKey TEXT NOT NULL UNIQUE,
      filters TEXT NOT NULL, frequency TEXT NOT NULL CHECK(frequency IN ('instant','daily','weekly')),
      kind TEXT NOT NULL CHECK(kind IN ('alert','newsletter')),
      status TEXT NOT NULL CHECK(status IN ('pending','active','unsubscribed')),
      confirmationHash TEXT NOT NULL, confirmationExpiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL, confirmedAt INTEGER, nextRunAt INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS job_alerts_due ON job_alerts(status,nextRunAt);
    CREATE TABLE IF NOT EXISTS alert_unsubscribe_tokens (
      tokenHash TEXT PRIMARY KEY, alertId TEXT NOT NULL REFERENCES job_alerts(id) ON DELETE CASCADE, revision INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alert_deliveries (
      alertId TEXT NOT NULL REFERENCES job_alerts(id) ON DELETE CASCADE,
      listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      queuedAt INTEGER NOT NULL, PRIMARY KEY(alertId,listingId)
    );`);
    initialized.add(db);
  }
  return db;
}
export function alertInterval(frequency: string) {
  return frequency === 'instant' ? 15 * 60_000 : frequency === 'weekly' ? 7 * 86400_000 : 86400_000;
}
const scope = (id: string, revision: number) => `alert:${id}:${revision}`;

export function subscribeAlert(input: unknown, now = Date.now()) {
  const parsed = alertSchema.parse(input);
  requireEmail();
  const origin = appOrigin(),
    db = alertsDb();
  const { email, frequency, consent: _consent, kind, ...filters } = parsed;
  if (kind === 'newsletter' && (frequency !== 'weekly' || Object.values(filters).some(Boolean))) {
    throw new StoreError(
      'The newsletter is a weekly roundup. Use a job alert to choose specific filters.',
      400,
    );
  }
  const normalizedFilters = {
    ...filters,
    q: filters.q.toLowerCase(),
    location: filters.location.toLowerCase(),
  };
  const preferenceKey = createHash('sha256')
    .update(JSON.stringify({ email, frequency, kind, ...normalizedFilters }))
    .digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const old = db.prepare('SELECT * FROM job_alerts WHERE preferenceKey=?').get(preferenceKey) as
      AlertRow | undefined;
    if (old?.status === 'active') {
      db.exec('COMMIT');
      return;
    }
    // Repeated submissions cannot invalidate a still-valid confirmation or send duplicate confirmations.
    if (
      old?.status === 'pending' &&
      old.confirmationExpiresAt > now &&
      db
        .prepare(
          "SELECT id FROM email_outbox WHERE idempotencyKey=? AND status IN ('pending','processing','sent')",
        )
        .get(`alert-confirm:${old.confirmationHash}`)
    ) {
      db.exec('COMMIT');
      return;
    }
    const id = old?.id || randomUUID(),
      revision = (old?.revision || 0) + 1;
    if (old) suppressEmails(scope(id, old.revision));
    const token = randomBytes(32).toString('base64url'),
      hash = tokenHash(token),
      expiresAt = now + 86400_000;
    db.prepare(
      `INSERT INTO job_alerts(id,email,preferenceKey,filters,frequency,kind,status,confirmationHash,confirmationExpiresAt,createdAt,nextRunAt,revision)
      VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?) ON CONFLICT(preferenceKey) DO UPDATE SET status='pending',
      confirmationHash=excluded.confirmationHash,confirmationExpiresAt=excluded.confirmationExpiresAt,confirmedAt=NULL,revision=excluded.revision`,
    ).run(
      id,
      email,
      preferenceKey,
      JSON.stringify(filters),
      frequency,
      kind,
      hash,
      expiresAt,
      now,
      now,
      revision,
    );
    const url = new URL('/alerts/confirm', origin);
    url.searchParams.set('token', token);
    const unsubscribe = randomBytes(32).toString('base64url');
    db.prepare(
      'INSERT INTO alert_unsubscribe_tokens(tokenHash,alertId,revision) VALUES(?,?,?)',
    ).run(tokenHash(unsubscribe), id, revision);
    const stop = new URL('/alerts/unsubscribe', origin);
    stop.searchParams.set('token', unsubscribe);
    enqueueEmail({
      to: email,
      subject:
        kind === 'newsletter'
          ? 'Confirm your EUJobs weekly newsletter'
          : 'Confirm your EUJobs job alert',
      text: `Confirm that you want to receive ${frequency === 'instant' ? 'new job matches (checked every 15 minutes)' : frequency + ' job updates'} from EUJobs. Open this link and choose Confirm:\n\n${url}\n\nThis link expires in 24 hours. If you did not request this, ignore it. No job updates will be sent until you confirm.\n\nCancel this request: ${stop}`,
      idempotencyKey: `alert-confirm:${hash}`,
      expiresAt,
      suppressionKey: scope(id, revision),
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function confirmAlert(token: string, now = Date.now()) {
  tokenSchema.parse(token);
  const db = alertsDb();
  const result = db
    .prepare(
      `UPDATE job_alerts SET status='active',confirmedAt=?,nextRunAt=?
    WHERE confirmationHash=? AND confirmationExpiresAt>? AND status='pending'`,
    )
    .run(now, now, tokenHash(token), now);
  if (!result.changes)
    throw new StoreError(
      'This confirmation link is invalid, already used, or expired. Request another alert.',
      400,
    );
}
export function unsubscribeAlert(token: string) {
  tokenSchema.parse(token);
  const db = alertsDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db
      .prepare(
        `SELECT a.id,a.revision FROM job_alerts a JOIN alert_unsubscribe_tokens t ON t.alertId=a.id
      WHERE t.tokenHash=? AND t.revision=a.revision`,
      )
      .get(tokenHash(token)) as { id: string; revision: number } | undefined;
    if (!row)
      throw new StoreError(
        'This unsubscribe link is invalid. Use the link in your most recent email.',
        400,
      );
    db.prepare("UPDATE job_alerts SET status='unsubscribed' WHERE id=?").run(row.id);
    suppressEmails(scope(row.id, row.revision));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function listAccountAlerts(email: string): AlertSummary[] {
  return (
    alertsDb()
      .prepare(
        'SELECT id,frequency,filters,kind,status,createdAt,confirmedAt FROM job_alerts WHERE email=? ORDER BY createdAt DESC',
      )
      .all(email) as unknown as (Omit<AlertSummary, 'filters'> & { filters: string })[]
  ).map((row) => ({ ...row, filters: JSON.parse(row.filters) }));
}
export function unsubscribeAccountAlert(id: string, email: string) {
  const db = alertsDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db
      .prepare('SELECT revision FROM job_alerts WHERE id=? AND email=?')
      .get(id, email) as { revision: number } | undefined;
    if (!row) throw new StoreError('Alert not found.', 404);
    db.prepare("UPDATE job_alerts SET status='unsubscribed' WHERE id=?").run(id);
    suppressEmails(scope(id, row.revision));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function alertEmailEligible(messageScope: string) {
  if (!messageScope.startsWith('alert:')) return true;
  const [, id, revision] = messageScope.split(':');
  return !!alertsDb()
    .prepare(
      "SELECT id FROM job_alerts WHERE id=? AND revision=? AND status IN ('pending','active')",
    )
    .get(id, Number(revision));
}

/** Snapshot selection, durable messages, per-listing deduplication, and scheduling are one transaction. */
export function queueJobAlerts(options: { now?: number; limit?: number; dryRun?: boolean } = {}) {
  const now = options.now ?? Date.now(),
    db = alertsDb(),
    origin = appOrigin();
  const totals = { alerts: 0, matches: 0, queued: 0, dryRun: options.dryRun !== false };
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!totals.dryRun) {
      // A withdrawn/expired job cancels its unsent batch. Release the other jobs for a fresh
      // batch on the next run, then remove old associations so accepted replacements stay deduplicated.
      const cancelled = db
        .prepare(
          `SELECT DISTINCT m.id,m.suppressionKey FROM email_outbox m
        JOIN email_listing_dependencies d ON d.emailId=m.id WHERE m.status='cancelled'`,
        )
        .all() as { id: string; suppressionKey: string | null }[];
      for (const message of cancelled) {
        const parts = message.suppressionKey?.split(':');
        if (parts?.[0] === 'alert') {
          const [, alertId, revision] = parts;
          db.prepare(
            `DELETE FROM alert_deliveries WHERE alertId=? AND listingId IN
            (SELECT listingId FROM email_listing_dependencies WHERE emailId=?)`,
          ).run(alertId, message.id);
          db.prepare(
            "UPDATE job_alerts SET nextRunAt=MIN(nextRunAt,?) WHERE id=? AND revision=? AND status='active'",
          ).run(now, alertId, Number(revision));
        }
        db.prepare('DELETE FROM email_listing_dependencies WHERE emailId=?').run(message.id);
      }
    }
    const due = db
      .prepare(
        "SELECT * FROM job_alerts WHERE status='active' AND nextRunAt<=? ORDER BY nextRunAt,id LIMIT ?",
      )
      .all(now, Math.min(options.limit ?? 100, 500)) as AlertRow[];
    for (const alert of due) {
      const filters = JSON.parse(alert.filters) as AlertSummary['filters'];
      const conditions = [
        "l.kind='job'",
        "l.status='published'",
        'l.isSample=0',
        'l.publishedAt>=?',
        'l.publishedAt<=?',
        '(l.deadline IS NULL OR l.deadline>?)',
        '(l.entitlementExpiresAt IS NULL OR l.entitlementExpiresAt>?)',
        'NOT EXISTS(SELECT 1 FROM alert_deliveries d WHERE d.alertId=? AND d.listingId=l.id)',
      ];
      const values: SQLInputValue[] = [
        new Date(alert.confirmedAt!).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        alert.id,
      ];
      for (const field of [
        'topic',
        'workMode',
        'employmentType',
        'seniority',
        'organizationId',
        'categorySlug',
      ] as const) {
        if (filters[field]) {
          conditions.push(`l.${field}=?`);
          values.push(filters[field]);
        }
      }
      if (filters.salaryOnly) conditions.push('l.salaryMin IS NOT NULL');
      if (filters.location) {
        conditions.push(
          '(instr(lower(l.location),lower(?))>0 OR instr(lower(l.country),lower(?))>0)',
        );
        values.push(filters.location, filters.location);
      }
      for (const word of filters.q.split(/\s+/).filter(Boolean)) {
        conditions.push(
          "instr(lower(l.title || ' ' || l.organization || ' ' || l.summary || ' ' || l.description),lower(?))>0",
        );
        values.push(word);
      }
      const jobs = db
        .prepare(
          `SELECT l.id,l.slug,l.title,l.organization,l.location,l.deadline,l.entitlementExpiresAt FROM listings l WHERE ${conditions.join(' AND ')} ORDER BY l.placement DESC,l.publishedAt,l.id LIMIT 1000`,
        )
        .all(...values) as {
        id: string;
        slug: string;
        title: string;
        organization: string;
        location: string;
        deadline: string | null;
        entitlementExpiresAt: string | null;
      }[];
      totals.alerts++;
      totals.matches += jobs.length;
      if (totals.dryRun) continue;
      for (let offset = 0; offset < jobs.length; offset += 25) {
        const chunk = jobs.slice(offset, offset + 25),
          unsubscribe = randomBytes(32).toString('base64url');
        db.prepare(
          'INSERT INTO alert_unsubscribe_tokens(tokenHash,alertId,revision) VALUES(?,?,?)',
        ).run(tokenHash(unsubscribe), alert.id, alert.revision);
        const stop = new URL('/alerts/unsubscribe', origin);
        stop.searchParams.set('token', unsubscribe);
        // Long-lived pending messages cannot advertise jobs after their earliest application deadline.
        const expiresAt = Math.min(
          now + 7 * 86400_000,
          ...chunk
            .flatMap((j) => [j.deadline, j.entitlementExpiresAt])
            .filter((value): value is string => !!value)
            .map((value) => new Date(value).getTime()),
        );
        const digest = createHash('sha256')
          .update(chunk.map((j) => j.id).join(','))
          .digest('hex');
        const queued = enqueueEmail({
          to: alert.email,
          subject:
            alert.kind === 'newsletter'
              ? 'Your EUJobs weekly roundup'
              : `${chunk.length} new EUJobs ${chunk.length === 1 ? 'match' : 'matches'}`,
          text: `Your new EUJobs matches\n\n${chunk.map((j) => `${j.title}\n${j.organization} · ${j.location}\n${origin}/jobs/${encodeURIComponent(j.slug)}`).join('\n\n')}\n\nManage alerts: ${origin}/account\nUnsubscribe from this ${alert.kind}: ${stop}`,
          idempotencyKey: `alert-jobs:${alert.id}:${alert.revision}:${digest}:${now}`,
          suppressionKey: scope(alert.id, alert.revision),
          expiresAt,
        });
        if (queued.created) totals.queued++;
        linkEmailListings(
          queued.id,
          chunk.map((job) => job.id),
        );
        for (const job of chunk)
          db.prepare(
            'INSERT OR IGNORE INTO alert_deliveries(alertId,listingId,queuedAt) VALUES(?,?,?)',
          ).run(alert.id, job.id, now);
      }
      db.prepare('UPDATE job_alerts SET nextRunAt=? WHERE id=?').run(
        jobs.length === 1000 ? now : now + alertInterval(alert.frequency),
        alert.id,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return totals;
}
