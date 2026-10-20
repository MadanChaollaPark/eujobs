'use client';
import { useState } from 'react';
import Link from 'next/link';
import './flows.css';
export default function EmailTokenAction({
  token,
  action,
}: {
  token: string;
  action: 'confirm' | 'unsubscribe' | 'verify';
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const label =
    action === 'confirm'
      ? 'Confirm subscription'
      : action === 'unsubscribe'
        ? 'Unsubscribe'
        : 'Verify email';
  async function submit() {
    setPending(true);
    setError('');
    try {
      const response = await fetch(action === 'verify' ? '/api/account-recovery' : '/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'This link could not be used.');
      setMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flow-card auth-card">
      <p className="eyebrow">YOUR EMAIL PREFERENCES</p>
      <h1 className="flow-heading">{label}</h1>
      <p className="muted">
        {action === 'unsubscribe'
          ? 'Confirm that you want to stop this subscription. Your other alerts and account will remain available.'
          : action === 'verify'
            ? 'Confirm ownership of your email address.'
            : 'Confirm that you want to receive these EUJobs emails.'}
      </p>
      {!token ? (
        <p className="flow-error" role="alert">
          This link is missing its token. Open the complete link in your email.
        </p>
      ) : message ? (
        <p className="flow-success" role="status">
          {message}
        </p>
      ) : (
        <button className="button" disabled={pending} onClick={submit}>
          {pending ? 'Please wait…' : label}
        </button>
      )}
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
      <p>
        <Link href={action === 'verify' ? '/account' : '/alerts'}>
          {action === 'verify' ? 'Go to your account' : 'Manage job alerts'}
        </Link>
      </p>
    </div>
  );
}
