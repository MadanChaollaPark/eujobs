import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStaticNiche } from '@/lib/niches';
import { allPublicListings } from '@/lib/resources';
import { ResourcePage, EmptyResources } from '@/components/ResourceUI';
import { JobCard } from '@/components/ListingCard';
import { pageMetadata } from '@/lib/page-metadata';
export async function generateMetadata({ params }: { params: Promise<{ niche: string }> }) {
  const { niche } = await params,
    item = getStaticNiche(niche);
  if (!item) notFound();
  return pageMetadata(
    item.name,
    item.description.replace(/[, —]+updated daily[^.]*\.?/gi, '.'),
    `/${niche}`,
  );
}
export default async function Niche({ params }: { params: Promise<{ niche: string }> }) {
  const { niche } = await params,
    item = getStaticNiche(niche);
  if (!item) notFound();
  const f = item.filters;
  const jobs = allPublicListings('job').filter((job) => {
    const location = [job.location, job.country].join(' ').toLowerCase(),
      title = job.title.toLowerCase(),
      company = job.organization.toLowerCase();
    const geographical = [...(f.cities || []), ...(f.countries || [])];
    if (
      geographical.length &&
      !geographical.some((value) => location.includes(value.toLowerCase()))
    )
      return false;
    if (niche === 'remote-europe') return job.workMode === 'Remote' || job.workMode === 'Hybrid';
    const words = f.titleKeywords || [],
      companies = f.companyPatterns || [];
    if (
      (words.length || companies.length) &&
      !words.some((word) => title.includes(word.toLowerCase())) &&
      !companies.some((word) => company.includes(word.toLowerCase()))
    )
      return false;
    return true;
  });
  return (
    <ResourcePage
      title={item.name}
      eyebrow="EUROPEAN CAREERS"
      intro={item.description.replace(/[, —]+updated daily[^.]*\.?/gi, '.')}
    >
      <p>
        <Link className="text-link" href="/jobs">
          ← Browse all jobs
        </Link>
      </p>
      {jobs.length ? (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} listing={job} />
          ))}
        </div>
      ) : (
        <EmptyResources title="No matching roles are published yet.">
          Create a job alert or explore our career advice while you plan your next move.
        </EmptyResources>
      )}
      <div className="resource-actions">
        <Link
          className="button secondary"
          href={`/alerts?${new URLSearchParams(f.cities?.[0] ? { location: f.cities[0] } : { q: f.titleKeywords?.[0] || '' })}`}
        >
          Create a job alert
        </Link>
        <Link className="text-link" href="/blog">
          Read career advice →
        </Link>
      </div>
      {item.faqs.length > 0 && (
        <section className="resource-prose">
          <h2>Planning your next step</h2>
          {item.faqs.map((faq) => (
            <div key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </div>
          ))}
          <p className="resource-note">
            General guidance from the EUJobs archive. Check the current eligibility and language
            requirements in each official recruitment notice.
          </p>
        </section>
      )}
    </ResourcePage>
  );
}
