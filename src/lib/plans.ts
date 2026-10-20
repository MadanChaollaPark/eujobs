import type { Listing } from './types';

export const JOB_PLANS = {
  basic: {
    name: 'Basic',
    amount: 9999,
    featured: false,
    priority: 0,
    features: [
      'One job listing',
      '30 days online after approval',
      'Private job management and draft editing',
    ],
  },
  pro: {
    name: 'Pro',
    amount: 29999,
    featured: true,
    priority: 1,
    features: [
      'Everything in Basic',
      'Featured listing badge',
      'Priority placement in default job results',
    ],
  },
  recruiter: {
    name: 'Recruiter',
    amount: 50000,
    featured: true,
    priority: 2,
    features: ['Everything in Pro', 'Top placement in default job results'],
  },
} as const;
export type JobPlan = keyof typeof JOB_PLANS;
export const JOB_DURATION_DAYS = 30;
export function isJobPlan(value: unknown): value is JobPlan {
  return typeof value === 'string' && Object.hasOwn(JOB_PLANS, value);
}
export function formatJobPrice(amount: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(
    amount / 100,
  );
}
export function hasJobEntitlement(listing: Listing, now = new Date()): boolean {
  return (
    listing.kind !== 'job' ||
    (!!listing.paymentOrderId &&
      !!listing.paidAt &&
      (!listing.entitlementExpiresAt || Date.parse(listing.entitlementExpiresAt) > now.getTime()))
  );
}

/** Editorial publication is separate from a paid employer entitlement. */
export function isEditorialListing(listing: Listing): boolean {
  return listing.publicationOrigin === 'editorial';
}
