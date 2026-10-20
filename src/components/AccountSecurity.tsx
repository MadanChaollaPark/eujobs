'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { AlertSummary } from '@/lib/alerts';
import './flows.css';
export default function AccountSecurity({
  verified,
  available,
  alerts: initialAlerts,
}: {
  verified: boolean;
  available: boolean;
  alerts: AlertSummary[];
}) {
  const [alerts, setAlerts] = useState(initialAlerts),
    [pending, setPending] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function run(action: string, id?: string) {
    setPending(id || action);
    setError('');
    setMessage('');
    try {
      const response = await fetch(id ? '/api/alerts' : '/api/account-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { action: 'cancel', id } : { action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'We could not complete this request.');
      setMessage(data.message);
      if (id)
        setAlerts((items) =>
          items.map((item) => (item.id === id ? { ...item, status: 'unsubscribed' } : item)),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Try again.');
    } finally {
      setPending('');
    }
  }
  return (
    <section
      className="flow-card"
      style={{ marginTop: 24 }}
      aria-labelledby="account-email-heading"
    >
      <h2 id="account-email-heading">Email &amp; account security</h2>
      <p>
        {verified
          ? 'Your email address is verified.'
          : 'Verify your email address to confirm ownership of your account.'}
      </p>
      {!verified && (
        <button
          className="button secondary"
          disabled={!!pending || !available}
          onClick={() => run('request-verification')}
        >
          {pending === 'request-verification' ? 'Queuing…' : 'Send verification link'}
        </button>
      )}
      {!available && (
        <p className="field-help">
          Email delivery is temporarily unavailable. Verification, password recovery, and new email
          subscriptions will resume when delivery is restored.
        </p>
      )}
      <p>
        <Link href="/auth/recovery">Reset your password</Link>
      </p>
      <h3>Your email subscriptions</h3>
      {!alerts.length ? (
        <p className="muted">
          {verified
            ? 'You have no email subscriptions yet.'
            : 'Verify your email to view and manage subscriptions for this address.'}
        </p>
      ) : (
        <ul style={{ paddingLeft: 20 }}>
          {alerts.map((alert) => (
            <li key={alert.id} style={{ marginBottom: 16 }}>
              <strong>
                {alert.kind === 'newsletter'
                  ? 'Weekly newsletter'
                  : alert.filters.q || alert.filters.topic || 'New job matches'}
              </strong>{' '}
              — {alert.frequency === 'instant' ? 'Every 15 minutes' : alert.frequency} ·{' '}
              {alert.status === 'pending' ? 'Awaiting email confirmation' : alert.status}
              {alert.filters.location && <span> · {alert.filters.location}</span>}
              {alert.status !== 'unsubscribed' && (
                <button
                  className="button secondary small"
                  style={{ marginLeft: 12 }}
                  disabled={!!pending}
                  onClick={() => run('cancel', alert.id)}
                >
                  {pending === alert.id ? 'Cancelling…' : 'Unsubscribe'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href="/alerts" className="button secondary">
        Create a job alert
      </Link>
      {message && (
        <p className="flow-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
