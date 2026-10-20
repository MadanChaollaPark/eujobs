import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { getDb, StoreError } from './store';

const initialized = new WeakSet<DatabaseSync>();
export function emailDb() {
  const db = getDb();
  if (!initialized.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY, idempotencyKey TEXT NOT NULL UNIQUE, recipient TEXT NOT NULL,
      subject TEXT NOT NULL, text TEXT NOT NULL, html TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','dead','cancelled','uncertain')),
      attempts INTEGER NOT NULL DEFAULT 0, availableAt INTEGER NOT NULL, createdAt INTEGER NOT NULL,
      expiresAt INTEGER, suppressionKey TEXT, leaseToken TEXT, leaseUntil INTEGER,
      sentAt INTEGER, providerMessageId TEXT, lastError TEXT
    );
    CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox(status,availableAt);
    CREATE TABLE IF NOT EXISTS email_suppressions (scope TEXT PRIMARY KEY, createdAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS email_listing_dependencies (
      emailId TEXT NOT NULL REFERENCES email_outbox(id) ON DELETE CASCADE,
      listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, PRIMARY KEY(emailId,listingId)
    );`);
    initialized.add(db);
  }
  return db;
}

export function emailAvailable() {
  if (process.env.EMAIL_DELIVERY_ENABLED === '0') return false;
  if (process.env.EMAIL_PROVIDER === 'resend') {
    const sender = (process.env.EMAIL_FROM || '').match(
      /^(?:[^<>\r\n]+\s*<)?([^<>\s]+@[^<>\s]+)>?$/,
    )?.[1];
    return !!process.env.RESEND_API_KEY?.trim() && z.email().safeParse(sender).success;
  }
  return (
    (!process.env.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER === 'brevo') &&
    !!process.env.BREVO_API_KEY?.trim() &&
    z.email().safeParse(process.env.BREVO_SENDER_EMAIL).success
  );
}
export function requireEmail() {
  if (!emailAvailable())
    throw new StoreError('Email delivery is temporarily unavailable. Please try again later.', 503);
}
export function appOrigin() {
  try {
    const url = new URL(process.env.APP_ORIGIN || 'http://localhost:3210');
    if (
      url.username ||
      url.password ||
      !['http:', 'https:'].includes(url.protocol) ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new StoreError('The website email address configuration is unavailable.', 503);
  }
}

const emailSchema = z.object({
  to: z.string().trim().max(254).pipe(z.email()),
  subject: z.string().min(1).max(500),
  text: z.string().min(1).max(200_000),
  html: z.string().max(300_000).optional(),
  idempotencyKey: z.string().min(1).max(300),
  expiresAt: z.number().int().positive().optional(),
  suppressionKey: z.string().max(300).optional(),
});
export type EmailMessage = z.infer<typeof emailSchema>;

/** Persists only; delivery is performed by the worker, never in the HTTP request. */
export function enqueueEmail(input: EmailMessage) {
  const m = emailSchema.parse(input),
    db = emailDb();
  const id = randomUUID(),
    now = Date.now();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO email_outbox
    (id,idempotencyKey,recipient,subject,text,html,createdAt,availableAt,expiresAt,suppressionKey)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      m.idempotencyKey,
      m.to.toLowerCase(),
      m.subject,
      m.text,
      m.html ?? null,
      now,
      now,
      m.expiresAt ?? null,
      m.suppressionKey ?? null,
    );
  const saved = db
    .prepare('SELECT id FROM email_outbox WHERE idempotencyKey=?')
    .get(m.idempotencyKey) as { id: string };
  return { id: saved.id, created: Number(result.changes) === 1 };
}

/** Suppression also cancels messages already queued before an unsubscribe or token rotation. */
export function suppressEmails(scope: string) {
  const db = emailDb();
  db.prepare('INSERT OR IGNORE INTO email_suppressions(scope,createdAt) VALUES(?,?)').run(
    scope,
    Date.now(),
  );
  db.prepare(
    "UPDATE email_outbox SET status='cancelled',lastError='Suppressed before delivery' WHERE suppressionKey=? AND status='pending'",
  ).run(scope);
}
export function linkEmailListings(emailId: string, listingIds: string[]) {
  const db = emailDb();
  for (const id of listingIds)
    db.prepare(
      'INSERT OR IGNORE INTO email_listing_dependencies(emailId,listingId) VALUES(?,?)',
    ).run(emailId, id);
}

export class EmailDeliveryError extends Error {
  constructor(
    public retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export async function deliverViaBrevo(message: EmailMessage): Promise<string> {
  requireEmail();
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME || 'EUJobs',
      },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      ...(message.html ? { htmlContent: message.html } : {}),
    }),
  });
  // A server error can arrive after provider acceptance. Quarantine that ambiguity.
  if (response.status >= 500) throw new Error('Email provider acceptance uncertain');
  if (!response.ok)
    throw new EmailDeliveryError(
      response.status === 429,
      `Email provider returned HTTP ${response.status}`,
    );
  const body = (await response.json()) as { messageId?: string };
  if (!body.messageId) throw new Error('Provider acceptance could not be confirmed');
  return body.messageId;
}

export async function deliverViaResend(message: EmailMessage): Promise<string> {
  requireEmail();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY!}`,
      'Idempotency-Key': createHash('sha256').update(message.idempotencyKey).digest('hex'),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });
  // Idempotency has a finite retention window; do not retry an ambiguous acceptance later.
  if (response.status >= 500) throw new Error('Email provider acceptance uncertain');
  if (!response.ok)
    throw new EmailDeliveryError(
      response.status === 429,
      `Email provider returned HTTP ${response.status}`,
    );
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new Error('Provider acceptance could not be confirmed');
  return body.id;
}

