'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, List, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import type { Listing, SearchFilters, SearchResult } from '@/lib/types';
import { EventCard } from './ListingCard';
const dayKey = (date: string, timezone = 'Europe/Brussels') =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
export function eventOccursOn(
  listing: Pick<Listing, 'startsAt' | 'endsAt' | 'timezone' | 'eventDateOnly'>,
  key: string,
) {
  if (!listing.startsAt) return false;
  const timezone = listing.eventDateOnly ? listing.timezone : 'Europe/Brussels';
  const firstDay = dayKey(listing.startsAt, timezone);
  const endInstant = listing.endsAt
    ? new Date(new Date(listing.endsAt).getTime() - 1).toISOString()
    : listing.startsAt;
  const finalDay = dayKey(endInstant, timezone);
  return key >= firstDay && key <= finalDay;
}
const currentMonth = () => {
  const [y, m] = dayKey(new Date().toISOString()).split('-').map(Number);
  return new Date(y, m - 1, 1);
};
export default function EventCalendar({
  filters,
  initialItems,
}: {
  filters: SearchFilters;
  initialItems: Listing[];
}) {
  const [mode, setMode] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const serialized = JSON.stringify(filters);
  useEffect(() => {
    if (mode !== 'calendar') return;
    const abort = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      setItems([]);
      try {
        const f = JSON.parse(serialized) as SearchFilters;
        const start = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
        const end = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()}`;
        if ((f.from && f.from > end) || (f.to && f.to < start)) {
          setItems([]);
          return;
        }
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(f))
          if (v !== undefined && v !== null) p.set(k, String(v));
        p.set('kind', 'event');
        p.set('from', f.from && f.from > start ? f.from : start);
        p.set('to', f.to && f.to < end ? f.to : end);
        p.set('pageSize', '50');
        p.set('sort', 'soonest');
        const all: Listing[] = [];
        let pages = 1;
        for (let page = 1; page <= pages; page++) {
          p.set('page', String(page));
          const r = await fetch('/api/listings?' + p, { signal: abort.signal });
          if (!r.ok) throw new Error('The calendar could not load. Please try again.');
          const data = (await r.json()) as SearchResult;
          all.push(...data.items);
          pages = data.pages;
        }
        setItems(all);
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : 'Calendar unavailable');
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => abort.abort();
  }, [mode, month, serialized]);
  const first = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dayKeys = Array.from(
    { length: days },
    (_, index) =>
      `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
  );
  const visibleEvents = items.filter((listing) =>
    dayKeys.some((key) => eventOccursOn(listing, key)),
  );
  const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(month);
  const eventsFor = (key: string) => items.filter((listing) => eventOccursOn(listing, key));
  return (
    <>
      <div className="event-view-toolbar">
        <span>
          {mode === 'calendar'
            ? 'All matching events in this month'
            : 'Find a conversation worth joining'}
        </span>
        <div className="view-toggle" aria-label="Event view">
          <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            <List size={15} />
            List
          </button>
          <button aria-pressed={mode === 'calendar'} onClick={() => setMode('calendar')}>
            <CalendarDays size={15} />
            Calendar
          </button>
        </div>
      </div>
      {mode === 'list' ? (
        <div className="event-list">
          {initialItems.map((l) => (
            <EventCard key={l.id} listing={l} />
          ))}
        </div>
      ) : (
        <div className="calendar-panel">
          <div className="calendar-toolbar">
            <h2>{label}</h2>
            <div>
              <button
                className="icon-button"
                onClick={() => {
                  setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
                  setSelected(null);
                }}
                aria-label="Previous month"
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="calendar-today"
                onClick={() => {
                  setMonth(currentMonth());
                  setSelected(null);
                }}
              >
                Today
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
                  setSelected(null);
                }}
                aria-label="Next month"
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <p className="calendar-timezone">
            Date-only events keep their published local dates · Timed events use Europe/Brussels ·
            Select a day to see its events
          </p>
          {loading && (
            <p role="status" className="calendar-status">
              <LoaderCircle size={16} className="spin" />
              Loading calendar…
            </p>
          )}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          <div className="calendar-grid" aria-busy={loading}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div className="calendar-weekday" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <div className="calendar-blank" key={'empty' + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const key = dayKeys[i];
              const events = eventsFor(key);
              return (
                <div
                  className={`calendar-cell ${selected === key ? 'selected' : ''} ${key === dayKey(new Date().toISOString()) ? 'today' : ''}`}
                  key={key}
                >
                  <button
                    className="calendar-day"
                    aria-label={`${i + 1} ${label}, ${events.length} ${events.length === 1 ? 'event' : 'events'}`}
                    onClick={() => setSelected(selected === key ? null : key)}
                  >
                    {i + 1}
                  </button>
                  {events.slice(0, 2).map((l) => (
                    <Link
                      href={'/events/' + l.slug}
                      key={l.id}
                      className="calendar-event"
                      title={l.title}
                    >
                      {l.title}
                    </Link>
                  ))}
                  {events.length > 2 && (
                    <button className="calendar-more" onClick={() => setSelected(key)}>
                      +{events.length - 2} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!loading && !error && visibleEvents.length === 0 && (
            <p className="calendar-status">
              No matching events this month. Try the next month or adjust your filters.
            </p>
          )}
          {selected && (
            <div className="calendar-selected">
              <h3>
                {new Intl.DateTimeFormat('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                }).format(new Date(selected + 'T12:00:00Z'))}
              </h3>
              {eventsFor(selected).map((l) => (
                <EventCard key={l.id} listing={l} />
              ))}
              {eventsFor(selected).length === 0 && <p className="muted">No events on this day.</p>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
