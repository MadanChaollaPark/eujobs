import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft, ArrowRight, SearchX, Briefcase, CalendarDays } from 'lucide-react';
import type { ListingKind, SearchFilters, SearchResult } from '@/lib/types';
import { getStats, getFacets } from '@/lib/store';
import DiscoverySearch from './DiscoverySearch';
import FilterPanel from './FilterPanel';
import SortControl from './SortControl';
import SaveSearchButton from './SaveSearchButton';
import { JobCard, EventCard } from './ListingCard';
import TrackSearch from './TrackSearch';
import { citySlugForLocation } from '@/lib/city-pages';
import EventCalendar from './EventCalendar';
import MonthlyCalendarOffer from './MonthlyCalendarOffer';
import { getCalendarMonths } from '@/lib/monthly-calendar';
import './monthly-calendar.css';
export default function SearchResults({
  kind,
  filters,
  result,
  params,
}: {
  kind: ListingKind;
  filters: SearchFilters;
  result: SearchResult;
  params: Record<string, string | string[] | undefined>;
}) {
  const stats = getStats();
  const isJob = kind === 'job';
  function pageHref(page: number) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === 'string') p.set(k, v);
    p.set('page', String(page));
    return `/${isJob ? 'jobs' : 'events'}?${p}`;
  }
  return (
    <div className="container discovery-page">
      <div className="discovery-heading">
        <div>
          <p className="eyebrow">{isJob ? 'YOUR NEXT CHAPTER' : 'THE EUROPEAN AGENDA'}</p>
          <h1>{isJob ? 'Find work with purpose.' : 'Meet ideas. Meet people.'}</h1>
          <p>
            {isJob
              ? 'Meaningful roles in EU affairs, policy, and the organizations making a difference.'
              : 'Conversations, connections, and a fresh perspective. Find your next event.'}
          </p>
        </div>
        <span className="page-symbol">
          {isJob ? (
            <Briefcase size={35} strokeWidth={1.2} />
          ) : (
            <CalendarDays size={35} strokeWidth={1.2} />
          )}
        </span>
      </div>
      <Suspense>
        <DiscoverySearch kind={kind} locations={getFacets().locations} />
      </Suspense>
      <nav className="discovery-tabs" aria-label="Opportunity type">
        <Link className={isJob ? 'active' : ''} href="/jobs">
          <Briefcase size={16} />
          Jobs <span>{stats.jobs}</span>
        </Link>
        <Link className={!isJob ? 'active' : ''} href="/events">
          <CalendarDays size={16} />
          Events <span>{stats.events}</span>
        </Link>
      </nav>
      {!isJob && <MonthlyCalendarOffer months={getCalendarMonths()} />}
      <div className="results-layout">
        <Suspense>
          <FilterPanel kind={kind} />
        </Suspense>
        <section className="results-main" aria-label={`${isJob ? 'Job' : 'Event'} results`}>
          {isJob && (
            <TrackSearch
              query={filters.q || ''}
              city={citySlugForLocation(filters.location)}
              results={result.total}
            />
          )}
          <div className="results-toolbar">
            <p>
              <strong>{result.total}</strong> {isJob ? 'opportunities' : 'upcoming events'}
              {filters.q && <> for “{filters.q}”</>}
            </p>
            <Suspense>
              <SortControl kind={kind} />
            </Suspense>
          </div>
          {isJob ? (
            <div className="job-list">
              {result.items.map((l) => (
                <JobCard listing={l} key={l.id} />
              ))}
            </div>
          ) : (
            <EventCalendar filters={filters} initialItems={result.items} />
          )}{' '}
          {result.total === 0 && (
            <div className="empty-state">
              <SearchX size={32} />
              <h2>A little wider, perhaps?</h2>
              <p>
                No {isJob ? 'roles' : 'events'} match these filters. Try a different keyword or
                clear a filter.
              </p>
              <Link className="button secondary" href={isJob ? '/jobs' : '/events'}>
                Clear filters
              </Link>
            </div>
          )}
          {result.pages > 1 && (
            <nav className="pagination" aria-label="Results pages">
              {result.page > 1 ? (
                <Link href={pageHref(result.page - 1)} aria-label="Previous page">
                  <ArrowLeft size={16} />
                </Link>
              ) : (
                <span className="disabled">
                  <ArrowLeft size={16} />
                </span>
              )}
              <span>
                Page {result.page} of {result.pages}
              </span>
              {result.page < result.pages ? (
                <Link href={pageHref(result.page + 1)} aria-label="Next page">
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <span className="disabled">
                  <ArrowRight size={16} />
                </span>
              )}
            </nav>
          )}
          <div className="search-save-panel">
            <div>
              <h3>Good opportunities are worth keeping.</h3>
              <p>Save your filters and check fresh matches in your account.</p>
            </div>
            <Suspense>
              <SaveSearchButton kind={kind} />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
