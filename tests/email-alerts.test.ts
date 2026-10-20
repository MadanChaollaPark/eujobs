import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUser, createListing, getDb, findUserByEmail, getSession } from '../src/lib/store';
import {
  createUserSession,
  hashPassword,
  hashSessionToken,
  verifyPassword,
  SESSION_COOKIE,
} from '../src/lib/auth';
import {
  emailDb,
  enqueueEmail,
  processEmailOutbox,
  suppressEmails,
  EmailDeliveryError,
  emailAvailable,
  deliverViaResend,
} from '../src/lib/email';
import {
  requestAccountEmail,
  resetPassword,
  verifyAccountEmail,
  isEmailVerified,
  tokenHash,
} from '../src/lib/account-tokens';
import {
  subscribeAlert,
  confirmAlert,
  unsubscribeAlert,
  queueJobAlerts,
  alertEmailEligible,
  listAccountAlerts,
  unsubscribeAccountAlert,
} from '../src/lib/alerts';
import { GET as alertsGet, POST as alertsPost } from '../src/app/api/alerts/route';
import { POST as recoveryPost } from '../src/app/api/account-recovery/route';
import { POST as newsletterPost } from '../src/app/api/newsletter/signup/route';

const directories: string[] = [];
after(() =>
  directories.forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eujobs-email-test-'));
  directories.push(directory);
  process.env.DATA_DIR = directory;
  process.env.EUJOBS_SEED = '0';
  process.env.APP_ORIGIN = 'https://eujobs.example';
  process.env.BREVO_API_KEY = 'fixture-not-a-real-provider-key';
  process.env.BREVO_SENDER_EMAIL = 'fixture@example.invalid';
  process.env.EMAIL_PROVIDER = 'brevo';
  process.env.EMAIL_DELIVERY_ENABLED = '1';
  process.env.TRUST_PROXY = '1';
  return emailDb();
}
function messageToken(prefix: string, path: string) {
  const row = emailDb()
    .prepare(
      'SELECT text FROM email_outbox WHERE idempotencyKey LIKE ? ORDER BY createdAt DESC,rowid DESC LIMIT 1',
    )
    .get(prefix + '%') as { text: string };
  assert(row, 'confirmation must be durably queued');
  const link = row.text
    .split(/\s+/)
    .find((word) => word.startsWith('https://eujobs.example' + path));
  assert(link);
  return new URL(link).searchParams.get('token')!;
}
function request(body: unknown, path = '/api/alerts', cookie?: string) {
  return new Request('https://eujobs.example' + path, {
    method: 'POST',
    headers: {
      origin: 'https://eujobs.example',
      host: 'eujobs.example',
      'content-type': 'application/json',
      'x-forwarded-for': directories.at(-1) || 'fixture',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
function alert(email = 'subscriber@example.invalid', extra: Record<string, unknown> = {}) {
  subscribeAlert({ email, consent: true, ...extra });
  return messageToken('alert-confirm:', '/alerts/confirm');
}

test('outbox deduplicates messages and retries definite failures without retrying ambiguous acceptance', async () => {
  const db = setup(),
    message = {
      to: 'queue@example.invalid',
      subject: 'Fixture',
      text: 'Fixture only',
      idempotencyKey: 'test-one',
    };
  const first = enqueueEmail(message);
  assert(first.created);
  assert.equal(enqueueEmail(message).created, false);
  let attempts = 0;
  const send = async () => {
    attempts++;
    if (attempts === 1) throw new EmailDeliveryError(true, 'Email provider returned HTTP 429');
    return 'provider-fixture';
  };
  const now = Date.now() + 100;
  const failed = await processEmailOutbox({ now, deliver: send });
  assert.equal(failed.failed, 1);
  assert.equal(attempts, 1);
  await processEmailOutbox({ now: now + 59_000, deliver: send });
  assert.equal(attempts, 1, 'backoff must hold');
  const success = await processEmailOutbox({ now: now + 61_000, deliver: send });
  assert.equal(success.sent, 1);
  assert.equal(attempts, 2);
  await processEmailOutbox({ now: now + 62_000, deliver: send });
  assert.equal(attempts, 2, 'sent message must not repeat');
  enqueueEmail({ ...message, idempotencyKey: 'ambiguous' });
  assert.equal(
    (
      await processEmailOutbox({
        now: now + 63_000,
        deliver: async () => {
          throw new Error('connection interrupted');
        },
      })
    ).uncertain,
    1,
  );
  await processEmailOutbox({ now: now + 86400_000, deliver: send });
  assert.equal(attempts, 2, 'uncertain delivery must wait for operator reconciliation');
  assert.equal(
    (db.prepare("SELECT count(*) n FROM email_outbox WHERE status='sent'").get() as { n: number })
      .n,
    1,
  );
});

test('Resend uses the configured sender and stable idempotency key, and surfaces provider failures', async () => {
  setup();
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.EMAIL_FROM = 'EUJobs <notifications@example.invalid>';
  process.env.RESEND_API_KEY = 'fixture-resend-key';
  assert.equal(emailAvailable(), true);
  const original = globalThis.fetch,
    requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  let status = 200;
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(
      JSON.stringify(
        status === 200 ? { id: 'fixture-provider-id' } : { message: 'Fixture failure' },
      ),
      { status, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const message = {
      to: 'receiver@example.invalid',
      subject: 'Fixture',
      text: 'No external email is sent',
      idempotencyKey: 'stable-fixture-message',
    };
    assert.equal(await deliverViaResend(message), 'fixture-provider-id');
    assert.equal(await deliverViaResend(message), 'fixture-provider-id');
    assert.equal(requests[0].url, 'https://api.resend.com/emails');
    assert.equal(
      requests[0].headers.get('Idempotency-Key'),
      requests[1].headers.get('Idempotency-Key'),
    );
    assert.equal(requests[0].headers.get('Authorization'), 'Bearer fixture-resend-key');
    assert.equal(requests[0].body.from, process.env.EMAIL_FROM);
    assert.deepEqual(requests[0].body.to, [message.to]);
    status = 401;
    await assert.rejects(deliverViaResend(message), { retryable: false });
    status = 429;
    await assert.rejects(deliverViaResend(message), { retryable: true });
    status = 500;
    await assert.rejects(
      deliverViaResend(message),
      (error) => !(error instanceof EmailDeliveryError),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('disabled email never attempts delivery, expired/suppressed items cancel and interrupted leases are quarantined', async () => {
  const db = setup();
  enqueueEmail({
    to: 'fixture@example.invalid',
    subject: 'One',
    text: 'Fixture',
    idempotencyKey: 'suppressed',
    suppressionKey: 'fixture-scope',
  });
  process.env.EMAIL_DELIVERY_ENABLED = '0';
  assert.equal(emailAvailable(), false);
  assert.equal((await processEmailOutbox()).disabled, true);
  assert.equal(
    (db.prepare('SELECT attempts FROM email_outbox').get() as { attempts: number }).attempts,
    0,
  );
  suppressEmails('fixture-scope');
  enqueueEmail({
    to: 'fixture@example.invalid',
    subject: 'Two',
    text: 'Fixture',
    idempotencyKey: 'expired',
    expiresAt: Date.now() - 1000,
  });
  let sends = 0;
  assert.equal(
    (
      await processEmailOutbox({
        deliver: async () => {
          sends++;
          return 'fixture';
        },
      })
    ).cancelled,
    1,
  );
  assert.equal(sends, 0);
  enqueueEmail({
    to: 'fixture@example.invalid',
    subject: 'Three',
    text: 'Fixture',
    idempotencyKey: 'interrupted',
  });
  db.prepare(
    "UPDATE email_outbox SET status='processing',leaseUntil=? WHERE idempotencyKey='interrupted'",
  ).run(Date.now() - 1000);
  assert.equal(
    (
      await processEmailOutbox({
        deliver: async () => {
          sends++;
          return 'fixture';
        },
      })
    ).uncertain,
    1,
  );
  assert.equal(sends, 0);
});

test('recovery uses expiring one-use hashed tokens and revokes every session', async () => {
  const db = setup(),
    passwordHash = await hashPassword('fixture-old-password-123');
  const user = createUser({
    name: 'Recovery Fixture',
    email: 'recover@example.invalid',
    passwordHash,
  });
  const first = createUserSession(user.id),
    second = createUserSession(user.id);
  requestAccountEmail(user.email, 'reset');
  const token = messageToken('account-reset:', '/auth/recovery');
  assert.equal(
    (db.prepare('SELECT tokenHash FROM account_tokens').get() as { tokenHash: string }).tokenHash,
    tokenHash(token),
  );
  await assert.rejects(resetPassword(token.slice(0, -1) + '!', 'fixture-new-password-123'));
  assert(getSession(hashSessionToken(first)));
  await resetPassword(token, 'fixture-new-password-123');
  assert.equal(getSession(hashSessionToken(first)), null);
  assert.equal(getSession(hashSessionToken(second)), null);
  assert(
    await verifyPassword('fixture-new-password-123', findUserByEmail(user.email)!.passwordHash),
  );
  await assert.rejects(resetPassword(token, 'fixture-other-password-123'), { status: 400 });
  requestAccountEmail(user.email, 'reset');
  const expired = messageToken('account-reset:', '/auth/recovery');
  db.prepare('UPDATE account_tokens SET expiresAt=? WHERE tokenHash=?').run(
    Date.now() - 1,
    tokenHash(expired),
  );
  await assert.rejects(resetPassword(expired, 'fixture-other-password-123'), { status: 400 });
  requestAccountEmail(user.email, 'verify');
  const verify = messageToken('account-verify:', '/auth/verify');
  assert.equal(isEmailVerified(user.id), false);
  verifyAccountEmail(verify);
  assert.equal(isEmailVerified(user.id), true);
  assert.throws(() => verifyAccountEmail(verify), { status: 400 });
});

test('recovery requests have the same outward response for known and unknown accounts and disabled mail is explicit', async () => {
  setup();
  const user = createUser({
    name: 'Known Fixture',
    email: 'known@example.invalid',
    passwordHash: await hashPassword('fixture-password-123'),
  });
  const known = await recoveryPost(
    request({ action: 'request-reset', email: user.email }, '/api/account-recovery'),
  );
  const unknown = await recoveryPost(
    request({ action: 'request-reset', email: 'unknown@example.invalid' }, '/api/account-recovery'),
  );
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  process.env.EMAIL_DELIVERY_ENABLED = '0';
  assert.equal(
    (
      await recoveryPost(
        request({ action: 'request-reset', email: user.email }, '/api/account-recovery'),
      )
    ).status,
    503,
  );
  const foreign = new Request('https://eujobs.example/api/account-recovery', {
    method: 'POST',
    headers: { origin: 'https://other.example', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'request-reset', email: user.email }),
  });
  assert.equal((await recoveryPost(foreign)).status, 403);
});

test('alerts require consent and POST confirmation; a GET cannot activate or unsubscribe', async () => {
  const db = setup();
  const rejected = await alertsPost(
    request({ action: 'subscribe', email: 'consent@example.invalid' }),
  );
  assert.equal(rejected.status, 400);
  const token = alert();
  const firstRow = db.prepare('SELECT * FROM job_alerts').get()!;
  subscribeAlert({ email: 'subscriber@example.invalid', consent: true });
  assert.equal(
    (db.prepare('SELECT COUNT(*) n FROM email_outbox').get() as { n: number }).n,
    1,
    'repeated requests deduplicate confirmations',
  );
  assert.equal(
    (await alertsGet(new Request('https://eujobs.example/api/alerts?token=' + token))).status,
    200,
  );
  assert.equal(db.prepare('SELECT status FROM job_alerts').get()!.status, 'pending');
  assert.equal(
    (await alertsPost(request({ action: 'confirm', token: 'a'.repeat(43) }))).status,
    400,
  );
  assert.equal((await alertsPost(request({ action: 'confirm', token }))).status, 200);
  assert.equal(db.prepare('SELECT status FROM job_alerts').get()!.status, 'active');
  assert.equal((await alertsPost(request({ action: 'confirm', token }))).status, 400);
  const unsubscribe = messageToken('alert-confirm:', '/alerts/unsubscribe');
  await alertsGet(new Request('https://eujobs.example/api/alerts?token=' + unsubscribe));
  assert.equal(db.prepare('SELECT status FROM job_alerts').get()!.status, 'active');
  assert.equal(
    (await alertsPost(request({ action: 'unsubscribe', token: unsubscribe }))).status,
    200,
  );
  assert.equal(db.prepare('SELECT status FROM job_alerts').get()!.status, 'unsubscribed');
  assert.equal(alertEmailEligible(`alert:${firstRow.id}:${firstRow.revision}`), false);
  assert.equal(
    (db.prepare('SELECT status FROM email_outbox').get() as { status: string }).status,
    'cancelled',
  );
  unsubscribeAlert(unsubscribe); // An already-stopped subscription stays stopped.
});

test('expired confirmations fail, old unsubscribe links cannot stop a newly confirmed subscription, owners are isolated', async () => {
  const db = setup();
  const token = alert();
  db.prepare('UPDATE job_alerts SET confirmationExpiresAt=?').run(Date.now() - 1);
  assert.throws(() => confirmAlert(token), { status: 400 });
  const oldUnsubscribe = messageToken('alert-confirm:', '/alerts/unsubscribe');
  unsubscribeAlert(oldUnsubscribe);
  const newToken = alert();
  confirmAlert(newToken);
  assert.throws(() => unsubscribeAlert(oldUnsubscribe), { status: 400 });
  const item = listAccountAlerts('subscriber@example.invalid')[0];
  assert.equal(item.status, 'active');
  assert.throws(() => unsubscribeAccountAlert(item.id, 'other@example.invalid'), { status: 404 });
  unsubscribeAccountAlert(item.id, 'subscriber@example.invalid');
  assert.equal(listAccountAlerts('subscriber@example.invalid')[0].status, 'unsubscribed');
});

test('matcher queues only newly published nonexpired matching jobs, deduplicates runs, and suppresses withdrawn jobs', async () => {
  const db = setup(),
    owner = createUser({
      name: 'Listing Fixture',
      email: 'listing@example.invalid',
      passwordHash: await hashPassword('fixture-password-123'),
    });
  const start = Date.now();
  const token = alert('matching@example.invalid', {
    q: 'policy',
    topic: 'EU policy',
    location: 'Brussels',
    workMode: 'Hybrid',
  });
  confirmAlert(token, start);
  db.prepare("UPDATE email_outbox SET status='sent'").run();
  const fixture = {
    kind: 'job',
    title: 'Policy Officer',
    organization: 'Example Organisation',
    location: 'Brussels',
    country: 'Belgium',
    topic: 'EU policy',
    summary: 'Help prepare public policy research and briefings.',
    description:
      'Help prepare public policy research and briefings for European institutions and coordinate a team of researchers on shared deliverables.',
    employmentType: 'Permanent',
    seniority: 'Mid-level',
    workMode: 'Hybrid',
    url: 'https://example.invalid/apply',
  };
  const matching = createListing(owner.id, fixture),
    survivor = createListing(owner.id, { ...fixture, title: 'Still open Policy Officer' }),
    expired = createListing(owner.id, { ...fixture, title: 'Expired Policy Officer' }),
    hidden = createListing(owner.id, { ...fixture, title: 'Hidden Policy Officer' }),
    different = createListing(owner.id, {
      ...fixture,
      title: 'Policy Officer elsewhere',
      location: 'Berlin',
    }),
    sample = createListing(owner.id, { ...fixture, title: 'Sample Policy Officer' }),
    old = createListing(owner.id, { ...fixture, title: 'Previously published Policy Officer' }),
    expiredPlan = createListing(owner.id, { ...fixture, title: 'Expired package Policy Officer' });
  for (const row of [matching, survivor, expired, different, sample, old, expiredPlan])
    db.prepare("UPDATE listings SET status='published',publishedAt=? WHERE id=?").run(
      new Date(start + 100).toISOString(),
      row.id,
    );
  db.prepare('UPDATE listings SET entitlementExpiresAt=? WHERE id=?').run(
    new Date(start + 500).toISOString(),
    expiredPlan.id,
  );
  db.prepare('UPDATE listings SET deadline=? WHERE id=?').run(
    new Date(start + 500).toISOString(),
    expired.id,
  );
  db.prepare('UPDATE listings SET isSample=1,url=NULL WHERE id=?').run(sample.id);
  db.prepare('UPDATE listings SET publishedAt=? WHERE id=?').run(
    new Date(start - 10_000).toISOString(),
    old.id,
  );
  assert.equal(hidden.status, 'draft');
  const dry = queueJobAlerts({ now: start + 1000, dryRun: true });
  assert.equal(dry.matches, 2);
  assert.equal(dry.queued, 0);
  const queued = queueJobAlerts({ now: start + 1000, dryRun: false });
  assert.equal(queued.matches, 2);
  assert.equal(queued.queued, 1);
  db.prepare('UPDATE job_alerts SET nextRunAt=0').run();
  assert.equal(queueJobAlerts({ now: start + 2000, dryRun: false }).queued, 0);
  db.prepare("UPDATE listings SET status='closed' WHERE id=?").run(matching.id);
  let sends = 0;
  const delivered = await processEmailOutbox({
    now: start + 3000,
    deliver: async () => {
      sends++;
      return 'fixture';
    },
    eligible: alertEmailEligible,
  });
  assert.equal(delivered.cancelled, 1);
  assert.equal(sends, 0, 'withdrawn listing must not reach an alert recipient');
  const replacement = queueJobAlerts({ now: start + 4000, dryRun: false });
  assert.equal(
    replacement.matches,
    1,
    'remaining valid job must be eligible after batch cancellation',
  );
  assert.equal(replacement.queued, 1);
  const deliveredReplacement = await processEmailOutbox({
    now: start + 5000,
    deliver: async (message) => {
      sends++;
      assert(message.text.includes(survivor.title));
      assert(!message.text.includes(`/jobs/${matching.slug}\n`));
      return 'fixture-replacement';
    },
    eligible: alertEmailEligible,
  });
  assert.equal(deliveredReplacement.sent, 1);
  db.prepare('UPDATE job_alerts SET nextRunAt=0').run();
  assert.equal(
    queueJobAlerts({ now: start + 6000, dryRun: false }).matches,
    0,
    'accepted replacement stays deduplicated',
  );
});

test('newsletter is an explicit weekly subscription and account alert API never exposes another email list', async () => {
  setup();
  const response = await newsletterPost(
    request({ email: 'newsletter@example.invalid', consent: true }, '/api/newsletter/signup'),
  );
  assert.equal(response.status, 202);
  const row = getDb().prepare('SELECT kind,frequency,status FROM job_alerts').get()!;
  assert.equal(row.kind, 'newsletter');
  assert.equal(row.frequency, 'weekly');
  assert.equal(row.status, 'pending');
  const anonymous = await (
    await alertsGet(new Request('https://eujobs.example/api/alerts'))
  ).json();
  assert.deepEqual(anonymous.alerts, []);
  const user = createUser({
    name: 'Other Account',
    email: 'other@example.invalid',
    passwordHash: await hashPassword('fixture-password-123'),
  });
  const cookie = `${SESSION_COOKIE}=${createUserSession(user.id)}`;
  const other = await (
    await alertsGet(new Request('https://eujobs.example/api/alerts', { headers: { cookie } }))
  ).json();
  assert.deepEqual(other.alerts, []);
});

test('registering an email address without verifying it grants no access to its subscriptions', async () => {
  setup();
  confirmAlert(alert('protected@example.invalid'));
  const user = createUser({
    name: 'Unverified Fixture',
    email: 'protected@example.invalid',
    passwordHash: await hashPassword('fixture-password-123'),
  });
  const cookie = `${SESSION_COOKIE}=${createUserSession(user.id)}`;
  const get = () =>
    alertsGet(new Request('https://eujobs.example/api/alerts', { headers: { cookie } }));
  assert.deepEqual((await (await get()).json()).alerts, []);
  const id = listAccountAlerts(user.email)[0].id;
  assert.equal(
    (await alertsPost(request({ action: 'cancel', id }, '/api/alerts', cookie))).status,
    403,
  );
  requestAccountEmail(user.email, 'verify');
  verifyAccountEmail(messageToken('account-verify:', '/auth/verify'));
  assert.equal((await (await get()).json()).alerts.length, 1);
  assert.equal(
    (await alertsPost(request({ action: 'cancel', id }, '/api/alerts', cookie))).status,
    200,
  );
});
