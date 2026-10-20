import Link from 'next/link';
import { MapPin, Briefcase, ArrowUpRight, Clock3, CalendarDays, Video } from 'lucide-react';
import { formatSalary, listingHref, type Listing } from '@/lib/types';
import SaveButton from './SaveButton';
import { listingSourceName } from '@/lib/listing-source';
export function dateLabel(date: string | null) {
  if (!date) return 'Date to be confirmed';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Brussels',
  }).format(new Date(date));
}
export function eventTimeLabel(listing: Pick<Listing, 'startsAt' | 'timezone' | 'eventDateOnly'>) {
  if (listing.eventDateOnly) return 'Check session times';
  if (!listing.startsAt) return null;
  return `${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
  }).format(new Date(listing.startsAt))} Brussels time`;
}
export function JobCard({ listing: l, compact = false }: { listing: Listing; compact?: boolean }) {
  const source = listingSourceName(l);
  const age = Math.max(
    0,
    Math.floor((Date.now() - new Date(l.publishedAt || l.createdAt).getTime()) / 86400000),
  );
  return (
    <article className={`job-card ${compact ? 'compact' : ''}`}>
      <div className="org-mark" style={{ background: l.color }} aria-hidden="true">
        {l.initials}
      </div>
      <div className="job-card-body">
        <div className="card-topline">
          <span className="organization-name">{l.organization}</span>
          {l.featured && <span className="spotlight">Spotlight</span>}
        </div>
        <h3>
          <Link href={listingHref(l)}>{l.title}</Link>
        </h3>
        <div className="listing-meta">
          <span>
            <MapPin size={13} />
            {l.location}
            {l.workMode && ` · ${l.workMode}`}
          </span>
          <span>
            <Briefcase size={13} />
            {l.employmentType || 'Type not specified'}
          </span>
        </div>
        <div className="job-card-bottom">
          <span className="topic-tag">{l.topic}</span>
          <span className="salary">{formatSalary(l)}</span>
        </div>
      </div>
      <div className="card-end">
        <SaveButton id={l.id} />
        <span className="posted-label">
          {source ? 'Added ' : ''}
          {age === 0 ? (source ? 'today' : 'Today') : `${age}d ago`}
        </span>
      </div>
    </article>
  );
}
export function EventCard({
  listing: l,
  compact = false,
}: {
  listing: Listing;
  compact?: boolean;
}) {
  const start = l.startsAt ? new Date(l.startsAt) : null;
  const timeLabel = eventTimeLabel(l);
  return (
    <article className={`event-card ${compact ? 'compact' : ''}`}>
      <div className="event-date" aria-hidden="true">
        <span>
          {start
            ? new Intl.DateTimeFormat('en-GB', {
                month: 'short',
                timeZone: l.eventDateOnly ? l.timezone : 'Europe/Brussels',
              }).format(start)
            : 'TBC'}
        </span>
        <strong>
          {start
            ? new Intl.DateTimeFormat('en-GB', {
                day: 'numeric',
                timeZone: l.eventDateOnly ? l.timezone : 'Europe/Brussels',
              }).format(start)
            : '—'}
        </strong>
      </div>
      <div className="event-card-body">
        <div className="card-topline">
          <span className="event-type">{l.eventType}</span>
          <span className="event-price">
            {l.price === 0 ? 'Free' : l.price === null ? 'Price not listed' : `€${l.price}`}
          </span>
        </div>
        <h3>
          <Link href={listingHref(l)}>{l.title}</Link>
        </h3>
        <p className="organization-name">
          {l.externalSource === 'organizer' && 'Listed by '}
          {l.organization}
        </p>
        <div className="listing-meta">
          <span>
            {l.location === 'Remote' || l.location === 'Online' ? (
              <Video size={13} />
            ) : (
              <MapPin size={13} />
            )}{' '}
            {l.location}
          </span>
          {!compact && timeLabel && (
            <span>
              {!l.eventDateOnly && <Clock3 size={13} />}
              {timeLabel}
            </span>
          )}
        </div>
      </div>
      {!compact && <SaveButton id={l.id} />}
      <Link className="event-arrow" href={listingHref(l)} aria-label={`View ${l.title}`}>
        <ArrowUpRight size={19} />
      </Link>
    </article>
  );
}
