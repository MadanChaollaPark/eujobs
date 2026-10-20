import { createHash, timingSafeEqual, randomUUID, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type Stripe from 'stripe';
import { z } from 'zod';
import { getStripe, type BillingProvider } from './billing';
import { getDb, StoreError } from './store';
import type { Listing } from './types';
import { emailDb, enqueueEmail } from './email';
import {
  buildMonthlyCalendar,
  getCalendarMonth,
  getPublishedMonthEvents,
  buildMonthFeed,
} from './monthly-calendar';
import { CALENDAR_CURRENCY, CALENDAR_PRICE_CENTS } from './monthly-calendar-shared';

type OrderStatus = 'open' | 'paid' | 'expired' | 'refunded';
interface CalendarOrder {
  id: string;
  requestId: string;
  tokenHash: string;
  email: string;
  accessExpiresAt: string;
  month: string;
  monthStart: string;
  monthEnd: string;
  label: string;
  eventCount: number;
  eventSnapshot: string;
  calendarSnapshot: string;
  snapshotHash: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  sessionId: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
  paymentIntentId: string | null;
  invoiceUrl: string | null;
  receiptUrl: string | null;
}
export interface CalendarPurchase {
  id: string;
  status: OrderStatus;
  month: string;
  monthStart: string;
  monthEnd: string;
  label: string;
  count: number;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  downloadUrl: string | null;
  feedUrl: string | null;
  currentCount: number;
  accessExpiresAt: string;
  invoiceUrl: string | null;
  receiptUrl: string | null;
}

const initialized = new WeakSet<DatabaseSync>();
const nowIso = () => new Date().toISOString();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const PRODUCT = 'monthly_calendar';
export const calendarTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine(
    (value) => Buffer.from(value, 'base64url').toString('base64url') === value,
    'Invalid calendar access link.',
  );
const orderIdSchema = z.uuid();
export const calendarSessionSchema = z
  .string()
  .regex(/^cs_[A-Za-z0-9_]+$/)
  .max(255);
const createSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    requestId: z.uuid(),
    requestToken: calendarTokenSchema,
  })
  .strict();

