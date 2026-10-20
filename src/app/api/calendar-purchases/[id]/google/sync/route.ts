import { requireCalendarPurchase } from '@/lib/calendar-billing';
import { syncGoogleCalendar } from '@/lib/google-calendar';
import {
  clientKey,
  errorResponse,
  json,
  protectMutation,
  rateLimit,
  idSchema,
} from '../../../../_shared';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    protectMutation(request);
    rateLimit(`calendar-google-sync:${clientKey(request)}`, 12, 60000);
    const id = idSchema.parse((await context.params).id),
      { token } = requireCalendarPurchase(request, id);
    return json(await syncGoogleCalendar(id, token));
  } catch (error) {
    return errorResponse(error);
  }
}
