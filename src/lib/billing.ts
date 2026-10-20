import { trackServerEvent } from './analytics';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb, getListingById, findUserById, StoreError } from './store';
import { JOB_PLANS, hasJobEntitlement, isJobPlan, type JobPlan } from './plans';
import {
  getGuestPosting,
  prepareGuestPaymentNotifications,
  notifyGuestPayment,
} from './guest-posting';
import { firstFreeActive, launchOfferActive } from '@/lib/offers';

export interface PaymentOrder {
  id: string;
  listingId: string;
  ownerId: string;
  plan: JobPlan;
  amount: number;
  currency: string;
  listingVersion: number;
  status: 'open' | 'paid' | 'expired' | 'refunded';
  sessionId: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
  paymentIntentId: string | null;
  invoiceUrl: string | null;
  receiptUrl: string | null;
}
export interface BillingProvider {
  create(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.Checkout.Session>;
  retrieve(sessionId: string): Promise<Stripe.Checkout.Session>;
  findPromotionCode?(code: string): Promise<string | null>;
}
const nowIso = () => new Date().toISOString();
function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = work();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
/** List price must match; a Stripe promotion code may only reduce the charged total. */
function sessionAmountMatches(session: Stripe.Checkout.Session, amount: number) {
  const subtotal = session.amount_subtotal ?? session.amount_total;
  const discount = session.total_details?.amount_discount ?? 0;
  const tax = session.total_details?.amount_tax ?? 0;
  return (
    subtotal === amount &&
    discount >= 0 &&
    discount <= amount &&
    session.amount_total === subtotal - discount + tax
  );
}
/**
 * A completed Checkout session that settled the order: either paid, or (FIRSTFREE) a 100% promotion
 * discount on the Basic plan, which Stripe reports as amount_total 0 with payment_status
 * 'no_payment_required'. Amounts are still verified by sessionAmountMatches.
 */
export function sessionSettled(session: Stripe.Checkout.Session, plan?: string) {
  if (session.status !== 'complete') return false;
  if (session.payment_status === 'paid') return true;
  return (
    session.payment_status === 'no_payment_required' &&
    session.amount_total === 0 &&
    (session.total_details?.amount_discount ?? 0) > 0 &&
    (plan ?? session.metadata?.plan) === 'basic'
  );
}
function orderRow(row: unknown): PaymentOrder | null {
  return row ? (row as PaymentOrder) : null;
}
function getOrder(id: string) {
  return orderRow(getDb().prepare('SELECT * FROM payment_orders WHERE id=?').get(id));
}
export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret)
    throw new StoreError(
      'Payments are temporarily unavailable. Your draft is saved; please try later.',
      503,
    );
  return new Stripe(secret, { maxNetworkRetries: 2 });
}
/** Resolved promotion-code ids, reused for 10 minutes so checkout does not list on every payment. */
const promotionCodeCache = new Map<string, { id: string | null; expiresAt: number }>();
const PROMOTION_CODE_CACHE_MS = 10 * 60 * 1000;
/** Launch codes auto-applied per plan while the offer runs (Stripe still enforces each code's own rules). */
export function autoPromotionCode(plan: string, now = Date.now()): string | null {
  if (plan === 'basic' && firstFreeActive(now)) return 'FIRSTFREE';
  if (plan === 'pro' && launchOfferActive(now)) return 'LAUNCH149';
  return null;
}
function provider(): BillingProvider {
  const stripe = getStripe();
  return {
    create: (params, idempotencyKey) => stripe.checkout.sessions.create(params, { idempotencyKey }),
    retrieve: (id) =>
      stripe.checkout.sessions.retrieve(id, {
        expand: ['invoice', 'payment_intent.latest_charge'],
      }),
    findPromotionCode: async (code) => {
      // A configured id (STRIPE_FIRSTFREE_PROMO_ID / STRIPE_LAUNCH149_PROMO_ID) skips the lookup.
      const configured = process.env[`STRIPE_${code}_PROMO_ID`];
      if (configured) return configured;
      const now = Date.now();
      const cached = promotionCodeCache.get(code);
      if (cached && cached.expiresAt > now) return cached.id;
      try {
        const listed = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
        const id = listed.data[0]?.id ?? null;
        promotionCodeCache.set(code, { id, expiresAt: now + PROMOTION_CODE_CACHE_MS });
        return id;
      } catch {
        return null;
      }
    },
  };
}
function baseUrl() {
  const origin =
    process.env.APP_ORIGIN ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;
  if (!origin) throw new StoreError('Payment return address is not configured.', 503);
  const parsed = new URL(origin);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new StoreError('Invalid payment return address.', 503);
  return parsed.origin;
}
function readyListing(listingId: string, ownerId: string) {
  const listing = getListingById(listingId);
  if (!listing) throw new StoreError('Job not found.', 404);
  if (listing.ownerId !== ownerId)
    throw new StoreError('Only the owner can pay for this job.', 403);
  if (listing.publicationOrigin === 'editorial')
    throw new StoreError('Sourced listings cannot enter employer checkout.', 403);
  if (listing.kind !== 'job') throw new StoreError('Events are free to submit.');
  if (!listing.url) throw new StoreError('Add an application URL before checkout.');
  if (listing.deadline && listing.deadline <= nowIso())
    throw new StoreError('Update the application deadline before checkout.');
  if (!['draft', 'rejected'].includes(listing.status))
    throw new StoreError('Edit and save this job as a draft before paying for a new posting.', 409);
  if (hasJobEntitlement(listing))
    throw new StoreError(
      'This job is already paid. Submit it for review from your job management page.',
      409,
    );
  return listing;
}
/** A durable reservation plus a Stripe idempotency key makes double-clicks and worker races one checkout. */
export async function createCheckout(
  ownerId: string,
  listingId: string,
  plan: unknown,
  gateway?: BillingProvider,
): Promise<{ sessionId: string; url: string }> {
  if (!isJobPlan(plan)) throw new StoreError('Choose a valid posting plan.');
  const user = findUserById(ownerId);
  if (!user) throw new StoreError('Sign in to continue.', 401);
  const origin = baseUrl();
  const guest = getGuestPosting(listingId);
  if (guest && (guest.ownerId !== ownerId || guest.expiresAt <= nowIso()))
    throw new StoreError('This job management link has expired.', 401);
  const stripe = gateway || provider();
  const db = getDb();
  let order = transaction(db, () => {
    const listing = readyListing(listingId, ownerId);
    const previous = orderRow(
      db.prepare("SELECT * FROM payment_orders WHERE listingId=? AND status='open'").get(listingId),
    );
    if (previous) return previous;
    const id = randomUUID();
    db.prepare(
      'INSERT INTO payment_orders(id,listingId,ownerId,plan,amount,currency,listingVersion,createdAt) VALUES(?,?,?,?,?,?,?,?)',
    ).run(id, listingId, ownerId, plan, JOB_PLANS[plan].amount, 'eur', listing.version, nowIso());
    return getOrder(id)!;
  });
  if (order.sessionId) {
    const session = await stripe.retrieve(order.sessionId);
    if (sessionSettled(session, order.plan)) {
      applyPaidSession(session);
      throw new StoreError(
        'Payment is confirmed. Open your job management page to check the review status.',
        409,
      );
    }
    if (session.status === 'expired') {
      db.prepare("UPDATE payment_orders SET status='expired' WHERE id=? AND status='open'").run(
        order.id,
      );
      return createCheckout(ownerId, listingId, plan, stripe);
    }
    if (order.plan !== plan)
      throw new StoreError(
        'A checkout is already open for another plan. Finish it or wait for it to expire (within 24 hours) before changing plans.',
        409,
      );
    if (session.url && session.status === 'open')
      return { sessionId: session.id, url: session.url };
    throw new StoreError(
      'Payment is being processed. Check this job’s payment status shortly.',
      409,
    );
  }
  if (order.plan !== plan)
    throw new StoreError(
      'A checkout is already being created for another plan. Try that plan again.',
      409,
    );
  // Stripe drops idempotency keys after 24h. An uncertain older create needs reconciliation, never another charge.
  if (Date.now() - Date.parse(order.createdAt) > 23 * 3600000)
    throw new StoreError(
      'This checkout needs support to verify its status. Please contact EUJobs before paying again.',
      409,
    );
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: guest?.contactEmail || user.email,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    invoice_creation: { enabled: true },
    allow_promotion_codes: true,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: order.amount,
          ...(order.plan === 'pro' && process.env.STRIPE_PRO_PRODUCT_ID
            ? { product: process.env.STRIPE_PRO_PRODUCT_ID }
            : order.plan === 'basic' && process.env.STRIPE_BASIC_PRODUCT_ID
              ? { product: process.env.STRIPE_BASIC_PRODUCT_ID }
              : {
                  product_data: {
                    name: `EUJobs — ${JOB_PLANS[order.plan].name} job posting`,
                    description: 'One job for 30 days after editorial approval. One-time payment.',
                  },
                }),
        },
        quantity: 1,
      },
    ],
    expires_at: Math.floor(Date.parse(order.createdAt) / 1000) + 24 * 60 * 60,
    success_url: guest
      ? `${origin}/manage-job/${listingId}?session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/job-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: guest
      ? `${origin}/manage-job/${listingId}?checkout=cancelled`
      : `${origin}/job-cancel`,
    client_reference_id: order.id,
    metadata: {
      eujobsOrderId: order.id,
      jobId: order.listingId,
      ownerId: order.ownerId,
      plan: order.plan,
      listingVersion: String(order.listingVersion),
    },
    payment_intent_data: {
      metadata: { eujobsOrderId: order.id, jobId: order.listingId, ownerId: order.ownerId },
    },
  };
  let session: Stripe.Checkout.Session;
  const promoCode = autoPromotionCode(order.plan);
  const promoId = promoCode ? await stripe.findPromotionCode?.(promoCode) : null;
  if (promoCode && promoId) {
    // Stripe rejects allow_promotion_codes together with discounts. A restricted code
    // (first-time customer, once per customer) can still be invalid for this payer.
    const discounted: Stripe.Checkout.SessionCreateParams = {
      ...params,
      ...(promoCode === 'FIRSTFREE' ? { billing_address_collection: 'auto' as const } : {}),
      discounts: [{ promotion_code: promoId }],
    };
    delete discounted.allow_promotion_codes;
    try {
      session = await stripe.create(
        discounted,
        `eujobs-order-${order.id}-${promoCode.toLowerCase()}`,
      );
      console.info(`checkout: ${promoCode} auto-applied`, order.id, session.amount_total);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { type?: unknown }).type === 'StripeInvalidRequestError'
      ) {
        console.warn(
          `checkout: ${promoCode} not applicable`,
          error instanceof Error ? error.message : String(error),
        );
        session = await stripe.create(params, `eujobs-order-${order.id}`);
      } else {
        throw error;
      }
    }
  } else {
    if (promoCode) console.warn(`checkout: ${promoCode} promotion code not found or inactive`);
    session = await stripe.create(params, `eujobs-order-${order.id}`);
  }
  if (!session.url) throw new StoreError('Checkout could not be opened. Your draft is saved.', 503);
  transaction(db, () => {
    order = getOrder(order.id)!;
    if (order.sessionId && order.sessionId !== session.id)
      throw new StoreError('Checkout reference conflict. Contact EUJobs.', 409);
    db.prepare('UPDATE payment_orders SET sessionId=?,checkoutUrl=?,expiresAt=? WHERE id=?').run(
      session.id,
      session.url!,
      new Date(session.expires_at * 1000).toISOString(),
      order.id,
    );
  });
  return { sessionId: session.id, url: session.url };
}
function refId(value: string | { id: string } | null) {
  return typeof value === 'string' ? value : value?.id || null;
}
function safeStripeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      (u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com'))
      ? value
      : null;
  } catch {
    return null;
  }
}
/** Terminal refund state can arrive before checkout completion is delivered. */
function validateRefundCharge(order: PaymentOrder, charge: Stripe.Charge, requireMetadata = false) {
  const intentId = refId(charge.payment_intent);
  const metadata = charge.metadata;
  if (
    !intentId ||
    (order.paymentIntentId && order.paymentIntentId !== intentId) ||
    charge.currency !== order.currency ||
    // A discounted charge is accepted only once it is bound to this order's own payment.
    (charge.amount !== order.amount &&
      !(order.paymentIntentId === intentId && charge.amount > 0 && charge.amount < order.amount)) ||
    (metadata?.eujobsOrderId && metadata.eujobsOrderId !== order.id) ||
    (metadata?.ownerId && metadata.ownerId !== order.ownerId) ||
    (metadata?.jobId && metadata.jobId !== order.listingId) ||
    (requireMetadata &&
      (metadata?.eujobsOrderId !== order.id ||
        metadata?.ownerId !== order.ownerId ||
        metadata?.jobId !== order.listingId))
  ) {
    throw new StoreError('Refund details do not match this job order.', 409);
  }
  return intentId;
}
function markRefunded(db: DatabaseSync, order: PaymentOrder, intentId: string, timestamp: string) {
  db.prepare("UPDATE payment_orders SET status='refunded',paymentIntentId=? WHERE id=?").run(
    intentId,
    order.id,
  );
  // An older order must never revoke a later paid renewal, and duplicate events cannot bump versions.
  if (order.status !== 'refunded') {
    db.prepare(
      "UPDATE listings SET status='closed',paidAt=NULL,featured=0,placement=0,version=version+1,updatedAt=? WHERE paymentOrderId=?",
    ).run(timestamp, order.id);
  }
}
function recordStripeEvent(
  db: DatabaseSync,
  event: { id: string; type: string } | undefined,
  timestamp: string,
) {
  if (event)
    db.prepare('INSERT OR IGNORE INTO stripe_events(id,type,receivedAt) VALUES(?,?,?)').run(
      event.id,
      event.type,
      timestamp,
    );
}
/** Called only with a signed Stripe event or server-retrieved Stripe session, never browser claims. */
export function applyPaidSession(
  session: Stripe.Checkout.Session,
  event?: { id: string; type: string },
): boolean {
  const orderId = session.metadata?.eujobsOrderId;
  if (!orderId) return false; // Old unrelated purchases are not imported into the new database.
  const db = getDb();
  const preliminary = getOrder(orderId);
  if (preliminary) prepareGuestPaymentNotifications(preliminary.listingId);
  return transaction(db, () => {
    if (event && db.prepare('SELECT id FROM stripe_events WHERE id=?').get(event.id)) return true;
    const order = getOrder(orderId);
    if (!order) throw new StoreError('Unknown payment order.', 409);
    const listing = getListingById(order.listingId);
    if (
      !listing ||
      listing.ownerId !== order.ownerId ||
      session.metadata?.ownerId !== order.ownerId ||
      session.metadata?.jobId !== order.listingId ||
      session.metadata?.plan !== order.plan ||
      session.metadata?.listingVersion !== String(order.listingVersion) ||
      session.client_reference_id !== order.id ||
      (order.sessionId && order.sessionId !== session.id) ||
      session.mode !== 'payment' ||
      session.currency !== order.currency ||
      !sessionAmountMatches(session, order.amount) ||
      !sessionSettled(session, order.plan)
    )
      throw new StoreError('Payment details do not match this job order.', 409);
    const timestamp = nowIso();
    const invoice = session.invoice && typeof session.invoice !== 'string' ? session.invoice : null;
    const intent =
      session.payment_intent && typeof session.payment_intent !== 'string'
        ? session.payment_intent
        : null;
    const charge =
      intent?.latest_charge && typeof intent.latest_charge !== 'string'
        ? intent.latest_charge
        : null;
    // Even if the refund webhook was delayed or missed, a fresh expanded Stripe charge
    // is authoritative: a refunded payment cannot buy publication.
    if (charge?.refunded) {
      const intentId = validateRefundCharge(order, charge);
      if (intentId !== refId(session.payment_intent))
        throw new StoreError('Refund payment reference conflict.', 409);
      markRefunded(db, order, intentId, timestamp);
      db.prepare('UPDATE payment_orders SET sessionId=? WHERE id=?').run(session.id, order.id);
      recordStripeEvent(db, event, timestamp);
      return true;
    }
    if (order.status === 'refunded') {
      db.prepare('UPDATE payment_orders SET sessionId=? WHERE id=?').run(session.id, order.id);
      recordStripeEvent(db, event, timestamp);
      return true;
    }
    db.prepare(
      "UPDATE payment_orders SET status='paid',sessionId=?,paidAt=COALESCE(paidAt,?),paymentIntentId=?,invoiceUrl=COALESCE(?,invoiceUrl),receiptUrl=COALESCE(?,receiptUrl) WHERE id=?",
    ).run(
      session.id,
      timestamp,
      refId(session.payment_intent),
      safeStripeUrl(invoice?.hosted_invoice_url),
      safeStripeUrl(charge?.receipt_url),
      order.id,
    );
    if (order.status !== 'paid') {
      // Edits during checkout require explicit resubmission; the purchased entitlement stays available.
      const pending =
        listing.version === order.listingVersion &&
        ['draft', 'rejected'].includes(listing.status) &&
        !!listing.url &&
        (!listing.deadline || listing.deadline > timestamp);
      const plan = JOB_PLANS[order.plan];
      db.prepare(
        'UPDATE listings SET paymentOrderId=?,paidAt=?,planId=?,entitlementExpiresAt=NULL,featured=?,placement=?,status=?,version=version+1,updatedAt=? WHERE id=?',
      ).run(
        order.id,
        timestamp,
        order.plan,
        Number(plan.featured),
        plan.priority,
        pending ? 'pending' : 'draft',
        timestamp,
        order.listingId,
      );
      db.prepare('INSERT INTO audit(id,listingId,actorId,action,createdAt) VALUES(?,?,?,?,?)').run(
        randomUUID(),
        order.listingId,
        order.ownerId,
        `payment confirmed: ${order.plan}; ${pending ? 'submitted for review' : 'draft requires review submission'}`,
        timestamp,
      );
      notifyGuestPayment(order);
      trackServerEvent('payment_completed', {
        plan: order.plan,
        amount_eur: (session.amount_total ?? order.amount) / 100,
      });
    }
    if (event)
      db.prepare('INSERT INTO stripe_events(id,type,receivedAt) VALUES(?,?,?)').run(
        event.id,
        event.type,
        timestamp,
      );
    return true;
  });
}
export async function reconcileCheckout(
  ownerId: string,
  sessionId: string,
  gateway?: BillingProvider,
) {
  const order = orderRow(
    getDb()
      .prepare('SELECT * FROM payment_orders WHERE sessionId=? AND ownerId=?')
      .get(sessionId, ownerId),
  );
  if (!order) throw new StoreError('Checkout not found for this job owner.', 404);
  const session = await (gateway || provider()).retrieve(sessionId);
  if (sessionSettled(session, order.plan)) applyPaidSession(session);
  return { order: getOrder(order.id), listing: getListingById(order.listingId) };
}
export function listPayments(ownerId: string) {
  return getDb()
    .prepare(
      'SELECT p.*,l.title FROM payment_orders p JOIN listings l ON l.id=p.listingId WHERE p.ownerId=? ORDER BY p.createdAt DESC LIMIT 100',
    )
    .all(ownerId) as unknown as (PaymentOrder & { title: string })[];
}
export async function handleStripeEvent(event: Stripe.Event, gateway?: BillingProvider) {
  if (
    ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
  ) {
    const snapshot = event.data.object as Stripe.Checkout.Session;
    if (
      !snapshot.metadata?.eujobsOrderId ||
      !['paid', 'no_payment_required'].includes(snapshot.payment_status)
    )
      return;
    const session = await (gateway || provider()).retrieve(snapshot.id);
    applyPaidSession(session, event);
  } else if (
    ['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)
  ) {
    const snapshot = event.data.object as Stripe.Checkout.Session;
    if (!snapshot.metadata?.eujobsOrderId) return;
    // Re-fetch before releasing the reservation: a delayed failure/expiry event must
    // not open a second checkout after Stripe has already collected payment.
    const session = await (gateway || provider()).retrieve(snapshot.id);
    if (sessionSettled(session)) {
      applyPaidSession(session, event);
      return;
    }
    if (
      event.type === 'checkout.session.expired'
        ? session.status !== 'expired'
        : session.status !== 'complete'
    )
      return;
    const db = getDb();
    transaction(db, () => {
      const order = getOrder(snapshot.metadata!.eujobsOrderId);
      if (!order) return;
      if (
        session.metadata?.eujobsOrderId !== order.id ||
        session.metadata.ownerId !== order.ownerId ||
        session.metadata.jobId !== order.listingId ||
        session.metadata.plan !== order.plan ||
        session.client_reference_id !== order.id ||
        !sessionAmountMatches(session, order.amount) ||
        session.currency !== order.currency ||
        (order.sessionId && order.sessionId !== session.id)
      )
        throw new StoreError('Checkout event does not match this job order.', 409);
      db.prepare(
        "UPDATE payment_orders SET status='expired',sessionId=? WHERE id=? AND status='open'",
      ).run(session.id, order.id);
      recordStripeEvent(db, event, nowIso());
    });
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    if (!charge.refunded) return;
    const db = getDb();
    transaction(db, () => {
      if (db.prepare('SELECT id FROM stripe_events WHERE id=?').get(event.id)) return;
      const intentId = refId(charge.payment_intent);
      const knownOrder = intentId
        ? orderRow(db.prepare('SELECT * FROM payment_orders WHERE paymentIntentId=?').get(intentId))
        : null;
      const order =
        knownOrder ||
        (charge.metadata?.eujobsOrderId ? getOrder(charge.metadata.eujobsOrderId) : null);
      if (!order) return; // Unrelated old-account charges are outside this application's ledger.
      const listing = getListingById(order.listingId);
      if (!listing || listing.ownerId !== order.ownerId)
        throw new StoreError('Refund owner mismatch.', 409);
      const confirmedIntentId = validateRefundCharge(order, charge, !knownOrder);
      const timestamp = nowIso();
      markRefunded(db, order, confirmedIntentId, timestamp);
      recordStripeEvent(db, event, timestamp);
    });
  }
}
export function verifyStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StoreError('Webhook verification is not configured.', 503);
  try {
    return getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new StoreError('Invalid Stripe signature.', 400);
  }
}
