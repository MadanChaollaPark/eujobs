import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { allPublicListings, resourceList } from '@/lib/resources';
import { ResourcePage, EmptyResources } from '@/components/ResourceUI';
import { EventCard } from '@/components/ListingCard';
export const metadata = pageMetadata(
  'EU policy and lobbying events',
  'Find upcoming events from the European policy community and browse by organization or policy interest.',
  '/lobbying-events',
);
export default async function LobbyingEvents({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams,
    interest = query.interest || '',
    entity = query.entity || '',
    organizations = resourceList('lobbyingEntities');
  const matching = new Set(
    organizations
      .filter((o) => (!entity || o.slug === entity) && (!interest || o.tags.includes(interest)))
      .map((o) => o.name),
  );
  const events = allPublicListings('event').filter((e) => matching.has(e.organization));
  return (
    <ResourcePage
      title="The European policy agenda."
      eyebrow="LOBBYING EVENTS"
      intro="Upcoming events published by organizations in the European affairs directory."
    >
      <form className="resource-filter">
        <label>
          Policy interest
          <input name="interest" defaultValue={interest} />
        </label>
        <label>
          Organization slug
          <input name="entity" defaultValue={entity} placeholder="Optional" />
        </label>
        <button className="button">Filter</button>
      </form>
      {events.length ? (
        events.map((event) => <EventCard key={event.id} listing={event} />)
      ) : (
        <EmptyResources title="No matching policy events are published yet.">
          You can also explore the full events calendar.
        </EmptyResources>
      )}
      <p>
        <Link className="text-link" href="/events">
          Explore all events →
        </Link>
      </p>
    </ResourcePage>
  );
}
