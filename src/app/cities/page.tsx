import Link from 'next/link';
import { allPublicListings, siteOrigin } from '@/lib/resources';
import { citiesInIndexOrder, cityJobs } from '@/lib/city-pages';
import { ResourcePage } from '@/components/ResourceUI';
import { pageMetadata } from '@/lib/page-metadata';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () =>
  pageMetadata(
    'Policy & Public Affairs Jobs by City',
    'Browse EU affairs, policy and international jobs by city — Brussels, Geneva, Luxembourg, The Hague, Paris, Berlin, London and more on EUJobs.',
    '/cities',
  );
export default function CitiesIndex() {
  const jobs = allPublicListings('job');
  const base = siteOrigin();
  const rows = citiesInIndexOrder().map((c) => ({ ...c, count: cityJobs(c, jobs).length }));
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Jobs by city',
    url: `${base}/cities`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${base}/${r.slug}`,
        name: `Jobs in ${r.name}`,
      })),
    },
  };
  return (
    <ResourcePage
      title="Policy and public affairs jobs by city"
      eyebrow="EUROPEAN CITIES"
      intro="Brussels is the centre of EU affairs, but policy, advocacy and international careers are spread across Europe: EU agencies, international organisations, NGOs, associations and consultancies in many capitals. Pick a city to see live vacancies, local context and the Transparency Register organisations based there."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }}
      />
      <section className="resource-prose">
        <ul>
          {rows.map((r) => (
            <li key={r.slug}>
              <Link href={`/${r.slug}`}>{r.name}</Link> — {r.country}
              {r.count ? ` · ${r.count} open ${r.count === 1 ? 'role' : 'roles'}` : ''}
            </li>
          ))}
        </ul>
        <p>
          Hiring? <Link href="/submit?kind=job&plan=basic">Post a job</Link> in any of these cities.
        </p>
      </section>
    </ResourcePage>
  );
}
