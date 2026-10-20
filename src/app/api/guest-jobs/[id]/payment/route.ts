import { z } from 'zod';
import { listPayments, reconcileCheckout } from '@/lib/billing';
import { requireGuest } from '@/lib/guest-posting';
import { StoreError } from '@/lib/store';
import {
  clientKey,
  errorResponse,
  idSchema,
  json,
  protectMutation,
  rateLimit,
  readJson,
} from '../../../_shared';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    protectMutation(request);
    rateLimit(`guest-payment:${clientKey(request)}`, 30, 60000);
    const id = idSchema.parse((await context.params).id);
    const { guest } = requireGuest(request, id);
    const body = z
      .object({
        sessionId: z
          .string()
          .regex(/^cs_[A-Za-z0-9_]+$/)
          .max(255),
      })
      .strict()
      .parse(await readJson(request));
    if (
      !listPayments(guest.ownerId).some(
        (order) => order.listingId === id && order.sessionId === body.sessionId,
      )
    )
      throw new StoreError('Checkout not found for this job.', 404);
    return json(await reconcileCheckout(guest.ownerId, body.sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
