'use client';
import { track } from '@/lib/track';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { JOB_PLANS, formatJobPrice, type JobPlan } from '@/lib/plans';
import type { PaymentOrder } from '@/lib/billing';
import { planOffer } from '@/lib/offers';

export async function startJobCheckout(jobId: string, plan: JobPlan) {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, plan }),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || 'Checkout could not be opened. Your draft is saved.');
  const url = new URL(body.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com')
    throw new Error('Invalid checkout destination. Please contact EUJobs.');
  track('checkout_redirect', { plan });
  window.location.assign(url.href);
}
export function PlanPicker({
  value,
  onChange,
}: {
  value: JobPlan;
  onChange: (value: JobPlan) => void;
}) {
  return (
    <fieldset className="form-section">
      <legend>Choose your job posting</legend>
      <div className="billing-plans">
        {Object.entries(JOB_PLANS).map(([id, plan]) => (
          <label key={id} className={`billing-plan ${value === id ? 'selected' : ''}`}>
            <input
              type="radio"
              name="jobPlan"
              value={id}
              checked={value === id}
              onChange={() => {
                track('plan_selected', { plan: id });
                onChange(id as JobPlan);
              }}
            />
            <strong>
              {plan.name} ·{' '}
              {planOffer(id) ? (
                <>
                  <s>{formatJobPrice(plan.amount)}</s> {planOffer(id)!.label}
                </>
              ) : (
                formatJobPrice(plan.amount)
              )}
            </strong>
            {id === 'basic' && planOffer(id) && <span>First listing free</span>}
            {planOffer(id) && <span className="field-help">{planOffer(id)!.note}</span>}
            <span>One job · 30 days · one-time payment</span>
            {plan.features.slice(1).map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </label>
        ))}
      </div>
      <p className="field-help">
        Secure payment with Stripe; offer codes are applied for you. Your 30 days begin when our
        team approves the job. Events are free to submit (sign-in required). No subscription or
        automatic renewal.
      </p>
    </fieldset>
  );
}
export function CheckoutActions({ jobId }: { jobId: string }) {
  const [plan, setPlan] = useState<JobPlan>('basic');
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <div>
      <div className="flow-actions">
        <select
          aria-label="Job posting plan"
          value={plan}
          onChange={(event) => setPlan(event.target.value as JobPlan)}
        >
          {Object.entries(JOB_PLANS).map(([id, item]) => (
            <option key={id} value={id}>
              {item.name} — {planOffer(id) ? planOffer(id)!.label : formatJobPrice(item.amount)}
            </option>
          ))}
        </select>
        <button
          className="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError('');
            track('checkout_started', { plan });
            try {
              await startJobCheckout(jobId, plan);
            } catch (e) {
              track('checkout_error', {
                plan,
                message: e instanceof Error ? e.message.slice(0, 80) : 'unknown',
              });
              setError(e instanceof Error ? e.message : 'Checkout failed.');
              setPending(false);
            }
          }}
        >
          {pending ? 'Opening Stripe…' : 'Pay & submit for review'}
        </button>
      </div>
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export default function BillingPanel() {
  const [payments, setPayments] = useState<(PaymentOrder & { title: string })[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/payments')
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Could not load payments.');
        if (active) setPayments(data.payments);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div>
      <h2 className="flow-heading">Your payments</h2>
      <p className="muted">
        One-time job posting purchases. Card and billing details are handled by Stripe.
      </p>
      {error && (
        <p role="alert" className="flow-error">
          {error}
        </p>
      )}
      {!payments && !error && <p role="status">Loading payments…</p>}
      {payments?.length === 0 && (
        <div className="empty-state">
          <h3>No payments yet.</h3>
          <p>Create a job draft, choose a plan, and pay securely.</p>
          <Link href="/pricing" className="button">
            View posting plans
          </Link>
        </div>
      )}
      <div className="account-list">
        {payments?.map((payment) => (
          <article className="account-listing" key={payment.id}>
            <div className="account-listing-top">
              <div>
                <h3>{payment.title}</h3>
                <p>
                  {JOB_PLANS[payment.plan].name} · {formatJobPrice(payment.amount)} ·{' '}
                  {new Date(payment.createdAt).toLocaleDateString('en-GB')}
                </p>
              </div>
              <span className="pill">{payment.status}</span>
            </div>
            <p className="field-help">Reference: {payment.id}</p>
            <div className="flow-actions">
              {payment.invoiceUrl && (
                <a
                  href={payment.invoiceUrl}
                  className="button secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Invoice ↗
                </a>
              )}
              {payment.receiptUrl && (
                <a
                  href={payment.receiptUrl}
                  className="button secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Receipt ↗
                </a>
              )}
              {payment.status === 'open' && (
                <p className="field-help">
                  Return to your submission to resume checkout. If you have paid,{' '}
                  <Link
                    href={`/job-success?session_id=${encodeURIComponent(payment.sessionId || '')}`}
                  >
                    check payment status
                  </Link>
                  .
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