function calendarDb() {
  const db = getDb();
  if (!initialized.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS calendar_orders (
      id TEXT PRIMARY KEY, requestId TEXT NOT NULL UNIQUE, tokenHash TEXT NOT NULL, email TEXT NOT NULL, accessExpiresAt TEXT NOT NULL,
      month TEXT NOT NULL, monthStart TEXT NOT NULL, monthEnd TEXT NOT NULL, label TEXT NOT NULL,
      eventCount INTEGER NOT NULL CHECK(eventCount > 0), eventSnapshot TEXT NOT NULL,
      calendarSnapshot TEXT NOT NULL, snapshotHash TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0), currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','expired','refunded')),
      sessionId TEXT UNIQUE, checkoutUrl TEXT, expiresAt TEXT, createdAt TEXT NOT NULL,
      paidAt TEXT, paymentIntentId TEXT UNIQUE, invoiceUrl TEXT, receiptUrl TEXT
    );
    CREATE TABLE IF NOT EXISTS calendar_stripe_events (
      id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES calendar_orders(id),
      type TEXT NOT NULL, receivedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_access_tokens (
      tokenHash TEXT PRIMARY KEY, feedTokenHash TEXT NOT NULL UNIQUE,
      orderId TEXT NOT NULL REFERENCES calendar_orders(id), createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_feed_events (
      orderId TEXT NOT NULL REFERENCES calendar_orders(id), listingId TEXT NOT NULL,
      payload TEXT NOT NULL, PRIMARY KEY(orderId,listingId)
    );`);
    initialized.add(db);
  }
  return db;
}
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
function readOrder(id: string): CalendarOrder | null {
  return (
    (calendarDb()
      .prepare('SELECT * FROM calendar_orders WHERE id=?')
      .get(id) as unknown as CalendarOrder) || null
  );
}
function publicOrder(order: CalendarOrder): CalendarPurchase {
  return {
    id: order.id,
    status: order.status,
    month: order.month,
    monthStart: order.monthStart,
    monthEnd: order.monthEnd,
    label: order.label,
    count: order.eventCount,
    amount: order.amount,
    currency: order.currency,
    checkoutUrl: order.status === 'open' ? order.checkoutUrl : null,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    downloadUrl: order.status === 'paid' ? `/api/calendar-purchases/${order.id}/download` : null,
    feedUrl: null,
    currentCount:
      order.status === 'paid' ? getPublishedMonthEvents(order.month).length : order.eventCount,
    accessExpiresAt: order.accessExpiresAt,
    invoiceUrl: order.invoiceUrl,
    receiptUrl: order.receiptUrl,
  };
}
function authenticatedOrder(id: string, token: unknown): CalendarOrder {
  const parsedId = orderIdSchema.safeParse(id),
    parsedToken = calendarTokenSchema.safeParse(token);
  if (!parsedId.success || !parsedToken.success)
    throw new StoreError('Open the private access link for this calendar purchase.', 401);
  const order = readOrder(parsedId.data);
  const access = calendarDb()
    .prepare('SELECT tokenHash FROM calendar_access_tokens WHERE tokenHash=? AND orderId=?')
    .get(digest(parsedToken.data), id);
  if (
    !order ||
    !access ||
    !timingSafeEqual(
      Buffer.from(String(access.tokenHash), 'hex'),
      Buffer.from(digest(parsedToken.data), 'hex'),
    )
  )
    throw new StoreError('This calendar access link is invalid.', 401);
  if (Date.parse(order.accessExpiresAt) <= Date.now())
    throw new StoreError('This calendar access link has expired.', 403);
  return order;
}
function feedToken(token: string) {
  return createHash('sha256').update(`EUJobs calendar feed:${token}`).digest('base64url');
}
function saveAccess(db: DatabaseSync, orderId: string, token: string) {
  db.prepare(
    'INSERT INTO calendar_access_tokens(tokenHash,feedTokenHash,orderId,createdAt) VALUES(?,?,?,?)',
  ).run(digest(token), digest(feedToken(token)), orderId, nowIso());
}
export function getCalendarPurchase(id: string, token: unknown): CalendarPurchase {
  const order = authenticatedOrder(id, token),
    purchase = publicOrder(order);
  if (order.status === 'paid')
    purchase.feedUrl = `${origin()}/api/calendar-purchases/${id}/feed?token=${feedToken(String(token))}`;
  return purchase;
}
export const calendarCookieName = (id: string) => `eujobs_calendar_${id}`;
export function calendarCookieOptions(id: string) {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production' ||
      process.env.APP_ORIGIN?.startsWith('https:') === true,
    sameSite: 'lax' as const,
    path: `/api/calendar-purchases/${id}`,
    maxAge: 366 * 86400,
  };
}
export function requireCalendarPurchase(request: Request, id: string) {
  const prefix = `${calendarCookieName(id)}=`;
  const token = (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return { purchase: getCalendarPurchase(id, token), token: token! };
}
function queueAccessEmail(order: CalendarOrder, token: string, paid = false) {
  enqueueEmail({
    to: order.email,
    subject: paid
      ? 'Your EUJobs monthly calendar payment is confirmed'
      : 'Your private EUJobs monthly calendar link',
    text: `${paid ? 'Your payment has been verified.' : 'Your calendar purchase has been saved. Payment is required before calendar access.'}\n\n${order.label}: ${order.eventCount} events in your saved snapshot.\n\nOpen your private link to check payment, download the calendar or subscribe to updates for this month:\n${origin()}/calendar-purchases/${order.id}#token=${token}\n\nKeep this link private. Access expires on ${order.accessExpiresAt.slice(0, 10)}. This purchase does not include event admission or registration.\n\nEUJobs`,
    idempotencyKey: `calendar-${paid ? 'paid' : 'access'}:${order.id}`,
    expiresAt: Date.parse(order.accessExpiresAt),
  });
}
function preparePaidEmail(order: CalendarOrder) {
  const db = calendarDb();
  if (
    db
      .prepare('SELECT id FROM email_outbox WHERE idempotencyKey=?')
      .get(`calendar-paid:${order.id}`)
  )
    return;
  const token = randomBytes(32).toString('base64url');
  saveAccess(db, order.id, token);
  queueAccessEmail(order, token, true);
}

