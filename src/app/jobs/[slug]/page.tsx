import Link from 'next/link';
import { firstFreeActive, launchOfferActive } from '@/lib/offers';
import { notFound } from 'next/navigation';
import { getListing } from '@/lib/store';
import ListingDetail from '@/components/ListingDetail';
import NewsletterSignup from '@/components/NewsletterSignup';
import { isLive } from '@/lib/types';
import { siteOrigin } from '@/lib/resources';
import { pageMetadata } from '@/lib/page-metadata';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = getListing(slug);
  if (!listing || listing.kind !== 'job') notFound();
  return pageMetadata(listing.title, listing.summary, `/jobs/${listing.slug}`, {
    noIndex: listing.isSample,
  });
}
function hiringIn(location?: string | null) {
  const city = (location || '').split(/[,;(]|\s+or\s+/)[0].trim();
  return city && city.length <= 40 && !/not specified|remote|online|announced/i.test(city)
    ? `Hiring in ${city}?`
    : 'Hiring?';
}
export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = getListing(slug);
  if (!listing || listing.kind !== 'job') notFound();
  const validThrough = [listing.deadline, listing.entitlementExpiresAt]
    .filter((d): d is string => !!d)
    .sort()[0];
  const employmentType = (
    {
      Traineeship: 'INTERN',
      Freelance: 'CONTRACTOR',
      'Fixed-term': 'TEMPORARY',
    } as Record<string, string>
  )[listing.employmentType || ''];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: listing.title,
    description: listing.description,
    datePosted: listing.publishedAt || listing.createdAt,
    hiringOrganization: { '@type': 'Organization', name: listing.organization },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: listing.location,
        addressCountry: listing.country,
      },
    },
    ...(validThrough ? { validThrough } : {}),
    ...(listing.workMode === 'Remote' ? { jobLocationType: 'TELECOMMUTE' } : {}),
    ...(listing.salaryMin !== null
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'EUR',
            value: {
              '@type': 'QuantitativeValue',
              minValue: listing.salaryMin,
              ...(listing.salaryMax !== null ? { maxValue: listing.salaryMax } : {}),
              unitText: listing.salaryPeriod === 'month' ? 'MONTH' : 'YEAR',
            },
          },
        }
      : {}),
    ...(employmentType ? { employmentType } : {}),
    directApply: false,
    url: `${siteOrigin()}/jobs/${listing.slug}`,
  };
  return (
    <>
      {!listing.isSample && isLive(listing) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
      )}
      <ListingDetail listing={listing} />
      {listing.kind === 'job' && firstFreeActive() && (
        <div className="container">
          <aside className="launch-banner" role="note" style={{ marginTop: 24 }}>
            <strong>{hiringIn(listing.location)}</strong> Your first listing on EUJobs is free
            {launchOfferActive() ? '; Pro is €149 until 31 October' : ''}.{' '}
            <Link href="/submit?kind=job&plan=basic">Post your first job free →</Link>
          </aside>
        </div>
      )}
      <div className="container">
        <NewsletterSignup source="job" />
      </div>
    </>
  );
}
