import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { createSession, deleteSession, getSession, isGuestOwner, StoreError } from './store';
import type { User } from './types';

export const SESSION_COOKIE = 'eujobs_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const COST = 16384;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128)
    throw new Error('Use a password between 12 and 128 characters.');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${COST}$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (password.length > 128) return false;
  const [algorithm, cost, r, p, saltText, keyText, extra] = hash.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== String(COST) ||
    r !== '8' ||
    p !== '1' ||
    extra !== undefined ||
    !saltText ||
    !keyText
  )
    return false;
  const salt = Buffer.from(saltText, 'base64url');
  const key = Buffer.from(keyText, 'base64url');
  if (salt.length !== 16 || key.length !== KEY_LENGTH) return false;
  return timingSafeEqual(await derive(password, salt), key);
}

// Gives unknown-email logins the same password-derivation work. This is not a user credential.
export const DUMMY_PASSWORD_HASH = `scrypt$${COST}$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(KEY_LENGTH).toString('base64url')}`;
export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function createUserSession(userId: string): string {
  if (isGuestOwner(userId)) throw new StoreError('Sign in to continue.', 401);
  const token = randomBytes(32).toString('base64url');
  createSession(
    hashSessionToken(token),
    userId,
    new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  );
  return token;
}
export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get('cookie') || '';
  const entry = cookie.split(';').find((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
  if (!entry) return null;
  const token = entry.trim().slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function getRequestUser(request: Request): User | null {
  const token = readSessionToken(request);
  return token ? accountSessionUser(hashSessionToken(token)) : null;
}
// A guest job capability must never become a normal account session, even if
// an old or incorrectly issued session row exists for its internal owner.
function accountSessionUser(tokenHash: string): User | null {
  const user = getSession(tokenHash);
  return user && !isGuestOwner(user.id) ? user : null;
}
export function revokeRequestSession(request: Request) {
  const token = readSessionToken(request);
  if (token) deleteSession(hashSessionToken(token));
}
export async function getCurrentUser(): Promise<User | null> {
  const { cookies } = await import('next/headers');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? accountSessionUser(hashSessionToken(token))
    : null;
}
