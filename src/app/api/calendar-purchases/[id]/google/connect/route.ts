import { requireCalendarPurchase } from '@/lib/calendar-billing';
import {
  beginGoogleCalendarConnection,
  GOOGLE_STATE_COOKIE,
  googleStateCookieOptions,
} from '@/lib/google-calendar';
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
    rateLimit(`calendar-google-connect:${clientKey(request)}`, 12, 60000);
    const id = idSchema.parse((await context.params).id),
      { token } = requireCalendarPurchase(request, id);
    const result = await beginGoogleCalendarConnection(id, token);
    const response = json({ url: result.url });
    response.cookies.set(GOOGLE_STATE_COOKIE, result.browserToken, googleStateCookieOptions());
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
