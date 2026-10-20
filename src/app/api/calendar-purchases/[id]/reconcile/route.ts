import { z } from 'zod';
import {
  calendarSessionSchema,
  reconcileCalendarPurchase,
  requireCalendarPurchase,
} from '@/lib/calendar-billing';
import {
  clientKey,
  errorResponse,
  json,
  protectMutation,
  rateLimit,
  readJson,
} from '../../../_shared';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    protectMutation(request);
    rateLimit(`calendar-reconcile:${clientKey(request)}`, 20, 60000);
    const id = (await context.params).id;
    const { token } = requireCalendarPurchase(request, id);
    const body = z
      .object({ sessionId: calendarSessionSchema.optional() })
      .strict()
      .parse(await readJson(request, 2048));
    return json(await reconcileCalendarPurchase(id, token, body.sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
