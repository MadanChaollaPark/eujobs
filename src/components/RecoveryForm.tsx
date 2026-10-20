'use client';
import { useState } from 'react';
import Link from 'next/link';
import './flows.css';
export default function RecoveryForm({ token, available }: { token?: string; available: boolean }) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (token && input.password !== input.confirmPassword)
        throw new Error('The passwords do not match.');
      const response = await fetch('/api/account-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          token
            ? { action: 'reset', token, password: input.password }
            : { action: 'request-reset', email: input.email },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'We could not complete this request.');
      setMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flow-card auth-card">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1 className="flow-heading">{token ? 'Choose a new password.' : 'Forgot your password?'}</h1>
      <p className="muted">
        {token
          ? 'Use 12–128 characters. Changing your password signs out every existing session.'
          : 'Enter your account email and we’ll queue a secure reset link.'}
      </p>
      {!available && !token && (
        <p className="flow-error" role="status">
          Email recovery is temporarily unavailable. Please try again later.
        </p>
      )}
      {message ? (
        <p className="flow-success" role="status">
          {message}
        </p>
      ) : (
        <form className="flow-form" onSubmit={submit}>
          {token ? (
            <>
              <label className="field">
                New password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <label className="field">
                Confirm new password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
            </>
          ) : (
            <label className="field">
              Email address
              <input name="email" type="email" required maxLength={254} autoComplete="email" />
            </label>
          )}
          {error && (
            <p className="flow-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={pending || (!token && !available)}>
            {pending ? 'Please wait…' : token ? 'Reset password' : 'Request reset link'}
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link href="/auth/login">Return to sign in</Link>
      </p>
    </div>
  );
}
