import type { Listing } from './types';

export function listingSourceName(listing: Listing): string | null {
  if (listing.publicationOrigin !== 'editorial') return null;
  if (listing.externalSource === 'employer') return listing.organization;
  if (listing.externalSource === 'organizer') return listing.organization;
  return 'the original vacancy';
}
