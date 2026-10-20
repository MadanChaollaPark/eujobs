import { z } from 'zod';
import { listPayments, reconcileCheckout } from '@/lib/billing';
import { errorResponse, json, protectMutation, rateLimit, readJson, requireUser } from '../_shared';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return json({ payments: listPayments(requireUser(request).id) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = requireUser(request);
    rateLimit(`payment-status:${user.id}`, 30, 60000);
    const body = z
      .object({
        sessionId: z
          .string()
          .regex(/^cs_[A-Za-z0-9_]+$/)
          .max(255),
      })
      .strict()
      .parse(await readJson(request));
    return json(await reconcileCheckout(user.id, body.sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
