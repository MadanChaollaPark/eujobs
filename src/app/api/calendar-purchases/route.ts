import {
  calendarCookieName,
  calendarCookieOptions,
  calendarTokenSchema,
  createCalendarPurchase,
} from '@/lib/calendar-billing';
import { clientKey, errorResponse, json, protectMutation, rateLimit, readJson } from '../_shared';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    protectMutation(request);
    rateLimit(`calendar-create:${clientKey(request)}`, 12, 60000);
    const body = await readJson(request, 8192);
    const purchase = await createCalendarPurchase(body);
    const response = json(purchase);
    response.cookies.set(
      calendarCookieName(purchase.id),
      calendarTokenSchema.parse(body.requestToken),
      calendarCookieOptions(purchase.id),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
