import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATEGORIES } from '@/lib/categories';
import { allPublicListings } from '@/lib/resources';
import { ResourcePage, EmptyResources } from '@/components/ResourceUI';
import { JobCard } from '@/components/ListingCard';
import { pageMetadata } from '@/lib/page-metadata';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.slug === slug);
  if (!category) notFound();
  return pageMetadata(category.name, category.description, `/categories/${slug}`);
}
export default async function Category({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    category = CATEGORIES.find((c) => c.slug === slug);
  if (!category) notFound();
  const jobs = allPublicListings('job').filter(
    (job) =>
      ((job as unknown as { categorySlug?: string }).categorySlug || 'unknown') === slug ||
      (slug === 'traineeships' && job.employmentType === 'Traineeship'),
  );
  return (
    <ResourcePage title={category.name} eyebrow="JOB CATEGORIES" intro={category.description}>
      <p>
        <Link className="text-link" href="/categories">
          ← All categories
        </Link>
        {' · '}
        <Link href="/brussels">Jobs in Brussels</Link>
      </p>
      <div className="resource-actions">
        <Link className="button secondary" href={`/alerts?categorySlug=${slug}`}>
          Create a job alert
        </Link>
      </div>
      {jobs.length ? (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} listing={job} />
          ))}
        </div>
      ) : (
        <EmptyResources title="No open roles in this category yet.">
          Create an alert to hear when matching vacancies are published.
        </EmptyResources>
      )}
    </ResourcePage>
  );
}
