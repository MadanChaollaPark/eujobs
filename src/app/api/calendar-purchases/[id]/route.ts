import { requireCalendarPurchase } from '@/lib/calendar-billing';
import { clientKey, errorResponse, json, rateLimit } from '../../_shared';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimit(`calendar-status:${clientKey(request)}`, 60, 60000);
    const { purchase } = requireCalendarPurchase(request, (await context.params).id);
    return json(purchase);
  } catch (error) {
    return errorResponse(error);
  }
}
