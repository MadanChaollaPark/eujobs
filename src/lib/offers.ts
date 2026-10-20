/** Launch offers. Codes are Stripe promotion codes entered at checkout; Stripe enforces the restrictions. */
/** LAUNCH149: Pro for €149, until the end of 31 October 2026 (Brussels time). */
export const LAUNCH_ENDS_AT = Date.parse('2026-10-31T23:59:00+01:00');
/** FIRSTFREE: 100% off the Basic plan, first-time customers, once per customer, until 30 November 2026. */
export const FIRSTFREE_ENDS_AT = Date.parse('2026-11-30T23:59:00+01:00');
export const launchOfferActive = (now = Date.now()) => now <= LAUNCH_ENDS_AT;
export const firstFreeActive = (now = Date.now()) => now <= FIRSTFREE_ENDS_AT;
/** Offer shown and auto-applied for a plan right now, or null when the list price applies. */
export function planOffer(
  plan: string,
  now = Date.now(),
): { code: string; amount: number; label: string; note: string } | null {
  if (plan === 'basic' && firstFreeActive(now))
    return {
      code: 'FIRSTFREE',
      amount: 0,
      label: 'Free',
      note: 'First listing free for new customers until 30 November, applied automatically at checkout.',
    };
  if (plan === 'pro' && launchOfferActive(now))
    return {
      code: 'LAUNCH149',
      amount: 14900,
      label: '€149',
      note: 'Launch price until 31 October, applied automatically at checkout.',
    };
  return null;
}
