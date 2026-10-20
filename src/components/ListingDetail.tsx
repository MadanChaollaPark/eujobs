import Link from 'next/link';
import { ArrowLeft, MapPin, ArrowUpRight } from 'lucide-react';
import { Listing, formatSalary, isLive, listingHref } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';
import { getSavedIds } from '@/lib/store';
import DetailActions from './DetailActions';
import './flows.css';
import { CATEGORIES } from '@/lib/categories';
import { listingSourceName } from '@/lib/listing-source';
import { applicationTarget, ListingContent, safeWebHref } from './ListingContent';
import { cityForLocation } from '@/lib/city-pages';

function date(value: string | null, timezone = 'Europe/Brussels', time = false) {
  if (!value) return 'Not specified';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    ...(time ? { timeStyle: 'short' as const } : {}),
    timeZone: timezone,
  }).format(new Date(value));
}

function localDate(value: string | null, timezone: string) {
  return date(value, timezone);
}

export default async function ListingDetail({ listing }: { listing: Listing }) {
  const user = await getCurrentUser();
  const saved = user ? getSavedIds(user.id).includes(listing.id) : false;
  const job = listing.kind === 'job';
  const dateOnlyEvent = !job && listing.eventDateOnly;
  const source = listingSourceName(listing);
  const instructions = job && source ? listing.applicationInstructions?.trim() : null;
  const target = applicationTarget({
    href: listing.url,
    kind: listing.kind,
    editorial: !!source,
    method: listing.applicationMethod,
  });
  const sourceHref = safeWebHref(listing.sourceUrl);
  const employerHref = source ? safeWebHref(listing.employerSourceUrl) : null;
  const organizerProfileHref =
    !job && listing.entitySlug
      ? `/lobbying-entities/${encodeURIComponent(listing.entitySlug)}`
      : null;
  const location =
    [...new Set([listing.location, listing.country])]
      .filter((value) => value && value !== 'Not specified')
      .join(', ') || 'Not specified';
  const live = isLive(listing);
  const index = job ? '/jobs' : '/events';
  const jobCity = job ? cityForLocation(listing.location) : null;
  const facts = job
    ? [
        ['Salary', formatSalary(listing)],
        ['Location', location],
        ['Work arrangement', listing.workMode || 'Not specified'],
        ['Contract', listing.employmentType || 'Not specified'],
        ['Experience', listing.seniority || 'Not specified'],
        [
          'Application deadline (Brussels time)',
          listing.deadline
            ? date(listing.deadline, 'Europe/Brussels', true)
            : 'No deadline provided',
        ],
      ]
    : [
        ...(dateOnlyEvent
          ? [
              [
                'Date',
                listing.startsAt && listing.endsAt
                  ? (() => {
                      const first = localDate(listing.startsAt, listing.timezone);
                      const finalDay = localDate(
                        new Date(new Date(listing.endsAt).getTime() - 1).toISOString(),
                        listing.timezone,
                      );
                      return first === finalDay ? first : `${first} – ${finalDay}`;
                    })()
                  : 'Not specified',
              ],
            ]
          : [
              ['Starts', date(listing.startsAt, listing.timezone, true)],
              ['Ends', date(listing.endsAt, listing.timezone, true)],
            ]),
        ['Timezone', listing.timezone.replaceAll('_', ' ')],
        ['Venue', listing.venue || listing.location],
        [
          'Admission',
          listing.price === null
            ? 'Check registration for pricing'
            : listing.price === 0
              ? 'Free to attend'
              : `€${listing.price}`,
        ],
        ['Format', listing.eventType || 'Not specified'],
      ];
  return (
    <div className="container flow-page">
      <nav className="detail-breadcrumb" aria-label="Breadcrumb">
        {job ? (
          jobCity ? (
            <>
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <Link href={`/${jobCity.slug}`}>Jobs in {jobCity.name}</Link>
              <span aria-hidden="true">/</span>
              <span>{listing.title}</span>
            </>
          ) : (
            <>
              <Link href="/jobs">Jobs</Link>
              <span aria-hidden="true">/</span>
              <span>{listing.title}</span>
            </>
          )
        ) : (
          <>
            <Link href={index}>Discover events</Link>
            <span aria-hidden="true">/</span>
            <span>{listing.topic}</span>
          </>
        )}
      </nav>
      <div className="detail-grid">
        <article>
          <header className="detail-head">
            <div className="detail-organization">
              <div className="organization-avatar" aria-hidden="true">
                {listing.initials}
              </div>
              <div>
                <strong>
                  {listing.externalSource === 'organizer' && 'Listed by '}
                  <Link
                    href={
                      organizerProfileHref ||
                      `/companies/${encodeURIComponent(listing.organizationId)}`
                    }
                  >
                    {listing.organization}
                  </Link>
                </strong>
                <span>
                  <MapPin
                    size={12}
                    style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }}
                  />
                  {location}
                </span>
              </div>
            </div>
            <p className="eyebrow">
              {job ? 'AN OPPORTUNITY TO MAKE A DIFFERENCE' : 'A CONVERSATION WORTH JOINING'}
            </p>
            <h1 className="detail-title">{listing.title}</h1>
            <div className="detail-tags">
              <span className="pill">{listing.topic}</span>
              {(job ? listing.employmentType : listing.eventType) && (
                <span className="pill">{job ? listing.employmentType : listing.eventType}</span>
              )}
              {listing.featured && <span className="pill">Featured</span>}
              {listing.categorySlug && listing.categorySlug !== 'unknown' && (
                <Link className="pill" href={`/categories/${listing.categorySlug}`}>
                  {CATEGORIES.find((c) => c.slug === listing.categorySlug)?.name ||
                    listing.categorySlug}
                </Link>
              )}
              {listing.policyTags?.map((tag) => (
                <Link
                  className="pill"
                  key={tag}
                  href={`${index}?policyTag=${encodeURIComponent(tag)}`}
                >
                  {tag}
                </Link>
              ))}
              {listing.isSample && <span className="pill">Sample {listing.kind}</span>}
              {!live && (
                <span className="status-badge closed">{job ? 'Closed' : 'Past or closed'}</span>
              )}
            </div>
          </header>
          <p className="detail-summary">{listing.summary}</p>
          {dateOnlyEvent && <p className="notice">Check the organiser for session times.</p>}
          {source && (job || listing.kind === 'event') ? (
            <ListingContent text={listing.description} />
          ) : (
            <>
              <h2 className="detail-section-title">
                {job ? 'About the opportunity' : 'What to expect'}
              </h2>
              <div className="detail-description">{listing.description}</div>
            </>
          )}
          <section
            id={job ? 'how-to-apply' : undefined}
            className="detail-application"
            aria-labelledby="application-heading"
          >
            <h2 className="detail-section-title" id="application-heading">
              {job ? 'How to apply' : 'Be part of it'}
            </h2>
            {instructions ? (
              <ListingContent text={instructions} />
            ) : (
              <p className="detail-description">
                {listing.isSample
                  ? 'This demonstration listing does not accept applications or registrations.'
                  : !job
                    ? 'Visit the organiser’s event page for availability, accessibility details and the latest programme. You can also add the event to your calendar.'
                    : source
                      ? target?.email
                        ? 'Send your application to the employer using the email application button.'
                        : target
                          ? listing.applicationMethod === 'instructions'
                            ? 'The employer’s application document contains the submission instructions.'
                            : 'Apply directly through the employer’s application page.'
                          : 'Application instructions are not available for this vacancy yet.'
                      : 'Use the application button to send your application through the employer’s own page.'}
              </p>
            )}
          </section>
          {job && listing.blockAIApplications && (
            <p className="notice">
              This employer requests personally written applications. Please express your own
              experience and motivation.
            </p>
          )}
          <footer className="detail-source detail-provenance">
            {listing.isSample ? (
              'Illustrative content. Organisation and listing details are fictional.'
            ) : (
              <>
                {source ? 'Added to EUJobs' : 'Published'}{' '}
                {date(listing.publishedAt || listing.createdAt)}.
                {employerHref && (
                  <>
                    {' '}
                    <a href={employerHref} target="_blank" rel="noopener noreferrer">
                      {job ? 'Employer notice' : 'Organizer notice'}{' '}
                      <ArrowUpRight size={11} style={{ display: 'inline' }} />
                    </a>
                    .
                  </>
                )}
                {sourceHref && (
                  <>
                    {' '}
                    {source ? 'Source: ' : ''}
                    <a href={sourceHref} target="_blank" rel="noopener noreferrer">
                      {source || 'Source'} <ArrowUpRight size={11} style={{ display: 'inline' }} />
                    </a>
                    .
                  </>
                )}
                {listing.sourceCheckedAt && <> Checked {date(listing.sourceCheckedAt)}.</>}
              </>
            )}
          </footer>
          <Link className="detail-back" href={index}>
            <ArrowLeft size={15} style={{ marginRight: 8 }} />
            {job ? 'Back to all jobs' : 'Back to all events'}
          </Link>
        </article>
        <aside
          className="detail-sidebar"
          aria-label={job ? 'Application details' : 'Event details'}
        >
          <div className="flow-card">
            <dl className="detail-facts">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <DetailActions
              id={listing.id}
              slug={listing.slug}
              kind={listing.kind}
              href={listing.url}
              isSample={listing.isSample}
              live={live}
              signedIn={!!user}
              initiallySaved={saved}
              returnTo={listingHref(listing)}
              editorial={!!source}
              organizerEvent={listing.externalSource === 'organizer'}
              applicationMethod={listing.applicationMethod}
              hasApplicationInstructions={!!instructions}
              city={jobCity?.slug || ''}
            />
          </div>
          <p className="detail-source">
            Something doesn’t look right? <Link href="/contact">Let us know.</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
