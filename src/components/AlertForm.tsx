'use client';
import { useState } from 'react';
import Link from 'next/link';
import { EMPLOYMENT_TYPES, SENIORITIES, TOPICS, WORK_MODES } from '@/lib/types';
import { CATEGORIES } from '@/lib/categories';
import { track } from '@/lib/track';
import './flows.css';

export default function AlertForm({
  available,
  initial = {},
  city = '',
}: {
  available: boolean;
  initial?: Record<string, string>;
  /** City slug when the form was opened with a prefilled location. */
  city?: string;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [newsletter, setNewsletter] = useState(initial.kind === 'newsletter');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget),
      input = Object.fromEntries(data);
    try {
      const payload = newsletter
        ? {
            email: input.email,
            consent: data.has('consent'),
            kind: 'newsletter',
            frequency: 'weekly',
          }
        : {
            ...input,
            consent: data.has('consent'),
            salaryOnly: data.has('salaryOnly'),
            kind: 'alert',
          };
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'We could not save your alert.');
      if (!newsletter) track('alert_signup', { city, ok: true });
      setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Please try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flow-card">
      <p className="eyebrow">A LITTLE LESS SEARCHING</p>
      <h1 className="flow-heading">The right opportunities, in your inbox.</h1>
      <p className="muted">
        Choose your interests and confirm your email. We’ll send new published jobs that match, with
        an unsubscribe link in every email.
      </p>
      {!available && (
        <p className="flow-error" role="status">
          Email subscriptions are temporarily unavailable. You can still browse and save searches in
          your account.
        </p>
      )}
      <form className="flow-form" onSubmit={submit}>
        <label className="field">
          Updates
          <select
            value={newsletter ? 'newsletter' : 'alert'}
            onChange={(e) => setNewsletter(e.target.value === 'newsletter')}
          >
            <option value="alert">Personal job alert</option>
            <option value="newsletter">Weekly jobs newsletter</option>
          </select>
        </label>
        <label className="field">
          Email address
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            defaultValue={initial.email || ''}
          />
        </label>
        {!newsletter && (
          <>
            <div className="form-grid">
              <label className="field">
                Keywords
                <input
                  name="q"
                  maxLength={200}
                  placeholder="Policy, research, climate…"
                  defaultValue={initial.q || ''}
                />
              </label>
              <label className="field">
                City or country
                <input
                  name="location"
                  maxLength={100}
                  placeholder="Brussels, Belgium…"
                  defaultValue={initial.location || ''}
                />
              </label>
            </div>
            <div className="form-grid">
              {(
                [
                  ['topic', 'Topic', TOPICS],
                  ['workMode', 'Work arrangement', WORK_MODES],
                  ['employmentType', 'Contract', EMPLOYMENT_TYPES],
                  ['seniority', 'Experience', SENIORITIES],
                ] as const
              ).map(([name, label, values]) => (
                <label className="field" key={name}>
                  {label}
                  <select name={name} defaultValue={initial[name] || ''}>
                    <option value="">Any</option>
                    {values.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="field">
              Frequency
              <select name="frequency" defaultValue={initial.frequency || 'daily'}>
                <option value="instant">As new jobs appear (checked every 15 minutes)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="field">
              Employer sector
              <select name="categorySlug" defaultValue={initial.categorySlug || ''}>
                <option value="">Any sector</option>
                {CATEGORIES.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            {initial.organizationId && (
              <input type="hidden" name="organizationId" value={initial.organizationId} />
            )}
            <label>
              <input type="checkbox" name="salaryOnly" style={{ width: 'auto', marginRight: 8 }} />
              Only jobs with a published salary
            </label>
          </>
        )}
        <label>
          <input
            type="checkbox"
            name="consent"
            required
            style={{ width: 'auto', marginRight: 8 }}
          />
          I want to receive {newsletter ? 'the weekly jobs newsletter' : 'these job alerts'} by
          email. I can unsubscribe at any time.
        </label>
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
        <button className="button" disabled={pending || !available}>
          {pending ? 'Saving…' : 'Email me a confirmation link'}
        </button>
        <p className="field-help">
          Submitting this form queues a confirmation email. Your subscription starts only after you
          confirm. <Link href="/privacy">Privacy policy</Link>
        </p>
      </form>
    </div>
  );
}
