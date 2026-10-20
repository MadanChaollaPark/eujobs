import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashPassword } from './auth';
import { findUserByEmail, findUserById, isGuestOwner, StoreError } from './store';
import { appOrigin, emailDb, enqueueEmail, requireEmail, suppressEmails } from './email';

const initialized = new WeakSet<DatabaseSync>();
function accountDb() {
  const db = emailDb();
  if (!initialized.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS account_tokens (
      tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK(purpose IN ('reset','verify')), expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL, usedAt INTEGER
    );
    CREATE INDEX IF NOT EXISTS account_tokens_user ON account_tokens(userId,purpose);
    CREATE TABLE IF NOT EXISTS verified_emails (
      userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL, verifiedAt INTEGER NOT NULL
    );`);
    initialized.add(db);
  }
  return db;
}
export const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'This link is invalid or has expired.');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function isEmailVerified(userId: string) {
  if (isGuestOwner(userId)) return false;
  return !!accountDb()
    .prepare(
      'SELECT v.userId FROM verified_emails v JOIN users u ON v.userId=u.id AND v.email=u.email WHERE v.userId=?',
    )
    .get(userId);
}

/** Queueing and token creation share a transaction; an email cannot refer to an unsaved token. */
export function requestAccountEmail(email: string, purpose: 'reset' | 'verify', now = Date.now()) {
  requireEmail();
  const origin = appOrigin(),
    db = accountDb(),
    user = findUserByEmail(email.trim().toLowerCase());
  if (!user || isGuestOwner(user.id) || (purpose === 'verify' && isEmailVerified(user.id))) return;
  const token = randomBytes(32).toString('base64url'),
    hash = tokenHash(token);
  const expiresAt = now + (purpose === 'reset' ? 3600_000 : 24 * 3600_000);
  const url = new URL(purpose === 'reset' ? '/auth/recovery' : '/auth/verify', origin);
  url.searchParams.set('token', token);
  db.exec('BEGIN IMMEDIATE');
  try {
    const old = db
      .prepare(
        'SELECT tokenHash FROM account_tokens WHERE userId=? AND purpose=? AND usedAt IS NULL',
      )
      .all(user.id, purpose) as { tokenHash: string }[];
    for (const previous of old) suppressEmails(`account-token:${previous.tokenHash}`);
    db.prepare(
      'UPDATE account_tokens SET usedAt=? WHERE userId=? AND purpose=? AND usedAt IS NULL',
    ).run(now, user.id, purpose);
    db.prepare(
      'INSERT INTO account_tokens(tokenHash,userId,purpose,expiresAt,createdAt) VALUES(?,?,?,?,?)',
    ).run(hash, user.id, purpose, expiresAt, now);
    enqueueEmail({
      to: user.email,
      subject: purpose === 'reset' ? 'Reset your EUJobs password' : 'Verify your EUJobs email',
      text: `${purpose === 'reset' ? 'Choose a new password' : 'Verify your email address'} by opening this link and confirming on EUJobs:\n\n${url}\n\nThis link expires in ${purpose === 'reset' ? 'one hour' : '24 hours'}. If you did not request this, ignore this message.`,
      idempotencyKey: `account-${purpose}:${hash}`,
      expiresAt,
      suppressionKey: `account-token:${hash}`,
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function consumeAccountToken(
  token: string,
  purpose: 'reset' | 'verify',
  operation: (userId: string) => void,
  now: number,
) {
  tokenSchema.parse(token);
  const db = accountDb(),
    hash = tokenHash(token);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db
      .prepare(
        'SELECT userId FROM account_tokens WHERE tokenHash=? AND purpose=? AND usedAt IS NULL AND expiresAt>?',
      )
      .get(hash, purpose, now) as { userId: string } | undefined;
    if (!row || isGuestOwner(row.userId))
      throw new StoreError(
        'This link is invalid, already used, or has expired. Request a new link.',
        400,
      );
    operation(row.userId);
    db.prepare('UPDATE account_tokens SET usedAt=? WHERE tokenHash=?').run(now, hash);
    suppressEmails(`account-token:${hash}`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export async function resetPassword(token: string, password: string, now = Date.now()) {
  tokenSchema.parse(token);
  const hash = await hashPassword(password);
  consumeAccountToken(
    token,
    'reset',
    (userId) => {
      const db = accountDb();
      db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(hash, userId);
      db.prepare('DELETE FROM sessions WHERE userId=?').run(userId);
      // Every outstanding reset link becomes unusable after a successful reset.
      db.prepare(
        "UPDATE account_tokens SET usedAt=? WHERE userId=? AND purpose='reset' AND usedAt IS NULL",
      ).run(now, userId);
    },
    now,
  );
}
export function verifyAccountEmail(token: string, now = Date.now()) {
  consumeAccountToken(
    token,
    'verify',
    (userId) => {
      const user = findUserById(userId);
      if (!user) throw new StoreError('Account not found.', 404);
      accountDb()
        .prepare(
          'INSERT INTO verified_emails(userId,email,verifiedAt) VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET email=excluded.email,verifiedAt=excluded.verifiedAt',
        )
        .run(userId, user.email, now);
    },
    now,
  );
}
