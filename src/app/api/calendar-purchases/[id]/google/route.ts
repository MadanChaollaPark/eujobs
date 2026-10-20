import { requireCalendarPurchase } from '@/lib/calendar-billing';
import { getGoogleCalendarStatus } from '@/lib/google-calendar';
import { errorResponse, json, idSchema } from '../../../_shared';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    requireCalendarPurchase(request, id);
    return json(getGoogleCalendarStatus(id));
  } catch (error) {
    return errorResponse(error);
  }
}
