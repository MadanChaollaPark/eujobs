import { z } from 'zod';
import {
  calendarCookieName,
  calendarCookieOptions,
  calendarTokenSchema,
  getCalendarPurchase,
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
    rateLimit(`calendar-access:${clientKey(request)}`, 20, 60000);
    const id = (await context.params).id;
    const { token } = z
      .object({ token: calendarTokenSchema })
      .strict()
      .parse(await readJson(request, 2048));
    const purchase = getCalendarPurchase(id, token),
      response = json(purchase);
    response.cookies.set(calendarCookieName(id), token, calendarCookieOptions(id));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
