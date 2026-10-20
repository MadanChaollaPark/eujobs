import { z } from 'zod';
import {
  isEmailVerified,
  requestAccountEmail,
  resetPassword,
  tokenSchema,
  verifyAccountEmail,
} from '@/lib/account-tokens';
import { emailAvailable } from '@/lib/email';
import { SESSION_COOKIE } from '@/lib/auth';
import {
  ApiError,
  clientKey,
  errorResponse,
  json,
  protectMutation,
  rateLimit,
  readJson,
  requireUser,
} from '../_shared';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    return json({ verified: isEmailVerified(user.id), available: emailAvailable() });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    rateLimit(`recovery:client:${clientKey(request)}`, 30, 3600_000);
    const body = await readJson(request, 4096);
    if (body.action === 'reset') {
      const password = z
        .string()
        .min(12, 'Use at least 12 characters.')
        .max(128)
        .parse(body.password);
      await resetPassword(tokenSchema.parse(body.token), password);
      const response = json({
        message: 'Your password has been reset. Sign in with your new password.',
      });
      response.cookies.set(SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
      return response;
    }
    if (body.action === 'verify') {
      verifyAccountEmail(tokenSchema.parse(body.token));
      return json({ message: 'Your email address is verified.' });
    }
    if (body.action === 'request-verification') {
      const user = requireUser(request);
      rateLimit(`verify:user:${user.id}`, 5, 3600_000);
      if (!emailAvailable())
        return json(
          { error: 'Email verification is temporarily unavailable. Please try again later.' },
          503,
        );
      requestAccountEmail(user.email, 'verify');
      return json(
        {
          message: isEmailVerified(user.id)
            ? 'Your email is already verified.'
            : 'A verification email is queued. Open its link to confirm your email address.',
        },
        202,
      );
    }
    if (body.action !== 'request-reset') throw new ApiError('Choose a valid account action.', 400);
    const email = z.string().trim().toLowerCase().max(254).pipe(z.email()).parse(body.email);
    rateLimit(`recovery:email:${email}`, 5, 3600_000);
    if (!emailAvailable())
      return json(
        { error: 'Password recovery is temporarily unavailable. Please try again later.' },
        503,
      );
    requestAccountEmail(email, 'reset');
    return json(
      {
        message:
          'If an account exists for that email address, a password reset email is queued. Its link expires in one hour.',
      },
      202,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
