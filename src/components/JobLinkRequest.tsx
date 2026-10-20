'use client';
import { useState } from 'react';
import { track } from '@/lib/track';
import { planOffer } from '@/lib/offers';
import { JOB_PLANS, formatJobPrice, isJobPlan, type JobPlan } from '@/lib/plans';
import { EMPLOYMENT_TYPES, SENIORITIES, TOPICS, WORK_MODES } from '@/lib/types';

function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
/** A private placeholder draft: the team formats the real vacancy from the link during review. */
async function linkCheckout(url: string, email: string, organization: string, plan: JobPlan) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const org = (organization || host).slice(0, 120);
  const listing = {
    kind: 'job',
    title: `Vacancy at ${org}`.slice(0, 140),
    organization: org.length >= 2 ? org : host,
    location: 'To be confirmed',
    country: 'Not specified',
    topic: TOPICS[0],
    categorySlug: 'unknown',
    policyTags: [],
    blockAIApplications: false,
    summary: 'Submitted as a job link. The EUJobs team will format this listing before review.',
    description: `Submitted as a job link. Before review, the EUJobs team will format the full vacancy from the employer's public job page: ${url}`,
    sourceUrl: url,
    url,
    timezone: 'Europe/Brussels',
    // Form defaults; the team corrects them from the job page during formatting.
    employmentType: EMPLOYMENT_TYPES[0],
    seniority: SENIORITIES[2],
    workMode: WORK_MODES[1],
  };
  const created = await fetch('/api/guest-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      requestToken: randomToken(),
      contactEmail: email.trim().toLowerCase(),
      listing,
    }),
  });
  const data = await created.json();
  if (!created.ok) throw new Error(data.error || 'We could not save your job link.');
  const checkout = await fetch(`/api/guest-jobs/${data.listing.id}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  const session = await checkout.json();
  if (!checkout.ok) throw new Error(session.error || 'Checkout could not be opened.');
  const target = new URL(session.url);
  if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com')
    throw new Error('Invalid checkout destination. Please contact EUJobs.');
  try {
    sessionStorage.setItem(
      `eujobs:guest-manage:${data.listing.id}`,
      new URL(data.manageUrl, window.location.origin).href,
    );
  } catch {}
  track('checkout_redirect', { plan, source: 'job_link' });
  window.location.assign(target.href);
}
import './flows.css';
export default function JobLinkRequest({ source }: { source: 'submit' | 'pricing' }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const chosen = String(form.get('plan') || '');
    if (isJobPlan(chosen)) track('checkout_started', { plan: chosen, source: 'job_link' });
    try {
      const response = await fetch('/api/job-link-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: String(form.get('url') || ''),
          email: String(form.get('email') || ''),
          organization: String(form.get('organization') || ''),
          source,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your request could not be saved.');
      track('job_link_request', { source });
      if (isJobPlan(chosen)) {
        await linkCheckout(
          String(form.get('url') || ''),
          String(form.get('email') || ''),
          String(form.get('organization') || ''),
          chosen,
        );
        return;
      }
      setDone(data.reference);
    } catch (e) {
      if (isJobPlan(chosen))
        track('checkout_error', {
          plan: chosen,
          source: 'job_link',
          message: e instanceof Error ? e.message.slice(0, 80) : 'connection',
        });
      setError(
        e instanceof Error
          ? `${e.message} We still have your link and will email you.`
          : 'Connection failed. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="flow-card" style={{ marginTop: 24 }} aria-labelledby={`job-link-${source}`}>
      <p className="eyebrow">SHORT ON TIME?</p>
      <h2 id={`job-link-${source}`} className="flow-heading">
        Paste your job link and we&rsquo;ll post it.
      </h2>
      {done ? (
        <p role="status">
          Thanks, we have your link. We will prepare the listing and email you to confirm the plan
          and payment. Reference: <code>{done}</code>
        </p>
      ) : (
        <form onSubmit={submit} className="form-grid">
          <p className="muted">
            Send us the public link to your vacancy and pick a plan. We format the listing from your
            job page and review it before anything is published.
          </p>
          <label>
            Job link
            <input name="url" type="url" required maxLength={2000} placeholder="https://" />
          </label>
          <label>
            Work email
            <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
          <label>
            Organisation (optional)
            <input name="organization" maxLength={150} autoComplete="organization" />
          </label>
          <label>
            Plan
            <select name="plan" defaultValue="basic">
              {(Object.keys(JOB_PLANS) as JobPlan[]).map((id) => (
                <option key={id} value={id}>
                  {JOB_PLANS[id].name} —{' '}
                  {planOffer(id)
                    ? `${planOffer(id)!.label} (was ${formatJobPrice(JOB_PLANS[id].amount)})`
                    : formatJobPrice(JOB_PLANS[id].amount)}
                </option>
              ))}
              <option value="email">Not sure yet: email me first</option>
            </select>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Opening checkout…' : 'Send my job link'}
          </button>
        </form>
      )}
    </section>
  );
}
