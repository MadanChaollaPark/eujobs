import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb, StoreError } from './store';
import { getAuthorizedCalendarEvents, type CalendarPurchase } from './calendar-billing';
import type { BillingProvider } from './billing';
import { localCalendarDay } from './monthly-calendar';
import type { Listing } from './types';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const GOOGLE_STATE_COOKIE = 'eujobs_calendar_google_state';
const CALLBACK_PATH = '/api/calendar/google/callback';
const STATE_TTL = 10 * 60 * 1000;
const LEASE_TTL = 120_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const initialized = new WeakSet<DatabaseSync>();
function googleDb() {
  const db = getDb();
  if (!initialized.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS google_calendar_connections (
      purchaseId TEXT PRIMARY KEY, subject TEXT NOT NULL, encryptedToken TEXT NOT NULL,
      tokenExpiresAt INTEGER NOT NULL, calendarId TEXT, calendarName TEXT NOT NULL,
      createState TEXT NOT NULL DEFAULT 'new' CHECK(createState IN ('new','creating','uncertain','ready')),
      lease TEXT, leaseExpiresAt INTEGER NOT NULL DEFAULT 0, lastSyncedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS google_calendar_states (
      stateHash TEXT PRIMARY KEY, browserHash TEXT NOT NULL, purchaseId TEXT NOT NULL,
      encryptedAccess TEXT NOT NULL, encryptedVerifier TEXT NOT NULL, expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS google_calendar_events (
      purchaseId TEXT NOT NULL, listingId TEXT NOT NULL, eventId TEXT NOT NULL,
      payloadHash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(purchaseId,listingId)
    );`);
    initialized.add(db);
  }
  return db;
}
function encryptionKey(): Buffer {
  const value = process.env.CALENDAR_TOKEN_KEY || '';
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value)
    throw new StoreError('Google Calendar connection is not available yet.', 503);
  return key;
}
export function googleCalendarConfigured() {
  if (
    process.env.GOOGLE_CALENDAR_ENABLED !== '1' ||
    !process.env.GOOGLE_CALENDAR_CLIENT_ID ||
    !process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  )
    return false;
  try {
    encryptionKey();
    callbackUrl();
    return true;
  } catch {
    return false;
  }
}
function assertConfigured() {
  if (!googleCalendarConfigured())
    throw new StoreError(
      'Google Calendar connection is not available yet. You can download or subscribe to your calendar instead.',
      503,
    );
}
function appOrigin() {
  const origin = new URL(process.env.APP_ORIGIN || '');
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== 'https:' &&
      !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))
  )
    throw new Error('Invalid app origin');
  return origin.origin;
}
function callbackUrl() {
  return `${appOrigin()}${CALLBACK_PATH}`;
}
function encrypt(value: string, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}
function decrypt(value: string, context: string) {
  const [iv, tag, payload, extra] = value.split('.');
  if (!iv || !tag || !payload || extra) throw new Error('Invalid encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
export function googleStateCookieOptions() {
  return {
    httpOnly: true,
    secure: appOrigin().startsWith('https:'),
    sameSite: 'lax' as const,
    path: CALLBACK_PATH,
    maxAge: STATE_TTL / 1000,
  };
}
interface Connection {
  purchaseId: string;
  subject: string;
  encryptedToken: string;
  tokenExpiresAt: number;
  calendarId: string | null;
  calendarName: string;
  createState: 'new' | 'creating' | 'uncertain' | 'ready';
  lease: string | null;
  leaseExpiresAt: number;
  lastSyncedAt: string | null;
}
function connection(id: string) {
  return googleDb()
    .prepare('SELECT * FROM google_calendar_connections WHERE purchaseId=?')
    .get(id) as unknown as Connection | undefined;
}
export function getGoogleCalendarStatus(id: string) {
  const configured = googleCalendarConfigured(),
    saved = configured ? connection(id) : undefined;
  return {
    configured,
    connected: !!saved && saved.tokenExpiresAt > Date.now() + 30_000,
    calendarName: saved?.calendarName || null,
    syncedCount: saved
      ? Number(
          googleDb()
            .prepare(
              'SELECT COUNT(*) AS n FROM google_calendar_events WHERE purchaseId=? AND active=1',
            )
            .get(id)?.n || 0,
        )
      : 0,
    lastSyncedAt: saved?.lastSyncedAt || null,
    needsReview:
      saved?.createState === 'uncertain' ||
      (saved?.createState === 'creating' && saved.leaseExpiresAt < Date.now()),
  };
}
export interface GoogleCalendarProvider {
  exchange(
    code: string,
    verifier: string,
  ): Promise<{ accessToken: string; expiresIn: number; scope: string }>;
  identity(accessToken: string): Promise<string>;
  createCalendar(accessToken: string, summary: string): Promise<string>;
  insertEvent(
    accessToken: string,
    calendarId: string,
    event: Record<string, unknown>,
  ): Promise<void>;
  updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: Record<string, unknown>,
  ): Promise<void>;
  removeEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
}
export class GoogleCalendarRequestError extends Error {
  constructor(public status: number) {
    super('Google Calendar could not complete this request.');
  }
}
async function googleRequest(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    throw new GoogleCalendarRequestError(0);
  }
  if (!response.ok) throw new GoogleCalendarRequestError(response.status);
  if (response.status === 204) return {};
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new GoogleCalendarRequestError(0);
  }
}
const api = 'https://www.googleapis.com/calendar/v3';
function authenticated(accessToken: string, method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}
const liveGoogle: GoogleCalendarProvider = {
  async exchange(code, verifier) {
    const response = await googleRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
        redirect_uri: callbackUrl(),
      }),
    });
    if (
      typeof response.access_token !== 'string' ||
      response.access_token.length > 8192 ||
      typeof response.expires_in !== 'number' ||
      response.expires_in < 60 ||
      response.expires_in > 86400 ||
      typeof response.scope !== 'string' ||
      response.token_type !== 'Bearer'
    )
      throw new GoogleCalendarRequestError(0);
    return {
      accessToken: response.access_token,
      expiresIn: response.expires_in,
      scope: response.scope,
    };
  },
  async identity(accessToken) {
    const response = await googleRequest(
      'https://openidconnect.googleapis.com/v1/userinfo',
      authenticated(accessToken, 'GET'),
    );
    if (typeof response.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(response.sub))
      throw new GoogleCalendarRequestError(0);
    return response.sub;
  },
  async createCalendar(token, summary) {
    const result = await googleRequest(
      `${api}/calendars`,
      authenticated(token, 'POST', {
        summary,
        timeZone: 'Europe/Brussels',
        description:
          'EUJobs events for your purchased month. Registration and admission are separate. Update events from your private EUJobs calendar page.',
      }),
    );
    if (typeof result.id !== 'string' || !result.id || result.id.length > 1024)
      throw new GoogleCalendarRequestError(0);
    return result.id;
  },
  async insertEvent(token, calendar, event) {
    await googleRequest(
      `${api}/calendars/${encodeURIComponent(calendar)}/events?sendUpdates=none`,
      authenticated(token, 'POST', event),
    );
  },
  async updateEvent(token, calendar, id, event) {
    await googleRequest(
      `${api}/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(id)}?sendUpdates=none`,
      authenticated(token, 'PATCH', event),
    );
  },
  async removeEvent(token, calendar, id) {
    await googleRequest(
      `${api}/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(id)}?sendUpdates=none`,
      authenticated(token, 'DELETE'),
    );
  },
};
export async function beginGoogleCalendarConnection(
  id: string,
  token: string,
  billing?: BillingProvider,
) {
  assertConfigured();
  await getAuthorizedCalendarEvents(id, token, billing);
  const state = randomBytes(32).toString('base64url'),
    browserToken = randomBytes(32).toString('base64url'),
    verifier = randomBytes(32).toString('base64url');
  const db = googleDb();
  db.prepare('DELETE FROM google_calendar_states WHERE expiresAt<=? OR purchaseId=?').run(
    Date.now(),
    id,
  );
  db.prepare('INSERT INTO google_calendar_states VALUES(?,?,?,?,?,?)').run(
    hash(state),
    hash(browserToken),
    id,
    encrypt(token, `access:${state}`),
    encrypt(verifier, `verifier:${state}`),
    Date.now() + STATE_TTL,
  );
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: `openid ${GOOGLE_CALENDAR_SCOPE}`,
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
  }).toString();
  return { url: url.href, browserToken };
}
interface GoogleState {
  purchaseId: string;
  encryptedAccess: string;
  encryptedVerifier: string;
}
export async function completeGoogleCalendarConnection(
  state: string | null,
  browser: string | null,
  code: string | null,
  deps: { google?: GoogleCalendarProvider; billing?: BillingProvider } = {},
) {
  assertConfigured();
  if (
    !state ||
    !browser ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    !/^[A-Za-z0-9_-]{43}$/.test(browser)
  )
    throw new StoreError('This Google connection has expired. Please connect again.', 400);
  // DELETE RETURNING consumes only a matching, unexpired browser-bound state.
  const saved = googleDb()
    .prepare(
      'DELETE FROM google_calendar_states WHERE stateHash=? AND browserHash=? AND expiresAt>? RETURNING purchaseId,encryptedAccess,encryptedVerifier',
    )
    .get(hash(state), hash(browser), Date.now()) as unknown as GoogleState | undefined;
  if (!saved)
    throw new StoreError('This Google connection has expired. Please connect again.', 400);
  try {
    if (!code || code.length > 4096) throw new Error('Consent was not completed');
    const token = decrypt(saved.encryptedAccess, `access:${state}`),
      { purchase } = await getAuthorizedCalendarEvents(saved.purchaseId, token, deps.billing);
    const provider = deps.google || liveGoogle;
    const access = await provider.exchange(
      code,
      decrypt(saved.encryptedVerifier, `verifier:${state}`),
    );
    if (!access.scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE))
      throw new Error('Calendar consent is missing');
    const subject = await provider.identity(access.accessToken),
      prior = connection(purchase.id);
    if (prior && prior.subject !== subject)
      throw new Error('Reconnect the original Google account');
    const db = googleDb();
    db.prepare(
      `INSERT INTO google_calendar_connections(purchaseId,subject,encryptedToken,tokenExpiresAt,calendarName) VALUES(?,?,?,?,?)
      ON CONFLICT(purchaseId) DO UPDATE SET encryptedToken=excluded.encryptedToken,tokenExpiresAt=excluded.tokenExpiresAt WHERE subject=excluded.subject`,
    ).run(
      purchase.id,
      subject,
      encrypt(access.accessToken, `google:${purchase.id}:${subject}`),
      Date.now() + access.expiresIn * 1000,
      `EUJobs — ${purchase.label}`,
    );
    await syncGoogleCalendar(purchase.id, token, deps);
    return { purchaseId: saved.purchaseId, connected: true };
  } catch {
    return { purchaseId: saved.purchaseId, connected: false };
  }
}
export function googleEventPayload(event: Listing) {
  if (event.kind !== 'event' || !event.startsAt || !event.endsAt)
    throw new StoreError('The event has incomplete dates.', 409);
  const page = `${appOrigin()}/events/${encodeURIComponent(event.slug)}`;
  return {
    id: `eujobs${hash(event.id)}`,
    summary: event.title,
    description: `${event.description}\n\nDetails and registration: ${page}\n\nAdding this event does not book admission or register you.`,
    location: [event.venue, event.location].filter(Boolean).join(', '),
    start: event.eventDateOnly
      ? { date: localCalendarDay(event.startsAt, event.timezone) }
      : { dateTime: event.startsAt, timeZone: event.timezone },
    end: event.eventDateOnly
      ? { date: localCalendarDay(event.endsAt, event.timezone) }
      : { dateTime: event.endsAt, timeZone: event.timezone },
    transparency: 'transparent',
    status: 'confirmed',
    reminders: { useDefault: false },
    source: { title: 'EUJobs', url: page },
    extendedProperties: { private: { eujobsListing: event.id } },
  };
}
export async function syncGoogleCalendar(
  id: string,
  token: string,
  deps: { google?: GoogleCalendarProvider; billing?: BillingProvider } = {},
) {
  assertConfigured();
  const { purchase, events } = await getAuthorizedCalendarEvents(id, token, deps.billing),
    db = googleDb();
  const lease = randomUUID();
  const acquired = db
    .prepare(
      'UPDATE google_calendar_connections SET lease=?,leaseExpiresAt=? WHERE purchaseId=? AND leaseExpiresAt<?',
    )
    .run(lease, Date.now() + LEASE_TTL, id, Date.now());
  if (!acquired.changes)
    throw new StoreError(
      'Connect Google Calendar first, or wait for the current import to finish.',
      409,
    );
  try {
    return await syncConnectedCalendar(purchase, events, lease, deps.google || liveGoogle);
  } catch (error) {
    if (error instanceof StoreError) throw error;
    if (error instanceof GoogleCalendarRequestError && error.status === 401) {
      db.prepare(
        'UPDATE google_calendar_connections SET tokenExpiresAt=0,encryptedToken=? WHERE purchaseId=?',
      ).run('', id);
      throw new StoreError('Reconnect Google Calendar to finish importing your events.', 409);
    }
    throw new StoreError(
      'Google Calendar could not finish the import. Your progress is saved; retry from this page.',
      503,
    );
  } finally {
    db.prepare(
      'UPDATE google_calendar_connections SET lease=NULL,leaseExpiresAt=0 WHERE purchaseId=? AND lease=?',
    ).run(id, lease);
  }
}
async function syncConnectedCalendar(
  purchase: CalendarPurchase,
  events: Listing[],
  lease: string,
  provider: GoogleCalendarProvider,
) {
  const id = purchase.id,
    db = googleDb(),
    saved = connection(id)!;
  if (saved.tokenExpiresAt <= Date.now() + 30_000)
    throw new StoreError('Reconnect Google Calendar to import or update these events.', 409);
  if (saved.createState === 'creating' || saved.createState === 'uncertain') {
    db.prepare(
      "UPDATE google_calendar_connections SET createState='uncertain' WHERE purchaseId=?",
    ).run(id);
    throw new StoreError(
      'Calendar creation needs review before retrying. Contact EUJobs with your purchase reference to avoid creating a duplicate calendar.',
      409,
    );
  }
  const accessToken = decrypt(saved.encryptedToken, `google:${id}:${saved.subject}`);
  let calendarId = saved.calendarId;
  if (!calendarId) {
    db.prepare(
      "UPDATE google_calendar_connections SET createState='creating' WHERE purchaseId=? AND lease=?",
    ).run(id, lease);
    try {
      calendarId = await provider.createCalendar(accessToken, saved.calendarName);
      db.prepare(
        "UPDATE google_calendar_connections SET calendarId=?,createState='ready' WHERE purchaseId=? AND lease=?",
      ).run(calendarId, id, lease);
    } catch (error) {
      const definiteRejection =
        error instanceof GoogleCalendarRequestError &&
        [400, 401, 403, 404, 429].includes(error.status);
      db.prepare(
        'UPDATE google_calendar_connections SET createState=? WHERE purchaseId=? AND lease=?',
      ).run(definiteRejection ? 'new' : 'uncertain', id, lease);
      throw error;
    }
  }
  let added = 0,
    updated = 0;
  const current = new Set(events.map((event) => event.id));
  for (const event of events) {
    const payload = googleEventPayload(event),
      payloadHash = hash(JSON.stringify(payload));
    const prior = db
      .prepare(
        'SELECT payloadHash,active FROM google_calendar_events WHERE purchaseId=? AND listingId=?',
      )
      .get(id, event.id);
    if (prior?.payloadHash === payloadHash && prior.active === 1) continue;
    db.prepare(
      'UPDATE google_calendar_connections SET leaseExpiresAt=? WHERE purchaseId=? AND lease=?',
    ).run(Date.now() + LEASE_TTL, id, lease);
    try {
      await provider.insertEvent(accessToken, calendarId, payload);
      added++;
    } catch (error) {
      if (!(error instanceof GoogleCalendarRequestError) || error.status !== 409) throw error;
      await provider.updateEvent(accessToken, calendarId, payload.id, payload);
      updated++;
    }
    db.prepare(
      'INSERT INTO google_calendar_events VALUES(?,?,?,?,1) ON CONFLICT(purchaseId,listingId) DO UPDATE SET payloadHash=excluded.payloadHash,active=1',
    ).run(id, event.id, payload.id, payloadHash);
  }
  const previous = db
    .prepare('SELECT listingId,eventId FROM google_calendar_events WHERE purchaseId=? AND active=1')
    .all(id);
  for (const removed of previous) {
    if (current.has(String(removed.listingId))) continue;
    db.prepare(
      'UPDATE google_calendar_connections SET leaseExpiresAt=? WHERE purchaseId=? AND lease=?',
    ).run(Date.now() + LEASE_TTL, id, lease);
    try {
      await provider.removeEvent(accessToken, calendarId, String(removed.eventId));
    } catch (error) {
      if (!(error instanceof GoogleCalendarRequestError) || ![404, 410].includes(error.status))
        throw error;
    }
    db.prepare('UPDATE google_calendar_events SET active=0 WHERE purchaseId=? AND listingId=?').run(
      id,
      removed.listingId,
    );
    updated++;
  }
  db.prepare(
    'UPDATE google_calendar_connections SET lastSyncedAt=? WHERE purchaseId=? AND lease=?',
  ).run(new Date().toISOString(), id, lease);
  return {
    calendarUrl: `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(Buffer.from(calendarId).toString('base64'))}`,
    added,
    updated,
    count: events.length,
  };
}
