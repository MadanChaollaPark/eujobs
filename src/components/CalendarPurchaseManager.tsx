'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, ArrowUpRight, Copy } from 'lucide-react';
import { calendarCheckoutUrl, calendarRequestKey } from './MonthlyCalendarOffer';

type CalendarPurchase = {
  id: string;
  status: 'open' | 'paid' | 'expired' | 'refunded';
  month: string;
  monthStart: string;
  monthEnd: string;
  label: string;
  count: number;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  downloadUrl: string | null;
  feedUrl: string | null;
  invoiceUrl: string | null;
  receiptUrl: string | null;
  accessExpiresAt?: string;
  currentCount?: number;
};

async function calendarRequest(id: string, suffix = '', body?: object): Promise<CalendarPurchase> {
  const response = await fetch(`/api/calendar-purchases/${encodeURIComponent(id)}${suffix}`, {
    method: body ? 'POST' : 'GET',
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Your calendar purchase could not be loaded.');
  return data;
}

function releaseFinishedRequest(purchase: CalendarPurchase) {
  if (purchase.status !== 'expired' && purchase.status !== 'refunded') return;
  try {
    const key = calendarRequestKey(purchase.month);
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.purchaseId === purchase.id) localStorage.removeItem(key);
  } catch {
    // The private purchase link still works when browser storage is unavailable.
  }
}

export default function CalendarPurchaseManager({
  id,
  sessionId,
  cancelled,
  googleAvailable,
  googleResult,
}: {
  id: string;
  sessionId?: string;
  cancelled: boolean;
  googleAvailable: boolean;
  googleResult?: string;
}) {
  const [purchase, setPurchase] = useState<CalendarPurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [manageUrl, setManageUrl] = useState('');
  const [google, setGoogle] = useState<{
    configured: boolean;
    connected: boolean;
    calendarName?: string;
    calendarUrl?: string;
    syncedCount?: number;
    lastSyncedAt?: string;
    needsReview?: boolean;
  }>({ configured: googleAvailable, connected: false });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const storageKey = `eujobs:calendar-manage:${id}`;

    function accept(data: CalendarPurchase) {
      if (!active) return;
      setPurchase(data);
      releaseFinishedRequest(data);
    }

    async function reconcile(attempt = 0) {
      try {
        const result = await calendarRequest(id, '/reconcile', sessionId ? { sessionId } : {});
        if (!active) return;
        accept(result);
        if (result.status === 'open' && attempt < 5) {
          setMessage('Stripe is still confirming payment. Checking again shortly…');
          timer = setTimeout(() => void reconcile(attempt + 1), 2500);
        } else if (result.status === 'open') {
          setMessage('Payment is not confirmed yet. Use “Check payment” before paying again.');
        } else {
          setMessage('');
        }
      } catch (failure) {
        if (active) {
          setMessage('');
          setError(
            failure instanceof Error ? failure.message : 'Payment confirmation is unavailable.',
          );
        }
      }
    }

    async function load() {
      try {
        const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
        let saved = '';
        try {
          saved = localStorage.getItem(storageKey) || '';
        } catch {
          // Access can also be restored using the private link or scoped HttpOnly cookie.
        }
        const prefix = `${window.location.origin}/calendar-purchases/${id}#token=`;
        const savedToken = saved.startsWith(prefix) ? saved.slice(prefix.length) : '';
        const token = fragmentToken || savedToken;
        if (fragmentToken) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        if (token) {
          if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token))
            throw new Error(
              'This private calendar link is incomplete. Open the full link you saved.',
            );
          await calendarRequest(id, '/access', { token });
          const privateUrl = `${prefix}${token}`;
          try {
            localStorage.setItem(storageKey, privateUrl);
          } catch {
            // Keep the link available to copy even if browser storage is unavailable.
          }
          if (active) setManageUrl(privateUrl);
        }
        const loaded = await calendarRequest(id);
        if (!active) return;
        accept(loaded);
        if (sessionId && loaded.status === 'open') {
          setMessage('Checking your payment securely with Stripe…');
          void reconcile();
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Open your private calendar link to continue.',
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, sessionId]);

  useEffect(() => {
    if (purchase?.status !== 'paid') return;
    const abort = new AbortController();
    fetch(`/api/calendar-purchases/${encodeURIComponent(id)}/google`, {
      cache: 'no-store',
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Google Calendar connection status could not be loaded.');
        return response.json();
      })
      .then((data) => setGoogle(data))
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : 'Google Calendar status unavailable.',
          );
      });
    return () => abort.abort();
  }, [id, purchase?.status]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Opening your private calendar page…</p>;
  if (!purchase)
    return (
      <div className="calendar-purchase-card">
        <p className="eyebrow">YOUR MONTHLY CALENDAR</p>
        <h1>Open your private purchase link.</h1>
        <p className="monthly-calendar-error" role="alert">
          {error}
        </p>
        <p>
          Use the full private link from your purchase email, the link you saved, or return in the
          browser where you started checkout.
        </p>
        <div className="calendar-purchase-actions">
          <Link href="/events#monthly-calendar" className="button secondary">
            Browse events
          </Link>
          <Link href="/contact" className="button secondary">
            Contact EUJobs
          </Link>
        </div>
      </div>
    );

  const price = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: purchase.currency,
  }).format(purchase.amount / 100);
  const paid = purchase.status === 'paid';
  const open = purchase.status === 'open';
  const expired = purchase.status === 'expired';
  return (
    <div className="calendar-purchase-card">
      <p className="eyebrow">YOUR MONTHLY CALENDAR · NO ACCOUNT NEEDED</p>
      <h1>
        {paid
          ? 'Your month is ready.'
          : open
            ? 'Your calendar, one step away.'
            : expired
              ? 'This checkout has expired.'
              : 'This payment was refunded.'}
      </h1>
      <div className="calendar-purchase-facts">
        <strong>{purchase.label}</strong>
        <span>
          {purchase.count} {purchase.count === 1 ? 'event' : 'events'} at checkout
        </span>
        <span>{price} · one-time purchase</span>
      </div>
      {paid ? (
        <p>
          Payment confirmed. Choose your calendar below to add the month. Your private feed follows
          changes and additions to this month; your calendar app decides when to refresh it.
        </p>
      ) : open ? (
        <p>
          Your event selection is saved. Complete secure checkout with Stripe to get your monthly
          calendar feed and download.
        </p>
      ) : expired ? (
        <p>
          No payment was completed for this checkout. Choose a month again to start a new purchase.
        </p>
      ) : (
        <p>
          This purchase no longer provides calendar access. Events already added to your calendar
          may remain there; remove the separate EUJobs calendar if you no longer want them.
        </p>
      )}
      {cancelled && open && (
        <p className="calendar-purchase-notice">
          Checkout was paused. You can resume when you are ready.
        </p>
      )}
      {message && (
        <p className="calendar-purchase-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="monthly-calendar-error" role="alert">
          {error}
        </p>
      )}
      <div className="calendar-purchase-actions">
        {open && (
          <>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = await calendarRequest(id, '/checkout', {});
                  setPurchase(result);
                  releaseFinishedRequest(result);
                  if (result.status === 'open' && result.checkoutUrl)
                    window.location.assign(calendarCheckoutUrl(result.checkoutUrl));
                  else if (result.status === 'open')
                    setMessage('Checkout is still being prepared. Please try again shortly.');
                })
              }
            >
              Continue payment · {price} <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = await calendarRequest(
                    id,
                    '/reconcile',
                    sessionId ? { sessionId } : {},
                  );
                  setPurchase(result);
                  releaseFinishedRequest(result);
                  setMessage(
                    result.status === 'open'
                      ? 'Payment has not been confirmed. You can resume the same checkout above.'
                      : '',
                  );
                })
              }
            >
              Check payment
            </button>
          </>
        )}
        {!paid && !open && (
          <Link className="button" href="/events#monthly-calendar">
            Choose a month
          </Link>
        )}
        {manageUrl && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await navigator.clipboard.writeText(manageUrl);
                setMessage(
                  'Private purchase link copied. Keep it safe: anyone with this link can access this purchase.',
                );
              })
            }
          >
            <Copy size={15} aria-hidden="true" /> Copy private purchase link
          </button>
        )}
      </div>
      <p className="calendar-purchase-small">
        Your purchase covers only {purchase.label}. It does not include event admission or
        registration. Check the organiser’s page before attending. All events are freely readable,
        and individual calendar downloads remain free.
      </p>
      {paid && (
        <>
          <h2>Add it to your calendar</h2>
          {typeof purchase.currentCount === 'number' && (
            <p className="calendar-purchase-small">
              The current feed contains {purchase.currentCount} published{' '}
              {purchase.currentCount === 1 ? 'event' : 'events'} for {purchase.label}.
            </p>
          )}
          {googleResult === 'connected' &&
            google.connected &&
            google.lastSyncedAt &&
            !google.needsReview && (
              <p className="calendar-purchase-notice" role="status">
                Google Calendar import finished. Check the import result below.
              </p>
            )}
          {googleResult === 'error' && (
            <p className="monthly-calendar-error" role="alert">
              Google Calendar could not finish connecting or importing. Try again below, or use your
              private calendar feed.
            </p>
          )}
          <div className="calendar-provider-grid">
            <section className="calendar-provider" aria-labelledby="calendar-google-title">
              <h3 id="calendar-google-title">Google Calendar</h3>
              {google.configured ? (
                <>
                  {google.needsReview && (
                    <p className="monthly-calendar-error" role="alert">
                      Google may have created your calendar, but the result needs checking.{' '}
                      <Link href="/contact">Contact EUJobs</Link> before retrying to avoid creating
                      a duplicate calendar. Your private feed and download remain available.
                    </p>
                  )}
                  <p>
                    {google.connected
                      ? `Connected to ${google.calendarName || 'your dedicated EUJobs calendar'}.`
                      : 'Connect Google to create a separate EUJobs calendar and add this month’s events. EUJobs asks only for access to calendars it creates.'}
                  </p>
                  {google.connected && (
                    <p className="calendar-purchase-small">
                      {google.syncedCount ?? 0} events added or updated at the last import. Return
                      here and update to include later changes; automatic Google refresh is
                      available through the private feed instead.
                    </p>
                  )}
                  <div className="calendar-purchase-actions">
                    {google.connected && (
                      <button
                        className="button"
                        disabled={busy || google.needsReview}
                        onClick={() =>
                          void act(async () => {
                            const response = await fetch(
                              `/api/calendar-purchases/${id}/google/sync`,
                              {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: '{}',
                              },
                            );
                            const result = await response.json();
                            if (!response.ok)
                              throw new Error(
                                result.error || 'Google Calendar could not be updated.',
                              );
                            setGoogle((current) => ({
                              ...current,
                              syncedCount: result.count,
                              calendarUrl: result.calendarUrl,
                            }));
                            setMessage(
                              `Google Calendar updated: ${result.added} added, ${result.updated} updated.`,
                            );
                          })
                        }
                      >
                        Update Google calendar
                      </button>
                    )}
                    <button
                      className={`button${google.connected ? ' secondary' : ''}`}
                      disabled={busy || google.needsReview}
                      onClick={() =>
                        void act(async () => {
                          const response = await fetch(
                            `/api/calendar-purchases/${id}/google/connect`,
                            {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: '{}',
                            },
                          );
                          const result = await response.json();
                          if (!response.ok)
                            throw new Error(result.error || 'Google Calendar could not connect.');
                          const destination = new URL(result.url);
                          if (
                            destination.protocol !== 'https:' ||
                            destination.hostname !== 'accounts.google.com' ||
                            destination.username ||
                            destination.password ||
                            destination.port
                          )
                            throw new Error('Google authorization could not be opened.');
                          window.location.assign(destination.href);
                        })
                      }
                    >
                      {google.connected ? 'Reconnect Google' : 'Connect Google and add this month'}
                    </button>
                  </div>
                  <p className="calendar-purchase-small">
                    Google access expires after about an hour. Reconnect using the same Google
                    account when you want to update the calendar later.
                  </p>
                </>
              ) : (
                <p>
                  Google Calendar setup needs a computer: open Google Calendar → Other calendars → +
                  → From URL. Paste your private feed below and choose Add calendar. The calendar
                  will then appear on your devices signed into the same Google account.
                </p>
              )}
              <p className="calendar-purchase-small">
                For automatic refresh, use the private feed with Google’s From URL option on a
                computer. Google controls refresh timing, so changes can take time to appear. Choose
                either the feed or direct import to avoid duplicate calendars.
              </p>
              <a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer">
                Open Google Calendar ↗
              </a>
            </section>
            <section className="calendar-provider" aria-labelledby="calendar-apple-title">
              <h3 id="calendar-apple-title">Apple Calendar</h3>
              <p>
                Subscribe to the private feed as a separate calendar. Confirm Add or Subscribe when
                your calendar app opens.
              </p>
              {purchase.feedUrl && (
                <a
                  className="button secondary"
                  href={purchase.feedUrl.replace(/^https:/, 'webcal:')}
                >
                  Add to Apple Calendar
                </a>
              )}
              <p className="calendar-purchase-small">
                If it does not open, copy the feed below and choose Add Subscription Calendar in
                your calendar app or Calendar account settings.
              </p>
            </section>
            <section className="calendar-provider" aria-labelledby="calendar-outlook-title">
              <h3 id="calendar-outlook-title">Outlook</h3>
              <p>
                In Outlook Calendar on the web, choose Add calendar → Subscribe from web. Paste your
                private feed, name it EUJobs, and import it.
              </p>
              <a
                href="https://outlook.live.com/calendar/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Outlook Calendar ↗
              </a>
            </section>
          </div>
          {purchase.feedUrl && (
            <section className="calendar-feed-panel" aria-labelledby="calendar-feed-title">
              <h3 id="calendar-feed-title">Your private calendar feed</h3>
              <label htmlFor="calendar-feed">Subscription URL</label>
              <input
                id="calendar-feed"
                readOnly
                value={purchase.feedUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    try {
                      await navigator.clipboard.writeText(purchase.feedUrl!);
                      setMessage('Private calendar feed copied.');
                    } catch {
                      throw new Error('Select and copy the subscription URL above.');
                    }
                  })
                }
              >
                <Copy size={15} aria-hidden="true" /> Copy calendar feed
              </button>
              <p className="calendar-purchase-small">
                Keep this URL private. Anyone with it can read your purchased monthly feed.
                Subscribed events are read-only; remove the EUJobs calendar to stop seeing them.
                Updates remain limited to {purchase.label}.
              </p>
            </section>
          )}
          <section className="calendar-feed-panel" aria-labelledby="calendar-snapshot-title">
            <h3 id="calendar-snapshot-title">Prefer a one-time import?</h3>
            <p>
              Download the {purchase.count}-event snapshot saved at checkout, then import it into a
              calendar. This file does not update automatically.
            </p>
            <a className="button secondary" href={`/api/calendar-purchases/${id}/download`}>
              <Download size={17} aria-hidden="true" /> Download calendar (.ics)
            </a>
            <p className="calendar-purchase-small">
              Google: Settings → Import &amp; export on a computer. Apple: open the file in
              Calendar. Outlook: Add calendar → Upload from file. Import once into a separate EUJobs
              calendar to avoid duplicates.
            </p>
          </section>
          {(purchase.invoiceUrl || purchase.receiptUrl) && (
            <div className="calendar-purchase-actions">
              {purchase.invoiceUrl && (
                <a
                  className="button secondary"
                  href={purchase.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View invoice
                </a>
              )}
              {purchase.receiptUrl && (
                <a
                  className="button secondary"
                  href={purchase.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View receipt
                </a>
              )}
            </div>
          )}
        </>
      )}
      {manageUrl && (
        <div className="calendar-private-link">
          <label htmlFor="calendar-purchase-link">Your private purchase link</label>
          <input
            id="calendar-purchase-link"
            readOnly
            value={manageUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      <p className="calendar-purchase-small">
        Save your private purchase link to return to this page. Anyone with it can access this
        purchase. <Link href="/contact">Contact EUJobs</Link> if you need help. Purchase reference:{' '}
        <code>{id}</code>.
      </p>
      {purchase.accessExpiresAt && (
        <p className="calendar-purchase-small">
          Purchase access is available until{' '}
          {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(
            new Date(purchase.accessExpiresAt),
          )}
          .
        </p>
      )}
      <Link href="/events">← Back to events</Link>
    </div>
  );
}
