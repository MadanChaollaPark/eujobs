'use client';
import { track } from '@/lib/track';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Listing } from '@/lib/types';
import type { PaymentOrder } from '@/lib/billing';
import { JOB_PLANS, formatJobPrice } from '@/lib/plans';
import SubmissionForm from './SubmissionForm';
import './flows.css';
import './billing.css';

type GuestJob = { listing: Listing; contactEmail: string; payments: PaymentOrder[] };

async function guestRequest(id: string, suffix = '', body?: object, method = 'POST') {
  const response = await fetch(`/api/guest-jobs/${encodeURIComponent(id)}${suffix}`, {
    method: body ? method : 'GET',
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Your job could not be loaded.');
  return data;
}

export default function GuestJobManager({
  id,
  sessionId,
  cancelled,
}: {
  id: string;
  sessionId?: string;
  cancelled: boolean;
}) {
  const [data, setData] = useState<GuestJob | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [manageUrl, setManageUrl] = useState('');
  const [message, setMessage] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const storageKey = `eujobs:guest-manage:${id}`;
    async function refreshPayment(reference: string, attempt = 0) {
      try {
        const result = await guestRequest(id, '/payment', { sessionId: reference });
        if (!active) return;
        setData(await guestRequest(id));
        if (result.order?.status === 'paid') {
          setPaymentMessage(
            result.listing?.status === 'pending'
              ? 'Payment confirmed. Your job is awaiting review. Its 30 days online begin after approval.'
              : 'Payment confirmed. You can submit your latest draft for review below.',
          );
        } else if (result.order?.status === 'refunded') {
          setPaymentMessage('This payment was refunded. It does not provide an active posting.');
        } else if (result.order?.status === 'expired') {
          setPaymentMessage(
            'This checkout expired without a confirmed payment. Your draft is saved.',
          );
        } else if (attempt < 7) {
          setPaymentMessage('Stripe is still confirming payment. Checking again shortly…');
          timer = setTimeout(() => void refreshPayment(reference, attempt + 1), 2500);
        } else {
          setPaymentMessage(
            'Payment is not confirmed yet. Use “Check payment” below before paying again.',
          );
        }
      } catch (failure) {
        if (active)
          setPaymentMessage(
            failure instanceof Error ? failure.message : 'Payment confirmation is unavailable.',
          );
      }
    }
    async function load() {
      try {
        const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
        let saved = '';
        try {
          saved = sessionStorage.getItem(storageKey) || '';
        } catch {
          // The scoped HttpOnly cookie still permits access when browser storage is disabled.
        }
        const safeSaved = saved.startsWith(`${window.location.origin}/manage-job/${id}#token=`)
          ? saved
          : '';
        const token = fragmentToken || (safeSaved ? new URL(safeSaved).hash.slice(7) : '');
        if (token) {
          await guestRequest(id, '', { action: 'access', token });
          const privateUrl = `${window.location.origin}/manage-job/${id}#token=${encodeURIComponent(token)}`;
          try {
            sessionStorage.setItem(storageKey, privateUrl);
          } catch {
            // Keep the current copy available even if persistent browser storage is unavailable.
          }
          if (active) setManageUrl(privateUrl);
        }
        if (fragmentToken)
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        const loaded = await guestRequest(id);
        if (!active) return;
        setData(loaded);
        if (sessionId) {
          setPaymentMessage('Checking your payment securely with Stripe…');
          void refreshPayment(sessionId);
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error ? failure.message : 'Open your private job link to continue.',
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

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Opening your private job page…</p>;
  if (!data)
    return (
      <div className="flow-card flow-form">
        <h1 className="page-title">Your private job page.</h1>
        <p role="alert" className="flow-error">
          {error}
        </p>
        <p>Open the full private link you saved, or use the browser where you created the job.</p>
        <p>If you have paid, your job management email also contains the link.</p>
        <div className="flow-actions">
          <Link className="button" href="/submit?kind=job&plan=basic">
            Post a job
          </Link>
          <Link className="button secondary" href="/contact">
            Contact support
          </Link>
        </div>
      </div>
    );

  const { listing, payments = [] } = data;
  const openPayment = payments.find((payment) => payment.status === 'open');
  const draftEditor = ['draft', 'rejected'].includes(listing.status) && !openPayment;
  return (
    <div className="guest-job-manager">
      <div className="flow-card flow-form">
        <p className="eyebrow">YOUR JOB, WITHOUT AN ACCOUNT</p>
        <h1 className="page-title">{listing.title}</h1>
        <div className="submission-status">
          <span className={`status-badge ${listing.status}`}>{listing.status}</span>
          <span>{listing.organization}</span>
        </div>
        {data.contactEmail && <p className="field-help">Contact email: {data.contactEmail}</p>}
        {cancelled && (
          <p className="notice">
            Checkout was paused. Your draft is saved; you can continue when ready.
          </p>
        )}
        {paymentMessage && (
          <p className="flow-success" role="status">
            {paymentMessage}
          </p>
        )}
        {listing.status === 'pending' && (
          <p>Our team will review your job before it appears publicly.</p>
        )}
        {listing.rejectionReason && (
          <p className="notice">Reviewer’s note: {listing.rejectionReason}</p>
        )}
        {listing.entitlementExpiresAt && (
          <p>Posting ends {new Date(listing.entitlementExpiresAt).toLocaleDateString('en-GB')}.</p>
        )}
        {error && (
          <p className="flow-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="flow-success" role="status">
            {message}
          </p>
        )}
        <div className="flow-actions">
          {manageUrl && (
            <button
              className="button secondary"
              onClick={() =>
                void act(async () => {
                  await navigator.clipboard.writeText(manageUrl);
                  setMessage(
                    'Private management link copied. Keep it private: anyone with the link can manage this job.',
                  );
                })
              }
              disabled={busy}
            >
              Copy private job link
            </button>
          )}
          {!draftEditor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setEditing(!editing)}
            >
              {editing
                ? 'Hide editor'
                : listing.status === 'closed'
                  ? 'Edit & renew job'
                  : 'Edit job'}
            </button>
          )}
          {listing.status === 'published' && (
            <>
              <Link className="button secondary" href={`/jobs/${listing.slug}`}>
                View published job
              </Link>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await guestRequest(
                      id,
                      '',
                      { action: 'close', version: listing.version },
                      'PATCH',
                    );
                    setData(await guestRequest(id));
                    setMessage('Your job is now closed.');
                  })
                }
              >
                Close job
              </button>
            </>
          )}
        </div>
        <p className="field-help">
          Use your private link to return here. After payment, we also email a management link. No
          password is needed.
        </p>
        {openPayment && (
          <div className="flow-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const checkout = await guestRequest(id, '/checkout', { plan: openPayment.plan });
                  const destination = new URL(checkout.url);
                  if (
                    destination.protocol !== 'https:' ||
                    destination.hostname !== 'checkout.stripe.com'
                  )
                    throw new Error('Checkout could not be opened. Contact support.');
                  track('checkout_started', { plan: openPayment.plan });
                  window.location.assign(destination.href);
                })
              }
            >
              Continue payment · {formatJobPrice(openPayment.amount)}
            </button>
            {openPayment.sessionId && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const result = await guestRequest(id, '/payment', {
                      sessionId: openPayment.sessionId,
                    });
                    setData(await guestRequest(id));
                    setPaymentMessage(
                      result.order?.status === 'paid'
                        ? 'Payment confirmed. Your job status is shown above.'
                        : `Payment status: ${result.order?.status || 'unconfirmed'}.`,
                    );
                  })
                }
              >
                Check payment
              </button>
            )}
          </div>
        )}
      </div>
      {(editing || draftEditor) && (
        <SubmissionForm
          key={`${listing.id}:${listing.version}`}
          initial={listing}
          guest
          onSaved={(updated) => {
            setData({ ...data, listing: updated });
            setEditing(false);
          }}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
      )}
      {payments.length > 0 && (
        <div className="flow-card flow-form">
          <h2>Your payments</h2>
          {payments.map((payment) => (
            <article key={payment.id}>
              <p>
                <strong>
                  {JOB_PLANS[payment.plan].name} · {formatJobPrice(payment.amount)}
                </strong>{' '}
                · {payment.status}
              </p>
              <p className="field-help">Reference: {payment.id}</p>
              <div className="flow-actions">
                {payment.invoiceUrl && (
                  <a
                    className="text-link"
                    href={payment.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Invoice ↗
                  </a>
                )}
                {payment.receiptUrl && (
                  <a
                    className="text-link"
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Receipt ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
