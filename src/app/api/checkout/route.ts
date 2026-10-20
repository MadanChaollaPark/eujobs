import { z } from 'zod';
import { createCheckout } from '@/lib/billing';
import {
  errorResponse,
  json,
  protectMutation,
  rateLimit,
  readJson,
  requireUser,
  idSchema,
} from '../_shared';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const user = requireUser(request);
    rateLimit(`checkout:${user.id}`, 20, 60 * 60 * 1000);
    const body = z
      .object({ jobId: idSchema, plan: z.enum(['basic', 'pro', 'recruiter']) })
      .strict()
      .parse(await readJson(request));
    return json(await createCheckout(user.id, body.jobId, body.plan));
  } catch (error) {
    return errorResponse(error);
  }
}
