import { pageMetadata } from '@/lib/page-metadata';
import SearchResults from '@/components/SearchResults';
import { parseSearchParams } from '@/lib/search-params';
import { searchListings } from '@/lib/store';
export const metadata = pageMetadata(
  'Find a job',
  'Discover jobs in European affairs. Search by policy area, location, work arrangement and experience.',
  '/jobs',
);
export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseSearchParams(params, 'job');
  return (
    <SearchResults kind="job" filters={filters} result={searchListings(filters)} params={params} />
  );
}
