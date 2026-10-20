import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allPublicListings, siteOrigin } from '@/lib/resources';
import { isBrussels } from '@/lib/landing-pages';
import { SEO_LANDINGS, getSeoLanding } from '@/lib/seo-landings';
import { ResourcePage, EmptyResources } from '@/components/ResourceUI';
import { JobCard } from '@/components/ListingCard';
import { pageMetadata } from '@/lib/page-metadata';

export function seoLandingMetadata(slug: string) {
  const page = getSeoLanding(slug);
  if (!page) notFound();
  return pageMetadata(page.title, page.description, `/${slug}`);
}

export default function SeoLandingPage({ slug }: { slug: string }) {
  const page = getSeoLanding(slug);
  if (!page) notFound();
  const jobs = allPublicListings('job').filter((j) => isBrussels(j) && page.match(j));
  const base = siteOrigin();
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.title,
    description: page.description,
    url: `${base}/${slug}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: jobs.length,
      itemListElement: jobs.slice(0, 50).map((j, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${base}/jobs/${j.slug}`,
        name: j.title,
      })),
    },
  };
  return (
    <ResourcePage title={page.h1} eyebrow="JOBS IN BRUSSELS">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }}
      />
      <section
        className="resource-prose"
        data-topic-page=""
        data-track-context="copy"
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
      <h2 style={{ marginTop: 24 }}>Live vacancies</h2>
      <p className="muted">
        {jobs.length} open {jobs.length === 1 ? 'role' : 'roles'} right now.{' '}
        <Link className="text-link" href="/jobs?location=Brussels">
          Browse all Brussels jobs →
        </Link>
      </p>
      {jobs.length ? (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} listing={job} />
          ))}
        </div>
      ) : (
        <EmptyResources title="No matching roles are published right now.">
          New roles are added every week. Create a job alert so you hear about the next one.
        </EmptyResources>
      )}
      <nav className="resource-prose" aria-label="More EU affairs job pages">
        <h2>More EU affairs job pages</h2>
        <ul>
          {SEO_LANDINGS.filter((p) => p.slug !== slug).map((p) => (
            <li key={p.slug}>
              <Link href={`/${p.slug}`}>{p.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </ResourcePage>
  );
}