function gateway(): BillingProvider {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new StoreError(
      'Calendar payments are temporarily unavailable. Please retry this purchase later.',
      503,
    );
  const stripe = getStripe();
  return {
    create: (params, idempotencyKey) => stripe.checkout.sessions.create(params, { idempotencyKey }),
    retrieve: (id) =>
      stripe.checkout.sessions.retrieve(id, {
        expand: ['invoice', 'payment_intent.latest_charge'],
      }),
  };
}
function origin() {
  const configured =
    process.env.APP_ORIGIN ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;
  if (!configured) throw new StoreError('Calendar checkout is temporarily unavailable.', 503);
  const url = new URL(configured);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new StoreError('Calendar checkout is temporarily unavailable.', 503);
  return url.origin;
}
function stripeUrl(value: string | null | undefined, checkout = false) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (checkout
        ? url.hostname === 'checkout.stripe.com'
        : url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))
      ? value
      : null;
  } catch {
    return null;
  }
}
function metadata(order: CalendarOrder) {
  return {
    eujobsProduct: PRODUCT,
    eujobsCalendarOrderId: order.id,
    month: order.month,
    snapshotHash: order.snapshotHash,
  };
}
function matchingMetadata(order: CalendarOrder, value: Stripe.Metadata | null | undefined) {
  return (
    Object.entries(metadata(order)).every(([key, expected]) => value?.[key] === expected) &&
    !value?.eujobsOrderId
  );
}
function refId(value: string | { id: string } | null) {
  return typeof value === 'string' ? value : value?.id || null;
}
function verifySession(order: CalendarOrder, session: Stripe.Checkout.Session) {
  if (
    !calendarSessionSchema.safeParse(session.id).success ||
    !matchingMetadata(order, session.metadata) ||
    session.client_reference_id !== order.id ||
    (order.sessionId && session.id !== order.sessionId) ||
    session.mode !== 'payment' ||
    session.currency !== order.currency ||
    session.amount_total !== order.amount
  )
    throw new StoreError('Payment details do not match this calendar purchase.', 409);
  const intent = refId(session.payment_intent);
  if (order.paymentIntentId && intent !== order.paymentIntentId)
    throw new StoreError('Payment reference does not match this calendar purchase.', 409);
}
function verifyCharge(order: CalendarOrder, charge: Stripe.Charge) {
  const intent = refId(charge.payment_intent);
  if (
    !intent ||
    (order.paymentIntentId && intent !== order.paymentIntentId) ||
    charge.currency !== order.currency ||
    charge.amount !== order.amount ||
    !matchingMetadata(order, charge.metadata) ||
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > order.amount ||
    (charge.refunded && charge.amount_refunded !== order.amount)
  )
    throw new StoreError('Refund details do not match this calendar purchase.', 409);
  return intent;
}
function recordEvent(db: DatabaseSync, order: CalendarOrder, event?: { id: string; type: string }) {
  if (event)
    db.prepare(
      'INSERT OR IGNORE INTO calendar_stripe_events(id,orderId,type,receivedAt) VALUES(?,?,?,?)',
    ).run(event.id, order.id, event.type, nowIso());
}
function refunded(db: DatabaseSync, order: CalendarOrder, intentId: string) {
  db.prepare("UPDATE calendar_orders SET status='refunded',paymentIntentId=? WHERE id=?").run(
    intentId,
    order.id,
  );
}
/** The caller must supply a signed webhook's server-retrieved session, never a browser payment claim. */
function applySession(session: Stripe.Checkout.Session, event?: { id: string; type: string }) {
  const db = calendarDb();
  emailDb();
  return transaction(db, () => {
    const order = readOrder(session.metadata?.eujobsCalendarOrderId || '');
    if (!order) throw new StoreError('Unknown calendar purchase.', 409);
    verifySession(order, session);
    const intent =
      session.payment_intent && typeof session.payment_intent !== 'string'
        ? session.payment_intent
        : null;
    const charge =
      intent?.latest_charge && typeof intent.latest_charge !== 'string'
        ? intent.latest_charge
        : null;
    if (charge) {
      const intentId = verifyCharge(order, charge);
      if (intentId !== intent?.id) throw new StoreError('Payment reference conflict.', 409);
      if (charge.refunded && charge.amount_refunded >= order.amount) refunded(db, order, intentId);
    }
    // Refunds are terminal even when the paid callback arrives out of order.
    if (readOrder(order.id)!.status === 'refunded') {
      db.prepare('UPDATE calendar_orders SET sessionId=? WHERE id=?').run(session.id, order.id);
      recordEvent(db, order, event);
      return publicOrder(readOrder(order.id)!);
    }
    if (session.status === 'complete' && session.payment_status === 'paid') {
      const intentId = refId(session.payment_intent);
      if (!intentId)
        throw new StoreError('Payment confirmation is incomplete. Please retry shortly.', 409);
      if (
        intent &&
        (intent.status !== 'succeeded' ||
          intent.amount !== order.amount ||
          intent.currency !== order.currency ||
          !matchingMetadata(order, intent.metadata))
      )
        throw new StoreError('Payment intent does not match this calendar purchase.', 409);
      if (charge && (!charge.paid || charge.status !== 'succeeded'))
        throw new StoreError('Payment confirmation is incomplete. Please retry shortly.', 409);
      const invoice =
        session.invoice && typeof session.invoice !== 'string' ? session.invoice : null;
      db.prepare(
        "UPDATE calendar_orders SET status='paid',sessionId=?,paidAt=COALESCE(paidAt,?),paymentIntentId=?,invoiceUrl=COALESCE(?,invoiceUrl),receiptUrl=COALESCE(?,receiptUrl) WHERE id=?",
      ).run(
        session.id,
        nowIso(),
        intentId,
        stripeUrl(invoice?.hosted_invoice_url),
        stripeUrl(charge?.receipt_url),
        order.id,
      );
    } else if (
      session.status === 'expired' ||
      (session.status === 'complete' && session.payment_status === 'unpaid')
    ) {
      db.prepare(
        "UPDATE calendar_orders SET status='expired',sessionId=? WHERE id=? AND status='open'",
      ).run(session.id, order.id);
    }
    const updated = readOrder(order.id)!;
    if (updated.status === 'paid') {
      const accessExpiresAt = new Date(
        Math.max(Date.parse(updated.accessExpiresAt), Date.parse(updated.paidAt!) + 366 * 86400000),
      ).toISOString();
      db.prepare('UPDATE calendar_orders SET accessExpiresAt=? WHERE id=?').run(
        accessExpiresAt,
        order.id,
      );
      preparePaidEmail(readOrder(order.id)!);
    }
    recordEvent(db, order, event);
    return publicOrder(readOrder(order.id)!);
  });
}
async function checkout(
  order: CalendarOrder,
  provider: BillingProvider,
): Promise<CalendarPurchase> {
  if (order.status !== 'open') return publicOrder(order);
  getCalendarMonth(order.month);
  if (order.sessionId) {
    const session = await provider.retrieve(order.sessionId);
    const current = applySession(session);
    if (current.status !== 'open') return current;
    if (session.status !== 'open' || !stripeUrl(session.url, true))
      throw new StoreError('Checkout is still processing. Check the purchase status shortly.', 409);
    return { ...current, checkoutUrl: stripeUrl(session.url, true) };
  }
  // Never reuse a Stripe idempotency key after Stripe may have discarded it.
  if (Date.now() - Date.parse(order.createdAt) > 23 * 3600000)
    throw new StoreError(
      'This checkout needs support to verify its status. Contact EUJobs before paying again.',
      409,
    );
  const base = origin();
  const session = await provider.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: order.email,
      billing_address_collection: 'required',
      invoice_creation: { enabled: true },
      line_items: [
        {
          price_data: {
            currency: order.currency,
            unit_amount: order.amount,
            product_data: {
              name: `EUJobs monthly calendar — ${order.label}`,
              description: `One-time month pass with ${order.eventCount} events at purchase and updates for this month. Calendar convenience only; event admission and registration are separate.`,
            },
          },
          quantity: 1,
        },
      ],
      expires_at: Math.floor(Date.parse(order.createdAt) / 1000) + 24 * 3600,
      success_url: `${base}/calendar-purchases/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/calendar-purchases/${order.id}?checkout=cancelled`,
      client_reference_id: order.id,
      metadata: metadata(order),
      payment_intent_data: { metadata: metadata(order) },
    },
    `eujobs-calendar-${order.id}`,
  );
  verifySession(order, session);
  const url = stripeUrl(session.url, true);
  if (!url) throw new StoreError('Checkout could not be opened. Please retry this purchase.', 503);
  const db = calendarDb();
  transaction(db, () => {
    const current = readOrder(order.id)!;
    if (current.sessionId && current.sessionId !== session.id)
      throw new StoreError('Checkout reference conflict. Contact EUJobs.', 409);
    db.prepare('UPDATE calendar_orders SET sessionId=?,checkoutUrl=?,expiresAt=? WHERE id=?').run(
      session.id,
      url,
      new Date(session.expires_at * 1000).toISOString(),
      order.id,
    );
  });
  return publicOrder(readOrder(order.id)!);
}
export async function createCalendarPurchase(input: unknown, provider?: BillingProvider) {
  const body = createSchema.parse(input),
    db = calendarDb();
  const order = transaction(db, () => {
    const previous = db
      .prepare('SELECT * FROM calendar_orders WHERE requestId=?')
      .get(body.requestId) as unknown as CalendarOrder | undefined;
    if (previous) {
      const checked = authenticatedOrder(previous.id, body.requestToken);
      if (checked.month !== body.month || checked.email !== body.email)
        throw new StoreError(
          'This saved checkout has a different month or email. Open your original private purchase link to continue.',
          409,
        );
      return checked;
    }
    const month = getCalendarMonth(body.month);
    if (!month.count)
      throw new StoreError(
        'There are no events in this month. Choose another month before paying.',
        409,
      );
    const eventSnapshot = JSON.stringify(month.events),
      calendarSnapshot = buildMonthlyCalendar(month.events, month.month);
    const snapshotHash = digest(
      JSON.stringify({
        eventSnapshot,
        calendarSnapshot,
        month: month.month,
        monthEnd: month.monthEnd,
      }),
    );
    const id = randomUUID();
    db.prepare(
      `INSERT INTO calendar_orders(id,requestId,tokenHash,email,accessExpiresAt,month,monthStart,monthEnd,label,eventCount,eventSnapshot,calendarSnapshot,snapshotHash,amount,currency,createdAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      body.requestId,
      digest(body.requestToken),
      body.email,
      new Date(Date.parse(`${month.monthEnd}T23:59:59Z`) + 366 * 86400000).toISOString(),
      month.month,
      month.monthStart,
      month.monthEnd,
      month.label,
      month.count,
      eventSnapshot,
      calendarSnapshot,
      snapshotHash,
      CALENDAR_PRICE_CENTS,
      CALENDAR_CURRENCY,
      nowIso(),
    );
    saveAccess(db, id, body.requestToken);
    for (const event of month.events)
      db.prepare('INSERT INTO calendar_feed_events(orderId,listingId,payload) VALUES(?,?,?)').run(
        id,
        event.id,
        JSON.stringify(event),
      );
    return readOrder(id)!;
  });
  queueAccessEmail(order, body.requestToken);
  const purchase = await checkout(order, provider || gateway());
  return {
    ...purchase,
    ...getCalendarPurchase(order.id, body.requestToken),
    manageUrl: `/calendar-purchases/${order.id}#token=${body.requestToken}`,
  };
}
export async function continueCalendarCheckout(
  id: string,
  token: unknown,
  provider?: BillingProvider,
) {
  const order = authenticatedOrder(id, token);
  await checkout(order, provider || gateway());
  return getCalendarPurchase(id, token);
}
export async function reconcileCalendarPurchase(
  id: string,
  token: unknown,
  sessionId?: string,
  provider?: BillingProvider,
) {
  const order = authenticatedOrder(id, token);
  if (sessionId) calendarSessionSchema.parse(sessionId);
  if (sessionId && order.sessionId && sessionId !== order.sessionId)
    throw new StoreError('Checkout not found for this calendar purchase.', 404);
  const selectedSession = order.sessionId || sessionId;
  if (!selectedSession || order.status === 'refunded') return getCalendarPurchase(id, token);
  const session = await (provider || gateway()).retrieve(selectedSession);
  if (session.id !== selectedSession) throw new StoreError('Checkout reference conflict.', 409);
  verifySession(order, session);
  applySession(session);
  return getCalendarPurchase(id, token);
}
async function verifyPaidOrder(
  original: CalendarOrder,
  provider?: BillingProvider,
): Promise<CalendarOrder> {
  if (original.status === 'refunded')
    throw new StoreError(
      'This purchase was refunded. Calendar access is no longer available.',
      403,
    );
  if (Date.parse(original.accessExpiresAt) <= Date.now())
    throw new StoreError('This calendar access link has expired.', 403);
  if (!original.sessionId)
    throw new StoreError('Complete payment before accessing this calendar.', 402);
  const session = await (provider || gateway()).retrieve(original.sessionId);
  verifySession(original, session);
  applySession(session);
  const order = readOrder(original.id)!;
  if (order.status === 'refunded')
    throw new StoreError(
      'This purchase was refunded. Calendar access is no longer available.',
      403,
    );
  if (order.status !== 'paid' || session.status !== 'complete' || session.payment_status !== 'paid')
    throw new StoreError('Complete payment before accessing this calendar.', 402);
  const intent =
    session.payment_intent && typeof session.payment_intent !== 'string'
      ? session.payment_intent
      : null;
  const charge =
    intent?.latest_charge && typeof intent.latest_charge !== 'string' ? intent.latest_charge : null;
  if (!intent || !charge)
    throw new StoreError(
      'Payment confirmation is temporarily unavailable. Please retry shortly.',
      503,
    );
  return order;
}
export async function downloadCalendarPurchase(
  id: string,
  token: unknown,
  provider?: BillingProvider,
) {
  const order = await verifyPaidOrder(authenticatedOrder(id, token), provider);
  const expectedHash = digest(
    JSON.stringify({
      eventSnapshot: order.eventSnapshot,
      calendarSnapshot: order.calendarSnapshot,
      month: order.month,
      monthEnd: order.monthEnd,
    }),
  );
  if (expectedHash !== order.snapshotHash)
    throw new StoreError('This calendar needs support to verify its saved contents.', 503);
  return { calendar: order.calendarSnapshot, filename: `eujobs-month-${order.month}.ics` };
}
export const getCalendarDownload = downloadCalendarPurchase;
export async function getAuthorizedCalendarEvents(
  id: string,
  token: unknown,
  provider?: BillingProvider,
) {
  const order = await verifyPaidOrder(authenticatedOrder(id, token), provider);
  return { purchase: getCalendarPurchase(id, token), events: getPublishedMonthEvents(order.month) };
}
/** A feed token can only read its purchased month; it cannot manage purchases or initiate payment. */
export async function getCalendarFeed(id: string, token: unknown, provider?: BillingProvider) {
  const parsed = calendarTokenSchema.safeParse(token);
  if (!orderIdSchema.safeParse(id).success || !parsed.success)
    throw new StoreError('This calendar subscription link is invalid.', 401);
  const access = calendarDb()
    .prepare('SELECT orderId FROM calendar_access_tokens WHERE feedTokenHash=? AND orderId=?')
    .get(digest(parsed.data), id);
  const candidate = readOrder(id);
  if (!access || !candidate)
    throw new StoreError('This calendar subscription link is invalid.', 401);
  const order = await verifyPaidOrder(candidate, provider),
    db = calendarDb();
  const events = transaction(db, () => {
    const saved = new Map(
      db
        .prepare('SELECT listingId,payload FROM calendar_feed_events WHERE orderId=?')
        .all(id)
        .map((row) => [String(row.listingId), JSON.parse(String(row.payload)) as Listing]),
    );
    const current = new Map(getPublishedMonthEvents(order.month).map((event) => [event.id, event]));
    for (const [eventId, event] of current) {
      const old = saved.get(eventId);
      const unchanged =
        old && JSON.stringify({ ...old, version: event.version }) === JSON.stringify(event);
      saved.set(
        eventId,
        unchanged ? old : { ...event, version: Math.max(event.version, (old?.version ?? -1) + 1) },
      );
    }
    for (const [eventId, event] of saved) {
      if (!current.has(eventId) && event.status !== 'closed')
        saved.set(eventId, {
          ...event,
          status: 'closed',
          version: event.version + 1,
          updatedAt: nowIso(),
        });
    }
    for (const event of saved.values())
      db.prepare(
        'INSERT INTO calendar_feed_events(orderId,listingId,payload) VALUES(?,?,?) ON CONFLICT(orderId,listingId) DO UPDATE SET payload=excluded.payload',
      ).run(id, event.id, JSON.stringify(event));
    return [...saved.values()].sort(
      (a, b) => a.startsAt!.localeCompare(b.startsAt!) || a.id.localeCompare(b.id),
    );
  });
  return {
    calendar: buildMonthFeed(events, order.month),
    filename: `eujobs-month-${order.month}.ics`,
  };
}
/** Recognizes only the separate calendar product; existing job orders remain untouched. */
export async function handleCalendarStripeEvent(
  event: Stripe.Event,
  provider?: BillingProvider,
): Promise<boolean> {
  if (
    [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.expired',
      'checkout.session.async_payment_failed',
    ].includes(event.type)
  ) {
    const snapshot = event.data.object as Stripe.Checkout.Session;
    if (!snapshot.metadata?.eujobsCalendarOrderId) return false;
    const session = await (provider || gateway()).retrieve(snapshot.id);
    if (
      session.id !== snapshot.id ||
      session.metadata?.eujobsCalendarOrderId !== snapshot.metadata.eujobsCalendarOrderId
    )
      throw new StoreError('Checkout reference conflict.', 409);
    applySession(session, event);
    return true;
  }
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    if (!charge.metadata?.eujobsCalendarOrderId) return false;
    const db = calendarDb();
    transaction(db, () => {
      const order = readOrder(charge.metadata.eujobsCalendarOrderId);
      if (!order) throw new StoreError('Unknown calendar purchase.', 409);
      const intentId = verifyCharge(order, charge);
      if (charge.refunded && charge.amount_refunded >= order.amount) refunded(db, order, intentId);
      recordEvent(db, order, event);
    });
    return true;
  }
  return false;
}
