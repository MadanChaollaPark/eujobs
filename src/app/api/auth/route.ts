import { z } from 'zod';
import { createUser, findUserByEmail, isGuestOwner } from '@/lib/store';
import {
  createUserSession,
  DUMMY_PASSWORD_HASH,
  getRequestUser,
  hashPassword,
  revokeRequestSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from '@/lib/auth';
import {
  ApiError,
  clientKey,
  errorResponse,
  json,
  protectMutation,
  rateLimit,
  readJson,
} from '../_shared';

export const runtime = 'nodejs';
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});
export async function GET(request: Request) {
  try {
    return json({ user: getRequestUser(request) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const body = await readJson(request, 4096);
    if (body.action === 'logout') {
      revokeRequestSession(request);
      const response = json({ user: null });
      response.cookies.set(SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
      return response;
    }
    if (body.action !== 'register' && body.action !== 'login')
      throw new ApiError('Choose login, register, or logout.', 400);
    const { email, password } = credentials.parse(body);
    rateLimit(`auth:client:${clientKey(request)}`, 60, 15 * 60 * 1000);
    rateLimit(`auth:email:${email}`, 10, 15 * 60 * 1000);
    let user;
    if (body.action === 'register') {
      const name = z
        .string()
        .trim()
        .min(2, 'Enter a name of at least 2 characters.')
        .max(100)
        .parse(body.name);
      if (password.length < 12)
        throw new ApiError('Use a password of at least 12 characters.', 400);
      rateLimit(`register:${clientKey(request)}`, 20, 60 * 60 * 1000);
      user = createUser({ name, email, passwordHash: await hashPassword(password) });
    } else {
      const record = findUserByEmail(email);
      const account = record && !isGuestOwner(record.id) ? record : null;
      const correct = await verifyPassword(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!account || !correct) throw new ApiError('Email or password is incorrect.', 401);
      const { passwordHash: _, ...safeUser } = account;
      user = safeUser;
    }
    revokeRequestSession(request);
    const token = createUserSession(user.id);
    const response = json({ user }, body.action === 'register' ? 201 : 200);
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
