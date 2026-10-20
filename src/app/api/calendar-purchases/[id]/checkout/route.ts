import { z } from 'zod';
import { continueCalendarCheckout, requireCalendarPurchase } from '@/lib/calendar-billing';
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
    rateLimit(`calendar-checkout:${clientKey(request)}`, 12, 60000);
    const id = (await context.params).id;
    const { token } = requireCalendarPurchase(request, id);
    z.object({})
      .strict()
      .parse(await readJson(request, 1024));
    return json(await continueCalendarCheckout(id, token));
  } catch (error) {
    return errorResponse(error);
  }
}
