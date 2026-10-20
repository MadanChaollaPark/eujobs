import { z } from 'zod';
import {
  alertSchema,
  confirmAlert,
  listAccountAlerts,
  subscribeAlert,
  unsubscribeAccountAlert,
  unsubscribeAlert,
} from '@/lib/alerts';
import { emailAvailable } from '@/lib/email';
import { getRequestUser } from '@/lib/auth';
import {
  ApiError,
  clientKey,
  errorResponse,
  idSchema,
  json,
  protectMutation,
  rateLimit,
  readJson,
  requireUser,
} from '../_shared';
import { isEmailVerified, tokenSchema } from '@/lib/account-tokens';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = getRequestUser(request);
    return json({
      available: emailAvailable(),
      alerts: user && isEmailVerified(user.id) ? listAccountAlerts(user.email) : [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    rateLimit(`alerts:client:${clientKey(request)}`, 30, 3600_000);
    const body = await readJson(request, 4096);
    if (body.action === 'confirm') {
      confirmAlert(tokenSchema.parse(body.token));
      return json({
        message: 'Your subscription is confirmed. New matches will arrive on your chosen schedule.',
      });
    }
    if (body.action === 'unsubscribe') {
      unsubscribeAlert(tokenSchema.parse(body.token));
      return json({
        message:
          'You have been unsubscribed. No further updates will be queued for this subscription.',
      });
    }
    if (body.action === 'cancel') {
      const user = requireUser(request);
      if (!isEmailVerified(user.id))
        throw new ApiError('Verify your account email before managing subscriptions.', 403);
      unsubscribeAccountAlert(idSchema.parse(body.id), user.email);
      return json({ message: 'Subscription cancelled.' });
    }
    if (body.action !== 'subscribe') throw new ApiError('Choose a valid subscription action.', 400);
    const { action: _, ...input } = body;
    const parsed = alertSchema.parse(input);
    rateLimit(`alerts:email:${parsed.email}`, 5, 3600_000);
    if (!emailAvailable())
      return json(
        { error: 'Email alerts are temporarily unavailable. Please try again later.' },
        503,
      );
    subscribeAlert(parsed);
    return json(
      {
        message:
          'If confirmation is needed, an email is queued. Open its link and choose Confirm. Existing active subscriptions continue unchanged.',
      },
      202,
    );
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error);
    return errorResponse(error);
  }
}
