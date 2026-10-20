'use client';
import { useState } from 'react';
import { track } from '@/lib/track';
import './flows.css';
export default function NewsletterSignup({ source }: { source: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle');
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('pending');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/newsletter/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') || ''),
          consent: form.get('consent') === 'on',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Your signup could not be saved.');
      track('newsletter_signup', { source });
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Please try again.');
      setState('idle');
    }
  }
  return (
    <section className="flow-card newsletter-signup" aria-labelledby={`newsletter-${source}`}>
      <p className="eyebrow">WEEKLY JOBS NEWSLETTER</p>
      <h2 id={`newsletter-${source}`} className="flow-heading">
        New EU-affairs jobs, once a week.
      </h2>
      {state === 'done' ? (
        <p role="status">Almost done: check your inbox and confirm your subscription.</p>
      ) : (
        <form onSubmit={submit} className="form-grid">
          <label>
            Email
            <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
          <label className="checkbox">
            <input name="consent" type="checkbox" required /> I want to receive the weekly EUJobs
            newsletter. I can unsubscribe at any time.
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={state === 'pending'}>
            {state === 'pending' ? 'Subscribing…' : 'Subscribe'}
          </button>
        </form>
      )}
    </section>
  );
}
