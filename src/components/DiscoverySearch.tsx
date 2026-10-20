'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, MapPin, ArrowRight, LoaderCircle, Briefcase, CalendarDays } from 'lucide-react';
import { LOCATIONS, type ListingKind } from '@/lib/types';
export default function DiscoverySearch({
  kind = 'job',
  home = false,
  locations = [...LOCATIONS],
}: {
  kind?: ListingKind;
  home?: boolean;
  locations?: string[];
}) {
  const p = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(p.get('q') || '');
  const [location, setLocation] = useState(p.get('location') || '');
  const [tab, setTab] = useState(kind);
  const currentQuery = p.get('q') || '';
  const currentLocation = p.get('location') || '';
  useEffect(() => {
    setQ(currentQuery);
    setLocation(currentLocation);
  }, [currentQuery, currentLocation]);
  const [pending, startTransition] = useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(home ? '' : p.toString());
    q.trim() ? params.set('q', q.trim()) : params.delete('q');
    location ? params.set('location', location) : params.delete('location');
    params.delete('page');
    startTransition(() =>
      router.push(`/${(home ? tab : kind) === 'job' ? 'jobs' : 'events'}?${params}`),
    );
  }
  return (
    <div className={`discovery-search ${home ? 'home-search' : ''}`}>
      {home && (
        <div className="search-tabs" role="group" aria-label="Search type">
          <button
            type="button"
            aria-pressed={tab === 'job'}
            onClick={() => setTab('job')}
            className={tab === 'job' ? 'selected' : ''}
          >
            <Briefcase size={16} />
            Find a job
          </button>
          <button
            type="button"
            aria-pressed={tab === 'event'}
            onClick={() => setTab('event')}
            className={tab === 'event' ? 'selected' : ''}
          >
            <CalendarDays size={16} />
            Discover events
          </button>
        </div>
      )}
      <form onSubmit={submit} className="search-form">
        <label className="search-input">
          <Search size={19} />
          <span className="sr-only">Search {home ? tab : kind}s</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              (home ? tab : kind) === 'job'
                ? 'Job title, keyword or organization'
                : 'Event, topic or organizer'
            }
          />
        </label>
        <label className="search-location">
          <MapPin size={18} />
          <span className="sr-only">Location</span>
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">All locations</option>
            {Array.from(new Set([...locations, ...(location ? [location] : [])])).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button className="button" disabled={pending} type="submit">
          {pending ? (
            <>
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
              <span className="sr-only">Searching…</span>
            </>
          ) : (
            <>
              Search <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
