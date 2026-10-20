import { notFound } from 'next/navigation';
import { getListing } from '@/lib/store';
import ListingDetail from '@/components/ListingDetail';
import { isLive } from '@/lib/types';
import { siteOrigin } from '@/lib/resources';
import { pageMetadata } from '@/lib/page-metadata';

function localCalendarDate(value: string, timezone: string, inclusiveEnd = false) {
  const instant = new Date(value);
  if (inclusiveEnd) instant.setTime(instant.getTime() - 1);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = getListing(slug);
  if (!listing || listing.kind !== 'event') notFound();
  return pageMetadata(listing.title, listing.summary, `/events/${listing.slug}`, {
    noIndex: listing.isSample,
  });
}
export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = getListing(slug);
  if (!listing || listing.kind !== 'event') notFound();
  const online = listing.location === 'Remote' || listing.location === 'Online';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: listing.title,
    description: listing.summary,
    startDate: listing.eventDateOnly
      ? localCalendarDate(listing.startsAt!, listing.timezone)
      : listing.startsAt,
    endDate: listing.eventDateOnly
      ? localCalendarDate(listing.endsAt!, listing.timezone, true)
      : listing.endsAt,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: online
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location: online
      ? {
          '@type': 'VirtualLocation',
          url: listing.url || `${siteOrigin()}/events/${listing.slug}`,
        }
      : {
          '@type': 'Place',
          name: listing.venue || listing.location,
          address: {
            '@type': 'PostalAddress',
            addressLocality: listing.location,
            addressCountry: listing.country,
          },
        },
    ...(listing.externalSource === 'organizer'
      ? {}
      : { organizer: { '@type': 'Organization', name: listing.organization } }),
    url: `${siteOrigin()}/events/${listing.slug}`,
  };
  return (
    <>
      {!listing.isSample && isLive(listing) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
      )}
      <ListingDetail listing={listing} />
    </>
  );
}
