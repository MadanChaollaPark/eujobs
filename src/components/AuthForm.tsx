'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import './flows.css';

export function safeReturnTo(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value))
    return '/account';
  try {
    const parsed = new URL(value, 'https://eujobs.local');
    if (
      parsed.origin !== 'https://eujobs.local' ||
      parsed.pathname.startsWith('/api/') ||
      parsed.pathname.startsWith('/auth/')
    )
      return '/account';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/account';
  }
}

export default function AuthForm({
  mode,
  returnTo,
}: {
  mode: 'login' | 'register';
  returnTo?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const destination = safeReturnTo(returnTo);
  const register = mode === 'register';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, action: mode }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'We could not sign you in. Please try again.');
      router.push(destination);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flow-card auth-card">
      <div className="auth-monogram" aria-hidden="true">
        eu.
      </div>
      <p className="eyebrow">YOUR NEXT CHAPTER</p>
      <h1 className="flow-heading">
        {register ? 'Make room for what’s next.' : 'Good to have you back.'}
      </h1>
      <p className="muted">
        {register
          ? 'Save opportunities, follow searches, and share your own jobs and events.'
          : 'Your saved opportunities and submissions, in one place.'}
      </p>
      <form className="flow-form" onSubmit={submit}>
        {register && (
          <label className="field">
            Your name
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Alex Morgan"
            />
          </label>
        )}
        <label className="field">
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          Password
          <input
            name="password"
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            required
            minLength={register ? 12 : undefined}
            maxLength={128}
            aria-describedby={register ? 'password-help' : undefined}
          />
        </label>
        {register && (
          <p id="password-help" className="field-help">
            Use at least 12 characters. A few memorable words work well.
          </p>
        )}
        {error && (
          <p className="flow-error" role="alert">
            {error}
          </p>
        )}
        <button className="button full-width" disabled={pending}>
          {pending ? 'Please wait…' : register ? 'Create your account' : 'Sign in'}
        </button>
      </form>
      {!register && (
        <p className="auth-switch">
          <Link href="/auth/recovery">Forgot your password?</Link>
        </p>
      )}
      <p className="auth-switch">
        {register ? 'Already have an account?' : 'New to EUJobs?'}{' '}
        <Link
          href={`/auth/${register ? 'login' : 'register'}?returnTo=${encodeURIComponent(destination)}`}
        >
          {register ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}
