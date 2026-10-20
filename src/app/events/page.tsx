import { pageMetadata } from '@/lib/page-metadata';
import SearchResults from '@/components/SearchResults';
import { parseSearchParams } from '@/lib/search-params';
import { searchListings } from '@/lib/store';
export const metadata = pageMetadata(
  'Events & community',
  'Discover upcoming European policy conferences, discussions and networking events. Explore dates, venues and organizer registration details.',
  '/events',
);
export default async function Events({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseSearchParams(params, 'event');
  return (
    <SearchResults
      kind="event"
      filters={filters}
      result={searchListings(filters)}
      params={params}
    />
  );
}
