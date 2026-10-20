import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allPublicListings } from '@/lib/resources';
import { BRUSSELS_LANDING_PAGES, getBrusselsLanding, isBrussels } from '@/lib/landing-pages';
import { ResourcePage, EmptyResources } from '@/components/ResourceUI';
import { JobCard } from '@/components/ListingCard';
import { pageMetadata } from '@/lib/page-metadata';
import { JOB_PLANS, formatJobPrice } from '@/lib/plans';
import LaunchBanner from '@/components/LaunchBanner';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = await params;
  const page = getBrusselsLanding(segment);
  if (!page) notFound();
  return pageMetadata(page.title, page.description, `/jobs/brussels/${segment}`);
}
export default async function BrusselsLanding({
  params,
}: {
  params: Promise<{ segment: string }>;
}) {
  const { segment } = await params;
  const page = getBrusselsLanding(segment);
  if (!page) notFound();
  const jobs = allPublicListings('job').filter((j) => isBrussels(j) && page.match(j));
  const from = formatJobPrice(JOB_PLANS.basic.amount);
  return (
    <ResourcePage title={page.h1} eyebrow="JOBS IN BRUSSELS" intro={page.intro}>
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
      <section className="flow-card" data-topic-page="" style={{ marginTop: 24 }}>
        <p className="eyebrow">HIRING IN BRUSSELS?</p>
        <h2 className="flow-heading">Reach the EU-affairs community.</h2>
        <p>
          Publish your vacancy to policy, advocacy and public affairs professionals. One-time
          payment, no account required, reviewed by a person within one business day.
        </p>
        <LaunchBanner />
        <Link className="button" href="/submit?kind=job&plan=basic">
          Post a job from {from} →
        </Link>{' '}
        <Link className="text-link" href="/pricing">
          Compare plans
        </Link>
      </section>
      <nav className="resource-prose" aria-label="More Brussels job pages">
        <h2>More jobs in Brussels</h2>
        <ul>
          {BRUSSELS_LANDING_PAGES.filter((p) => p.slug !== segment).map((p) => (
            <li key={p.slug}>
              <Link href={`/jobs/brussels/${p.slug}`}>{p.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </ResourcePage>
  );
}
