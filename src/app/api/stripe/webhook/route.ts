import { handleStripeEvent, verifyStripeEvent } from '@/lib/billing';
import { handleCalendarStripeEvent } from '@/lib/calendar-billing';
import { StoreError } from '@/lib/store';
import { errorResponse, json } from '../../_shared';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (!request.body) throw new StoreError('A signed Stripe payload is required.');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new StoreError('Payload too large.', 413);
      }
      chunks.push(value);
    }
    const event = verifyStripeEvent(
      Buffer.concat(chunks).toString('utf8'),
      request.headers.get('stripe-signature') || '',
    );
    if (!(await handleCalendarStripeEvent(event))) await handleStripeEvent(event);
    return json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
