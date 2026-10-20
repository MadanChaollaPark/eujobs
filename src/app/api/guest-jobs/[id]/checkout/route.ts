import { z } from 'zod';
import { createCheckout } from '@/lib/billing';
import { requireGuest } from '@/lib/guest-posting';
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
    rateLimit(`guest-checkout:${clientKey(request)}`, 20, 60000);
    const id = idSchema.parse((await context.params).id);
    const { guest } = requireGuest(request, id);
    const body = z
      .object({ plan: z.enum(['basic', 'pro', 'recruiter']) })
      .strict()
      .parse(await readJson(request));
    return json(await createCheckout(guest.ownerId, id, body.plan));
  } catch (error) {
    return errorResponse(error);
  }
}
