import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createUser,
  createSession,
  findUserByEmail,
  getDb,
  getSession,
  isGuestOwner,
} from '../src/lib/store';
import {
  createUserSession,
  getRequestUser,
  hashPassword,
  hashSessionToken,
  SESSION_COOKIE,
  verifyPassword,
} from '../src/lib/auth';
import {
  isEmailVerified,
  requestAccountEmail,
  resetPassword,
  tokenHash,
  verifyAccountEmail,
} from '../src/lib/account-tokens';
import { emailDb } from '../src/lib/email';
import { GET as authGet, POST as authPost } from '../src/app/api/auth/route';
import { POST as recoveryPost } from '../src/app/api/account-recovery/route';

const fixtures: { directory: string; db: ReturnType<typeof getDb> }[] = [];
after(() => {
  for (const { db, directory } of fixtures) {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
const password = 'guest-auth-fixture-password';
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eujobs-guest-auth-'));
  process.env.DATA_DIR = directory;
  process.env.EUJOBS_SEED = '0';
  process.env.APP_ORIGIN = 'https://eujobs.example';
  process.env.TRUST_PROXY = '1';
  process.env.EMAIL_PROVIDER = 'brevo';
  process.env.EMAIL_DELIVERY_ENABLED = '1';
  process.env.BREVO_API_KEY = 'fixture-only-not-a-provider-key';
  process.env.BREVO_SENDER_EMAIL = 'fixture@example.invalid';
  const db = emailDb();
  fixtures.push({ directory, db });
  const passwordHash = await hashPassword(password);
  const user = createUser({
    name: 'Fixture Owner',
    email: `${randomUUID()}@example.invalid`,
    passwordHash,
  });
  return { directory, db, user, passwordHash };
}
function request(body: unknown, path = '/api/auth', cookie?: string) {
  return new Request(`https://eujobs.example${path}`, {
    method: 'POST',
    headers: {
      origin: 'https://eujobs.example',
      host: 'eujobs.example',
      'content-type': 'application/json',
      'x-forwarded-for': fixtures.at(-1)!.directory,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
function cookieRequest(token: string) {
  return new Request('https://eujobs.example/api/auth', {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}
function queuedToken(purpose: 'reset' | 'verify') {
  const row = getDb()
    .prepare(
      'SELECT text FROM email_outbox WHERE idempotencyKey LIKE ? ORDER BY rowid DESC LIMIT 1',
    )
    .get(`account-${purpose}:%`) as { text: string };
  assert(row);
  const link = row.text.split(/\s+/).find((word) => word.startsWith('https://eujobs.example/'))!;
  return new URL(link).searchParams.get('token')!;
}
function markGuestOwner(userId: string) {
  getDb().prepare("UPDATE users SET accountKind='guest' WHERE id=?").run(userId);
}

test('internal guest owners cannot log in even with a valid password and receive the unknown-account response', async () => {
  const { user, db } = await setup();
  markGuestOwner(user.id);
  assert(isGuestOwner(user.id));
  const guest = await authPost(request({ action: 'login', email: user.email, password }));
  const unknown = await authPost(
    request({ action: 'login', email: 'absent@example.invalid', password }),
  );
  assert.equal(guest.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await guest.json(), await unknown.json());
  assert.equal(guest.headers.get('set-cookie'), null);
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n), 0);
});

test('normal session creation and reads reject guest owners including previously issued sessions', async () => {
  const { user, db } = await setup();
  const oldToken = createUserSession(user.id);
  assert.equal(getRequestUser(cookieRequest(oldToken))?.id, user.id);
  markGuestOwner(user.id);
  assert.throws(() => createUserSession(user.id), { status: 401 });
  assert.throws(
    () =>
      createSession(
        hashSessionToken(randomBytes(32).toString('base64url')),
        user.id,
        new Date(Date.now() + 60000).toISOString(),
      ),
    { status: 401 },
  );
  assert.equal(getSession(hashSessionToken(oldToken)), null);
  assert.equal(getRequestUser(cookieRequest(oldToken)), null);
  assert.deepEqual(await (await authGet(cookieRequest(oldToken))).json(), { user: null });
  assert(Number(db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n) <= 1);
});

test('guest reset and verification requests create no account tokens or email and reveal no guest status', async () => {
  const { user, db } = await setup();
  markGuestOwner(user.id);
  requestAccountEmail(user.email, 'reset');
  requestAccountEmail(user.email, 'verify');
  assert.equal(isEmailVerified(user.id), false);
  const guest = await recoveryPost(
    request({ action: 'request-reset', email: user.email }, '/api/account-recovery'),
  );
  const unknown = await recoveryPost(
    request({ action: 'request-reset', email: 'absent@example.invalid' }, '/api/account-recovery'),
  );
  assert.equal(guest.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await guest.json(), await unknown.json());
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM account_tokens').get()!.n), 0);
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM email_outbox').get()!.n), 0);
});

test('previously issued reset and verification links cannot activate a guest owner', async () => {
  const { user, passwordHash } = await setup();
  requestAccountEmail(user.email, 'reset');
  requestAccountEmail(user.email, 'verify');
  const reset = queuedToken('reset'),
    verify = queuedToken('verify');
  markGuestOwner(user.id);
  const unknown = randomBytes(32).toString('base64url');
  let expectedMessage = '';
  try {
    verifyAccountEmail(unknown);
  } catch (error) {
    expectedMessage = (error as Error).message;
  }
  assert(expectedMessage);
  assert.throws(() => verifyAccountEmail(verify), { status: 400, message: expectedMessage });
  await assert.rejects(resetPassword(reset, 'replacement-password-fixture'), {
    status: 400,
    message: expectedMessage,
  });
  assert.equal(findUserByEmail(user.email)!.passwordHash, passwordHash);
  assert.equal(isEmailVerified(user.id), false);
  assert.equal(Number(getDb().prepare('SELECT COUNT(*) n FROM verified_emails').get()!.n), 0);
});

test('regular members still log in, reset passwords, verify email and use account sessions', async () => {
  const { user } = await setup();
  assert.equal(isGuestOwner(user.id), false);
  const response = await authPost(request({ action: 'login', email: user.email, password }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, user.id);
  const cookie = response.headers.get('set-cookie')!;
  assert(cookie.includes(`${SESSION_COOKIE}=`));
  const token = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1];
  assert.equal(getRequestUser(cookieRequest(token))?.id, user.id);
  requestAccountEmail(user.email, 'reset');
  const reset = queuedToken('reset');
  await resetPassword(reset, 'regular-account-new-password');
  assert.equal(getRequestUser(cookieRequest(token)), null);
  assert(
    await verifyPassword('regular-account-new-password', findUserByEmail(user.email)!.passwordHash),
  );
  requestAccountEmail(user.email, 'verify');
  verifyAccountEmail(queuedToken('verify'));
  assert.equal(isEmailVerified(user.id), true);
  assert.equal(
    getDb().prepare('SELECT usedAt FROM account_tokens WHERE tokenHash=?').get(tokenHash(reset))!
      .usedAt !== null,
    true,
  );
});
