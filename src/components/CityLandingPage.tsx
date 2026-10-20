import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allPublicListings, siteOrigin } from '@/lib/resources';
import {
  cityCopy,
  cityJobs,
  cityRegisterOrgs,
  getCityPage,
  relatedCityPages,
} from '@/lib/city-pages';
import CityPageView from '@/components/CityPageView';
import { ResourcePage, EmptyResources } from '@/components/ResourceUI';
import { JobCard } from '@/components/ListingCard';
import { pageMetadata } from '@/lib/page-metadata';
import { JOB_PLANS } from '@/lib/plans';
import { LAUNCH_ENDS_AT, firstFreeActive } from '@/lib/offers';

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const fromPrice = eur(JOB_PLANS.basic.amount);

export function cityLandingMetadata(slug: string) {
  const city = getCityPage(slug);
  if (!city) notFound();
  const c = cityCopy(city);
  return pageMetadata(c.title, c.description, `/${slug}`);
}

export default function CityLandingPage({ slug }: { slug: string }) {
  const city = getCityPage(slug);
  if (!city) notFound();
  const c = cityCopy(city);
  const jobs = cityJobs(city, allPublicListings('job'));
  const orgs = cityRegisterOrgs(city);
  const base = siteOrigin();
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: c.title,
    description: c.description,
    url: `${base}/${slug}`,
    about: {
      '@type': 'City',
      name: city.name,
      containedInPlace: { '@type': 'Country', name: city.country },
    },
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
  const alertHref = `/alerts?location=${encodeURIComponent(city.name)}`;
  return (
    <ResourcePage title={c.h1} eyebrow={`JOBS IN ${city.name.toUpperCase()}`}>
      <CityPageView city={slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }}
      />
      <h2 style={{ marginTop: 8 }}>Live vacancies in {city.name}</h2>
      <p className="muted">
        {jobs.length} open {jobs.length === 1 ? 'role' : 'roles'} in {city.name} right now.{' '}
        <Link className="text-link" href={`/jobs?location=${encodeURIComponent(city.name)}`}>
          Search all jobs →
        </Link>
        {' · '}
        <Link href={alertHref}>Create a job alert</Link>
      </p>
      {jobs.length ? (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} listing={job} />
          ))}
        </div>
      ) : (
        <EmptyResources title={`No ${city.name} roles are published right now.`}>
          New roles are added as employers publish them.{' '}
          <Link href={alertHref}>Create a job alert</Link> so you hear about the next one.
        </EmptyResources>
      )}
      <section
        className="resource-prose"
        data-city-page={slug}
        aria-label={`Hiring in ${city.name}`}
      >
        <h2>
          Hiring in {city.name}?{' '}
          {firstFreeActive() ? 'Post your first job free' : `Post a job from ${fromPrice}`}
        </h2>
        {c.employersHtml ? (
          <div dangerouslySetInnerHTML={{ __html: c.employersHtml }} />
        ) : (
          <p>
            Reach candidates who follow European policy, public affairs and international careers.
          </p>
        )}
        <ul>
          {firstFreeActive() && (
            <li>
              <strong>First listing free for 30 days with code FIRSTFREE</strong> — Basic plan, new
              customers, once per customer, until 30 November 2026.
            </li>
          )}
          <li>
            <strong>Basic: {eur(JOB_PLANS.basic.amount)}</strong> — one job, 30 days online after
            editorial approval.
          </li>
          <li>
            <strong>Pro (Featured): {eur(JOB_PLANS.pro.amount)}</strong> — featured badge and
            priority placement
            {Date.now() <= LAUNCH_ENDS_AT ? (
              <>
                ; <strong>€149</strong> until 31 October 2026 (code <code>LAUNCH149</code>, applied
                for you at checkout)
              </>
            ) : null}
            .
          </li>
        </ul>
        <p className="muted">One-time payment per job; no subscription.</p>
        <div className="resource-actions">
          <Link
            className="button"
            href={firstFreeActive() ? '/submit?kind=job&plan=basic' : '/submit?kind=job'}
          >
            {firstFreeActive() ? 'Post your first job free' : `Post a job from ${fromPrice}`}
          </Link>
          <Link className="text-link" href="/compare">
            Compare plans →
          </Link>
        </div>
      </section>
      {c.html && (
        <section
          className="resource-prose"
          data-track-context="copy"
          dangerouslySetInnerHTML={{ __html: c.html }}
        />
      )}
      {orgs.top.length > 0 && (
        <section className="resource-prose" data-track-context="register">
          <h2>Transparency Register organisations in {city.name}</h2>
          <p className="muted">
            {orgs.total} organisations in the EU Transparency Register list {city.name} as their
            head office city. A register entry is not a sign that an organisation is hiring.
          </p>
          <ul>
            {orgs.top.map((o) => (
              <li key={o.slug}>
                <Link href={`/lobbying-entities/${encodeURIComponent(o.slug)}`}>{o.name}</Link>
                {o.fields['Registration category'] ? ` — ${o.fields['Registration category']}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      <nav className="resource-prose" aria-label="Jobs in other cities">
        <h2>Jobs in other European cities</h2>
        <ul>
          {relatedCityPages(slug).map((p) => (
            <li key={p.slug}>
              <Link href={`/${p.slug}`}>{p.name}</Link>
            </li>
          ))}
        </ul>
        <p>
          <Link className="text-link" href="/cities">
            All city pages →
          </Link>
        </p>
      </nav>
    </ResourcePage>
  );
}
