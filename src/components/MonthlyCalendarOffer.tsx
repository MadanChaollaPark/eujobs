'use client';

import { useState } from 'react';
import { CalendarPlus, ArrowUpRight } from 'lucide-react';
import {
  CALENDAR_PRICE_CENTS,
  CALENDAR_CURRENCY,
  type CalendarMonthPreview,
} from '@/lib/monthly-calendar-shared';

type CalendarRequest = { requestId: string; requestToken: string; purchaseId?: string };
const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const tokenPattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export function calendarRequestKey(month: string) {
  return `eujobs:monthly-calendar-request:${month}`;
}

/** Save the request before checkout so retries recover the same purchase. */
export function getCalendarRequest(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  month: string,
): CalendarRequest {
  const key = calendarRequestKey(month);
  const saved = storage.getItem(key);
  if (saved) {
    let value: CalendarRequest;
    try {
      value = JSON.parse(saved) as CalendarRequest;
    } catch {
      throw new Error('Your saved checkout could not be read. Contact EUJobs before trying again.');
    }
    if (
      !value ||
      typeof value.requestId !== 'string' ||
      typeof value.requestToken !== 'string' ||
      !requestIdPattern.test(value.requestId || '') ||
      !tokenPattern.test(value.requestToken || '')
    )
      throw new Error('Your saved checkout could not be read. Contact EUJobs before trying again.');
    return value;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const request = {
    requestId: crypto.randomUUID(),
    requestToken: btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', ''),
  };
  storage.setItem(key, JSON.stringify(request));
  if (storage.getItem(key) !== JSON.stringify(request))
    throw new Error('Allow browser storage before continuing so your purchase can be recovered.');
  return request;
}

export function calendarCheckoutUrl(value: string) {
  const destination = new URL(value);
  if (
    destination.protocol !== 'https:' ||
    destination.hostname !== 'checkout.stripe.com' ||
    destination.port ||
    destination.username ||
    destination.password
  )
    throw new Error('Secure checkout could not be opened. Please contact EUJobs.');
  return destination.href;
}

export default function MonthlyCalendarOffer({ months }: { months: CalendarMonthPreview[] }) {
  const [month, setMonth] = useState(months[0]?.month || '');
  const [email, setEmail] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manageUrl, setManageUrl] = useState('');
  const selected = months.find((entry) => entry.month === month);
  const price = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: CALENDAR_CURRENCY,
  }).format(CALENDAR_PRICE_CENTS / 100);

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.count || busy) return;
    setBusy(true);
    setError('');
    try {
      let request: CalendarRequest;
      try {
        request = getCalendarRequest(localStorage, selected.month);
      } catch (failure) {
        if (failure instanceof Error && failure.message.includes('saved checkout')) throw failure;
        throw new Error(
          'Allow browser storage before continuing so your purchase can be recovered.',
        );
      }
      const response = await fetch('/api/calendar-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selected.month,
          email,
          requestId: request.requestId,
          requestToken: request.requestToken,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Checkout could not be started. Please retry.');
      if (!requestIdPattern.test(result.id || ''))
        throw new Error('Your purchase could not be opened. Please retry to recover it.');
      const privateUrl = `${window.location.origin}/calendar-purchases/${result.id}#token=${request.requestToken}`;
      setManageUrl(privateUrl);
      localStorage.setItem(`eujobs:calendar-manage:${result.id}`, privateUrl);
      localStorage.setItem(
        calendarRequestKey(selected.month),
        JSON.stringify({ ...request, purchaseId: result.id }),
      );
      window.location.assign(
        result.status === 'open' && result.checkoutUrl
          ? calendarCheckoutUrl(result.checkoutUrl)
          : privateUrl,
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Checkout could not be started. Please retry.',
      );
      setBusy(false);
    }
  }

  return (
    <section
      id="monthly-calendar"
      className={`monthly-calendar-offer${expanded ? ' is-expanded' : ''}`}
      aria-labelledby="monthly-calendar-title"
    >
      <div className="monthly-calendar-icon" aria-hidden="true">
        <CalendarPlus size={25} strokeWidth={1.5} />
      </div>
      <div className="monthly-calendar-copy">
        <p className="eyebrow">YOUR MONTH, IN YOUR CALENDAR</p>
        <h2 id="monthly-calendar-title">A month of events, ready to add.</h2>
        <p>
          {price} once to add a month together. Reading events and adding them individually stay
          free.
        </p>
        {expanded && (
          <p className="monthly-calendar-small">
            Private calendar feed + .ics download. No account or automatic renewal. Admission and
            registration are separate.
          </p>
        )}
      </div>
      <div className="monthly-calendar-controls">
        <button
          type="button"
          className={`button${expanded ? ' secondary' : ''}`}
          aria-expanded={expanded}
          aria-controls="monthly-calendar-options"
          onClick={() => setExpanded(!expanded)}
          disabled={busy}
        >
          {expanded ? 'Hide calendar options' : `Choose a month · ${price}`}
        </button>
        {expanded && (
          <form
            id="monthly-calendar-options"
            className="monthly-calendar-controls"
            onSubmit={checkout}
          >
            <label htmlFor="monthly-calendar-month">Choose your month</label>
            <select
              id="monthly-calendar-month"
              value={month}
              disabled={busy}
              aria-describedby="monthly-calendar-selection"
              onChange={(event) => {
                setMonth(event.target.value);
                setError('');
                setManageUrl('');
              }}
            >
              {months.map((entry) => (
                <option key={entry.month} value={entry.month}>
                  {entry.label} · {entry.count} {entry.count === 1 ? 'event' : 'events'}
                </option>
              ))}
            </select>
            <p
              id="monthly-calendar-selection"
              className="monthly-calendar-selection"
              aria-live="polite"
            >
              {selected?.count ? (
                <>
                  <strong>
                    {selected.count} published {selected.count === 1 ? 'event' : 'events'}
                  </strong>{' '}
                  in {selected.label}. ({new Date(`${selected.monthStart}T12:00:00Z`).getUTCDate()}–
                  {new Date(`${selected.monthEnd}T12:00:00Z`).getUTCDate()}{' '}
                  {new Intl.DateTimeFormat('en-GB', {
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(`${selected.monthStart}T12:00:00Z`))}
                  )
                </>
              ) : (
                'No published events for this month yet. Choose another month.'
              )}
            </p>
            <label htmlFor="monthly-calendar-email">Email for your private purchase link</label>
            <input
              id="monthly-calendar-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              placeholder="you@example.com"
            />
            <button className="button" disabled={busy || !selected?.count}>
              {busy ? 'Opening secure checkout…' : `Get this month · ${price}`}
              {!busy && <ArrowUpRight size={16} aria-hidden="true" />}
            </button>
          </form>
        )}
      </div>
      {expanded && (
        <p className="monthly-calendar-fineprint">
          Includes all published events in the selected calendar month, including earlier dates,
          regardless of your search filters. Month boundaries use Brussels time; your calendar
          displays timed events in its own timezone. Date-only events retain their published dates.
          The private feed includes changes and additions for that month; your calendar app controls
          refresh timing. Google Calendar feed setup requires a computer. The downloadable file is a
          snapshot at checkout. Event admission and registration are separate.
        </p>
      )}
      {error && (
        <p className="monthly-calendar-error" role="alert">
          {error}
        </p>
      )}
      {manageUrl && (
        <a className="monthly-calendar-recovery" href={manageUrl}>
          Open your private purchase page
        </a>
      )}
    </section>
  );
}
