import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  allPublicListings,
  findResourceBySlug,
  lobbyingSourceInfo,
  resourceList,
} from '@/lib/resources';
import { JobCard } from '@/components/ListingCard';
import { JOB_PLANS, formatJobPrice } from '@/lib/plans';
import type { Listing } from '@/lib/types';
const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(asbl|aisbl|ivzw|vzw|sa|srl|sprl|gmbh|ev|e v|ltd|limited|the)\b/g, '')
    .trim();
const hostOf = (u?: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};
function jobsFor(name: string, website?: string): Listing[] {
  const n = normName(name),
    h = hostOf(website);
  return allPublicListings('job').filter(
    (j) => normName(j.organization) === n || (!!h && hostOf(j.url) === h),
  );
}
import {
  EmptyResources,
  ResourceCards,
  ResourceDetail,
  ResourcePage,
  ResourcePager,
} from '@/components/ResourceUI';
import { EventCard } from '@/components/ListingCard';
import { pageMetadata } from '@/lib/page-metadata';
type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
};
export async function generateMetadata({ params }: Props) {
  const { path = [] } = await params;
  if (path.length > 1) notFound();
  if (!path.length)
    return pageMetadata(
      'Lobbying organizations',
      'Browse recorded profiles of organizations and their declared interests in European affairs.',
      '/lobbying-entities',
    );
  if (path[0] === 'interests')
    return pageMetadata(
      'Policy interests',
      'Explore policy interests recorded in the EUJobs directory of European affairs organizations.',
      '/lobbying-entities/interests',
    );
  const organization = findResourceBySlug(resourceList('lobbyingEntities'), path[0]);
  if (!organization) notFound();
  const city = organization.fields.City ? ` (${organization.fields.City})` : '';
  return pageMetadata(
    `${organization.name}${city}: EU lobbying profile and jobs`,
    organization.summary ||
      `EU Transparency Register profile, policy interests and current jobs at ${organization.name}.`,
    `/lobbying-entities/${encodeURIComponent(organization.slug)}`,
    { noIndex: organization.flags?.indexable === false },
  );
}
export default async function LobbyingEntities({ params, searchParams }: Props) {
  const { path = [] } = await params,
    query = await searchParams,
    everything = resourceList('lobbyingEntities'),
    all = everything.filter((r) => r.flags?.inRegister !== false);
  if (path.length > 1) notFound();
  const interests = new Map<string, number>();
  for (const record of all)
    for (const tag of record.tags) interests.set(tag, (interests.get(tag) || 0) + 1);
  if (path[0] === 'interests')
    return (
      <ResourcePage
        title="The interests shaping European affairs."
        eyebrow="POLICY INTERESTS"
        intro="Explore the areas of interest recorded in our organization directory."
      >
        <p>
          <Link className="text-link" href="/lobbying-entities">
            ← All lobbying organizations
          </Link>
        </p>
        {interests.size ? (
          <div className="resource-grid">
            {[...interests]
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <article className="resource-card" key={name}>
                  <h2>
                    <Link href={`/lobbying-entities?interest=${encodeURIComponent(name)}`}>
                      {name}
                    </Link>
                  </h2>
                  <p>{count} organizations</p>
                </article>
              ))}
          </div>
        ) : (
          <EmptyResources />
        )}
      </ResourcePage>
    );
  if (path[0]) {
    const item = findResourceBySlug(everything, path[0]);
    if (!item) notFound();
    const guides = resourceList('careerGuides')
      .filter(
        (guide) =>
          guide.fields.Organization === item.name ||
          guide.tags.some((tag) => item.tags.includes(tag)),
      )
      .slice(0, 3);
    const events = allPublicListings('event')
      .filter((event) => event.organization === item.name)
      .slice(0, 5);
    const jobs = jobsFor(item.name, item.website);
    return (
      <>
        {item.flags?.inRegister === false && (
          <div className="container">
            <p className="notice" role="note">
              This organisation was no longer listed in the EU Transparency Register open data
              {item.flags.removedOn ? ` as of ${item.flags.removedOn}` : ''}. The details below are
              from an earlier register record.
            </p>
          </div>
        )}
        <ResourceDetail item={item} base="/lobbying-entities" label="Lobbying organizations" />
        {jobs.length > 0 && (
          <section className="container resource-related">
            <h2>Current jobs at {item.name}</h2>
            <div className="job-list">
              {jobs.slice(0, 10).map((job) => (
                <JobCard key={job.id} listing={job} />
              ))}
            </div>
          </section>
        )}
        {item.flags?.inRegister !== false && (
          <section className="container resource-related">
            <div className="flow-card">
              <p className="eyebrow">WORK AT {item.name.toUpperCase().slice(0, 60)}?</p>
              <h2 className="flow-heading">
                Hiring? Post a job from {formatJobPrice(JOB_PLANS.basic.amount)}.
              </h2>
              <p>
                Reach EU-affairs professionals in Brussels. One-time payment, no account needed,
                reviewed by a person within one business day.
              </p>
              <Link className="button" href="/submit?kind=job&plan=basic">
                Post a job →
              </Link>{' '}
              <Link className="text-link" href="/employers">
                Why EUJobs
              </Link>
            </div>
          </section>
        )}
        {guides.length > 0 && (
          <section className="container resource-related">
            <h2>Related career guides</h2>
            <ResourceCards items={guides} base="/career-guides" />
          </section>
        )}
        {events.length > 0 && (
          <section className="container resource-related">
            <h2>Upcoming events</h2>
            {events.map((event) => (
              <EventCard key={event.id} listing={event} />
            ))}
          </section>
        )}
      </>
    );
  }
  const q = query.q?.trim() || '',
    interest = query.interest || '',
    items = all.filter(
      (item) =>
        (!q ||
          `${item.name} ${item.summary} ${item.fields.Acronym || ''}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!interest || item.tags.includes(interest)),
    );
  const pages = Math.ceil(items.length / 24),
    page = Math.min(Math.max(1, Number(query.page) || 1), Math.max(1, pages));
  return (
    <ResourcePage
      title="Understand the European policy community."
      eyebrow="LOBBYING ORGANIZATIONS"
      intro="Browse source-recorded organizations and their declared interests in European affairs."
    >
      <form className="resource-filter" role="search">
        <label>
          Organization name
          <input name="q" defaultValue={q} />
        </label>
        <label>
          Policy interest
          <select name="interest" defaultValue={interest}>
            <option value="">All interests</option>
            {[...interests.keys()].sort().map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
        </label>
        <button className="button">Filter</button>
      </form>
      <p>
        {items.length.toLocaleString()} organizations ·{' '}
        <Link className="text-link" href="/lobbying-entities/interests">
          Browse all interests →
        </Link>
      </p>
      {items.length ? (
        <>
          <ResourceCards
            items={items.slice((page - 1) * 24, page * 24)}
            base="/lobbying-entities"
          />
          <ResourcePager
            page={page}
            pages={pages}
            base="/lobbying-entities"
            query={{ q, interest }}
          />
        </>
      ) : (
        <EmptyResources
          title={
            all.length
              ? 'No organizations match these filters.'
              : 'The organization directory is awaiting source records.'
          }
        />
      )}
      <p className="resource-note">
        Profiles come from the EU Transparency Register open data
        {lobbyingSourceInfo().exportDate
          ? ` (export of ${String(lobbyingSourceInfo().exportDate).slice(0, 10)})`
          : ''}
        . Use the source link on each profile to confirm current registration details.
      </p>
    </ResourcePage>
  );
}
