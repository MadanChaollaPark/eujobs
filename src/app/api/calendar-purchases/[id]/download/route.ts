import { downloadCalendarPurchase, requireCalendarPurchase } from '@/lib/calendar-billing';
import { clientKey, errorResponse, rateLimit } from '../../../_shared';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimit(`calendar-download:${clientKey(request)}`, 10, 60000);
    const id = (await context.params).id;
    const { token } = requireCalendarPurchase(request, id);
    const { calendar, filename } = await downloadCalendarPurchase(id, token);
    return new Response(calendar, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
