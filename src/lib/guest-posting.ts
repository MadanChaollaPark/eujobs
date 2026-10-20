import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  createGuestOwnedListing,
  getDb,
  getListingById,
  isGuestOwner,
  StoreError,
  type GuestPostingRecord,
} from './store';
import { appOrigin, emailDb, enqueueEmail } from './email';
import type { PaymentOrder } from './billing';

// Canonical base64url encoding of 32 random bytes. The browser retains this secret
// before its first request so a lost response can safely replay the same creation.
export const guestTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine(
    (token) => Buffer.from(token, 'base64url').toString('base64url') === token,
    'Invalid management link.',
  );
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const guestCookieName = (listingId: string) => `eujobs_guest_${listingId}`;
export function guestCookieOptions(listingId: string, expiresAt: string) {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production' ||
      process.env.APP_ORIGIN?.startsWith('https:') === true,
    sameSite: 'lax' as const,
    path: `/api/guest-jobs/${listingId}`,
    expires: new Date(expiresAt),
    maxAge: Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)),
  };
}
export function createGuestPosting(input: unknown) {
  const body = z
    .object({
      requestId: z.uuid(),
      requestToken: guestTokenSchema,
      contactEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
      listing: z.unknown(),
    })
    .strict()
    .parse(input);
  const { listing, guest, replayed } = createGuestOwnedListing(body.listing, {
    requestId: body.requestId,
    tokenHash: hashToken(body.requestToken),
    contactEmail: body.contactEmail,
  });
  return {
    listing,
    manageUrl: `/manage-job/${listing.id}#token=${body.requestToken}`,
    expiresAt: guest.expiresAt,
    replayed,
  };
}

/** Internal lookup for billing only; never expose this record (it includes token hashes). */
export function getGuestPosting(listingId: string): GuestPostingRecord | null {
  return (
    (getDb()
      .prepare('SELECT * FROM guest_postings WHERE listingId=?')
      .get(listingId) as unknown as GuestPostingRecord) || null
  );
}
export function authorizeGuest(listingId: string, token: unknown) {
  const valid = guestTokenSchema.safeParse(token);
  if (!valid.success) throw new StoreError('Open the private management link for this job.', 401);
  const guest = getGuestPosting(listingId);
  const current = new Date().toISOString();
  if (
    !guest ||
    guest.expiresAt <= current ||
    !isGuestOwner(guest.ownerId) ||
    !getDb()
      .prepare(
        'SELECT 1 FROM guest_management_tokens WHERE listingId=? AND tokenHash=? AND expiresAt>?',
      )
      .get(listingId, hashToken(valid.data), current)
  )
    throw new StoreError('This management link is invalid or has expired.', 401);
  const listing = getListingById(listingId);
  if (
    !listing ||
    listing.ownerId !== guest.ownerId ||
    listing.kind !== 'job' ||
    listing.publicationOrigin === 'editorial'
  )
    throw new StoreError('This management link is invalid or has expired.', 401);
  return { guest, listing, token: valid.data };
}
export function requireGuest(request: Request, listingId: string) {
  const name = `${guestCookieName(listingId)}=`;
  const cookie = (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name));
  return authorizeGuest(listingId, cookie?.slice(name.length));
}

/** Initialize outbox before the payment transaction, avoiding lazy DDL during a rollback. */
export function prepareGuestPaymentNotifications(listingId: string) {
  if (getGuestPosting(listingId)) emailDb();
}
/** Called inside the confirmed-payment transaction. This queues privately; it never sends mail. */
export function notifyGuestPayment(order: PaymentOrder) {
  const guest = getGuestPosting(order.listingId);
  if (!guest || guest.ownerId !== order.ownerId) return;
  const db = getDb(),
    idempotencyKey = `guest-payment:${order.id}`;
  if (db.prepare('SELECT id FROM email_outbox WHERE idempotencyKey=?').get(idempotencyKey)) return;
  // Only a newly verified payment extends management access, including when its
  // webhook arrives after the original draft link expired.
  const expiresAt = new Date(
    Math.max(Date.parse(guest.expiresAt), Date.now() + 120 * 24 * 3600000),
  ).toISOString();
  db.prepare(
    'UPDATE guest_management_tokens SET expiresAt=? WHERE listingId=? AND expiresAt=?',
  ).run(expiresAt, order.listingId, guest.expiresAt);
  db.prepare('UPDATE guest_postings SET expiresAt=? WHERE listingId=?').run(
    expiresAt,
    order.listingId,
  );
  const token = randomBytes(32).toString('base64url');
  const manageUrl = `${appOrigin()}/manage-job/${order.listingId}#token=${token}`;
  db.prepare(
    'INSERT INTO guest_management_tokens(tokenHash,listingId,createdAt,expiresAt) VALUES(?,?,?,?)',
  ).run(hashToken(token), order.listingId, new Date().toISOString(), expiresAt);
  enqueueEmail({
    to: guest.contactEmail,
    subject: 'Your EUJobs payment is confirmed — keep your private management link',
    text: `Your payment has been confirmed. Your job still needs editorial approval before publication.\n\nManage your job, check its review status and view available payment documents:\n${manageUrl}\n\nKeep this link private: anyone with it can manage this one job. It expires on ${expiresAt.slice(0, 10)}. Your original saved link also remains valid.\n\nEUJobs`,
    idempotencyKey,
    expiresAt: Date.parse(expiresAt),
  });
}
