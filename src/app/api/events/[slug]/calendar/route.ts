import { getListing } from '@/lib/store';
import { ApiError, errorResponse } from '../../../_shared';
import { eventCalendar } from './ics';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const slug = (await context.params).slug;
    if (slug.length > 200) throw new ApiError('Event not found.', 404);
    const event = getListing(slug);
    if (!event || event.kind !== 'event') throw new ApiError('Event not found.', 404);
    const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
    return new Response(eventCalendar(event, origin), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${event.slug.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || 'event'}.ics"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
