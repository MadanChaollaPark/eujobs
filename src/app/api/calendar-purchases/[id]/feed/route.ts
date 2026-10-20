import { getCalendarFeed } from '@/lib/calendar-billing';
import { clientKey, errorResponse, rateLimit } from '../../../_shared';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimit(`calendar-feed:${clientKey(request)}`, 60, 60000);
    const id = (await context.params).id;
    const { calendar } = await getCalendarFeed(id, new URL(request.url).searchParams.get('token'));
    return new Response(calendar, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