export function deliverEmail(message: EmailMessage) {
  return process.env.EMAIL_PROVIDER === 'resend'
    ? deliverViaResend(message)
    : deliverViaBrevo(message);
}

type OutboxRow = {
  id: string;
  idempotencyKey: string;
  recipient: string;
  subject: string;
  text: string;
  html: string | null;
  attempts: number;
  expiresAt: number | null;
  suppressionKey: string | null;
};

/** Atomic leases prevent concurrent workers from sending the same item. A crashed/ambiguous
 * delivery is quarantined as uncertain, rather than automatically sending a possible duplicate. */
export async function processEmailOutbox(
  options: {
    now?: number;
    limit?: number;
    deliver?: (message: EmailMessage) => Promise<string>;
    eligible?: (scope: string) => boolean;
  } = {},
) {
  const db = emailDb(),
    totals = { sent: 0, failed: 0, cancelled: 0, uncertain: 0, disabled: false };
  if (!options.deliver && !emailAvailable()) return { ...totals, disabled: true };
  const clock = () => options.now ?? Date.now(),
    now = clock();
  totals.uncertain = Number(
    db
      .prepare(
        "UPDATE email_outbox SET status='uncertain',lastError='Worker interrupted during delivery; review provider logs before retrying' WHERE status='processing' AND leaseUntil<=?",
      )
      .run(now).changes,
  );
  for (let index = 0; index < Math.min(options.limit ?? 100, 500); index++) {
    const lease = randomUUID();
    const item = db
      .prepare(
        `UPDATE email_outbox SET status='processing',leaseToken=?,leaseUntil=?,attempts=attempts+1
      WHERE id=(SELECT id FROM email_outbox WHERE status='pending' AND availableAt<=? ORDER BY availableAt,id LIMIT 1)
      RETURNING *`,
      )
      .get(lease, clock() + 120_000, clock()) as OutboxRow | undefined;
    if (!item) break;
    const suppressed =
      item.suppressionKey &&
      (db.prepare('SELECT scope FROM email_suppressions WHERE scope=?').get(item.suppressionKey) ||
        (options.eligible && !options.eligible(item.suppressionKey)));
    const staleListing = db
      .prepare(
        `SELECT d.listingId FROM email_listing_dependencies d JOIN listings l ON l.id=d.listingId
      WHERE d.emailId=? AND (l.status<>'published' OR l.isSample=1 OR (l.deadline IS NOT NULL AND l.deadline<=?)
      OR (l.entitlementExpiresAt IS NOT NULL AND l.entitlementExpiresAt<=?)) LIMIT 1`,
      )
      .get(item.id, new Date(clock()).toISOString(), new Date(clock()).toISOString());
    if ((item.expiresAt && item.expiresAt <= clock()) || suppressed || staleListing) {
      db.prepare(
        "UPDATE email_outbox SET status='cancelled',lastError='Expired or suppressed before delivery',leaseToken=NULL,leaseUntil=NULL WHERE id=? AND leaseToken=?",
      ).run(item.id, lease);
      totals.cancelled++;
      continue;
    }
    try {
      const providerId = await (options.deliver || deliverEmail)({
        to: item.recipient,
        subject: item.subject,
        text: item.text,
        ...(item.html ? { html: item.html } : {}),
        idempotencyKey: item.idempotencyKey,
      });
      db.prepare(
        "UPDATE email_outbox SET status='sent',sentAt=?,providerMessageId=?,leaseToken=NULL,leaseUntil=NULL,lastError=NULL WHERE id=? AND leaseToken=?",
      ).run(clock(), providerId, item.id, lease);
      totals.sent++;
    } catch (error) {
      const known = error instanceof EmailDeliveryError;
      const status = known
        ? error.retryable && item.attempts < 8
          ? 'pending'
          : 'dead'
        : 'uncertain';
      const delay = Math.min(24 * 3600_000, 60_000 * 2 ** (item.attempts - 1));
      // Persist no provider response bodies, addresses, credentials, or request URLs in diagnostics.
      db.prepare(
        'UPDATE email_outbox SET status=?,availableAt=?,leaseToken=NULL,leaseUntil=NULL,lastError=? WHERE id=? AND leaseToken=?',
      ).run(
        status,
        clock() + delay,
        known ? error.message : 'Delivery outcome uncertain; review provider logs before retrying',
        item.id,
        lease,
      );
      if (status === 'uncertain') totals.uncertain++;
      else totals.failed++;
    }
  }
  return totals;
}

export function emailQueueSummary() {
  return emailDb()
    .prepare('SELECT status, COUNT(*) AS count FROM email_outbox GROUP BY status')
    .all();
}
