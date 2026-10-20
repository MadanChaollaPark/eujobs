import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { companies } from '@/lib/resources';
import { ResourcePage, EmptyResources } from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Organizations hiring in Europe',
  'Explore organizations with current published vacancies on EUJobs and find your next employer.',
  '/companies',
);
export default function Companies() {
  const items = companies();
  return (
    <ResourcePage
      title="Meet your next organization."
      eyebrow="COMPANIES"
      intro="Explore employers with current published vacancies on EUJobs."
    >
      {items.length ? (
        <div className="resource-grid">
          {items.map((company) => (
            <article className="resource-card" key={company.id}>
              <h2>
                <Link href={`/companies/${company.slug}`}>{company.name}</Link>
              </h2>
              <p>
                {company.jobs.length} open {company.jobs.length === 1 ? 'role' : 'roles'}
              </p>
              <p>{[...new Set(company.jobs.map((job) => job.location))].join(' · ')}</p>
              <Link className="text-link" href={`/companies/${company.slug}`}>
                View organization →
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyResources title="New employers will appear here.">
          Organizations are listed when they have a published vacancy. There are no jobs published
          yet.
        </EmptyResources>
      )}
    </ResourcePage>
  );
}
