import Link from 'next/link';
import { notFound } from 'next/navigation';
import { companies, companySlug } from '@/lib/resources';
import { ResourcePage } from '@/components/ResourceUI';
import { JobCard } from '@/components/ListingCard';
import { pageMetadata } from '@/lib/page-metadata';
function findCompany(slug: string) {
  const all = companies(),
    exact = all.find((item) => item.slug === slug || item.id === slug);
  if (exact) return exact;
  const legacy = all.filter((item) => companySlug(item.name) === slug);
  return legacy.length === 1 ? legacy[0] : undefined;
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    company = findCompany(slug);
  if (!company) notFound();
  return pageMetadata(
    company.name,
    `Explore current vacancies at ${company.name} and find your next opportunity on EUJobs.`,
    `/companies/${company.slug}`,
  );
}
export default async function Company({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    company = findCompany(slug);
  if (!company) notFound();
  return (
    <ResourcePage
      title={company.name}
      eyebrow="ORGANIZATION"
      intro={`${company.jobs.length} current vacancies on EUJobs.`}
    >
      <p>
        <Link className="text-link" href="/companies">
          ← All organizations
        </Link>
      </p>
      <div className="resource-actions">
        <Link
          className="button secondary"
          href={`/alerts?organizationId=${encodeURIComponent(company.id)}`}
        >
          Create an alert
        </Link>
      </div>
      <div className="job-list">
        {company.jobs.map((job) => (
          <JobCard key={job.id} listing={job} />
        ))}
      </div>
    </ResourcePage>
  );
}
