'use client';
import { track, trackWhenReady } from '@/lib/track';
import { planOffer } from '@/lib/offers';
import { countryFromLocation, deriveSummary } from '@/lib/form-helpers';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Listing,
  ListingKind,
  TOPICS,
  WORK_MODES,
  EMPLOYMENT_TYPES,
  SENIORITIES,
  EVENT_TYPES,
} from '@/lib/types';
import './flows.css';
import './billing.css';
import { JOB_PLANS, formatJobPrice, hasJobEntitlement, type JobPlan } from '@/lib/plans';
import { CATEGORIES } from '@/lib/categories';
import { PlanPicker, startJobCheckout } from './BillingPanel';

const GUEST_DRAFT_KEY = 'eujobs:guest-draft';
type GuestDraft = {
  requestId: string;
  requestToken: string;
  contactEmail: string;
  listing: Partial<Listing>;
};

function checkedManageUrl(value: string, id: string) {
  const url = new URL(value, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    url.pathname !== `/manage-job/${id}` ||
    url.search ||
    !/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash)
  )
    throw new Error('The private management link could not be verified. Please contact EUJobs.');
  return url;
}

async function startGuestCheckout(id: string, plan: JobPlan) {
  const response = await fetch(`/api/guest-jobs/${id}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'Checkout could not be opened. Your draft is saved.');
  const url = new URL(data.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com')
    throw new Error('Invalid checkout destination. Please contact EUJobs.');
  track('checkout_redirect', { plan });
  window.location.assign(url.href);
}

function wallTime(value: string | null, timezone: string) {
  if (!value) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const v = (key: string) => p.find((part) => part.type === key)?.value;
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}

function zonedISO(value: string, timezone: string) {
  if (!value) return null;
  const naive = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(naive)) throw new Error('Choose a valid event date and time.');
  const offsets = [-86400000, 0, 86400000].map((delta) => {
    const probe = naive + delta;
    return Date.parse(`${wallTime(new Date(probe).toISOString(), timezone)}:00Z`) - probe;
  });
  const candidates = [...new Set(offsets.map((offset) => naive - offset))].filter(
    (time) => wallTime(new Date(time).toISOString(), timezone) === value,
  );
  if (candidates.length !== 1)
    throw new Error(
      'This event time falls within a clock change. Select an unambiguous time, or enter it using the UTC timezone.',
    );
  return new Date(candidates[0]).toISOString();
}

export default function SubmissionForm({
  initial,
  defaultKind = 'job',
  guest = false,
  defaultPlan,
  onSaved,
  onCancel,
}: {
  initial?: Listing;
  defaultKind?: ListingKind;
  guest?: boolean;
  defaultPlan?: JobPlan;
  onSaved?: (listing: Listing) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [listing, setListing] = useState(initial);
  const [kind, setKind] = useState<ListingKind>(guest ? 'job' : initial?.kind || defaultKind);
  const [timezone, setTimezone] = useState(initial?.timezone || 'Europe/Brussels');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState<JobPlan>(defaultPlan || 'basic');
  const [savedGuestDraft, setSavedGuestDraft] = useState<GuestDraft | null>(null);
  const [draftReady, setDraftReady] = useState(true);
  const [restoreKey, setRestoreKey] = useState(0);
  const formStarted = useRef(false);
  const [manageUrl, setManageUrl] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const requestAttempt = useRef<GuestDraft | null>(null);
  const defaults = initial || savedGuestDraft?.listing;
  const needsPayment =
    kind === 'job' && (!listing || !hasJobEntitlement(listing) || listing.status === 'closed');

  useEffect(() => {
    if (!guest) return;
    try {
      if (initial) {
        const stored = sessionStorage.getItem(`eujobs:guest-manage:${initial.id}`);
        if (stored) setManageUrl(checkedManageUrl(stored, initial.id).href);
      } else {
        const stored = sessionStorage.getItem(GUEST_DRAFT_KEY);
        if (stored) {
          const draft: GuestDraft = JSON.parse(stored);
          if (
            typeof draft.requestId === 'string' &&
            /^[0-9a-f-]{36}$/i.test(draft.requestId) &&
            typeof draft.requestToken === 'string' &&
            /^[A-Za-z0-9_-]{43}$/.test(draft.requestToken) &&
            typeof draft.contactEmail === 'string' &&
            draft.listing?.kind === 'job'
          ) {
            requestAttempt.current = draft;
            setSavedGuestDraft(draft);
            // Remount the uncontrolled inputs so they show the restored values.
            setRestoreKey((value) => value + 1);
          }
        }
      }
    } catch {
      // A blocked or stale browser store must not prevent reading the form.
    }
    setDraftReady(true);
  }, [guest, initial]);
  useEffect(() => {
    if (kind === 'job' && !initial) return trackWhenReady('form_view', { guest });
  }, [kind, initial, guest]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') || 'save';
    const string = (key: string) => String(form.get(key) || '').trim();
    const optional = (key: string) => string(key) || null;
    const number = (key: string) => (string(key) ? Number(string(key)) : null);
    const startsCheckout = intent === 'submit' && kind === 'job' && needsPayment;
    if (startsCheckout) track('checkout_started', { plan, guest });
    try {
      if (intent === 'submit' && !string('url'))
        throw new Error(
          kind === 'job'
            ? 'Add an application URL before submitting for review.'
            : 'Add a registration or event URL before submitting for review.',
        );
      const input = {
        kind,
        title: string('title'),
        organization: string('organization'),
        location: string('location'),
        country: countryFromLocation(string('location'), defaults?.country),
        topic: string('topic'),
        categorySlug: string('categorySlug') || 'unknown',
        policyTags: string('policyTags')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        blockAIApplications: form.get('blockAIApplications') === 'on',
        summary: deriveSummary(string('summary'), string('description')),
        description: string('description'),
        sourceUrl: optional('sourceUrl'),
        url: optional('url'),
        employmentType: kind === 'job' ? string('employmentType') : null,
        seniority: kind === 'job' ? string('seniority') : null,
        workMode: kind === 'job' ? string('workMode') : null,
        salaryMin: kind === 'job' ? number('salaryMin') : null,
        salaryMax: kind === 'job' ? number('salaryMax') : null,
        salaryPeriod:
          kind === 'job' && number('salaryMin') !== null
            ? string('salaryPeriod') === 'month'
              ? ('month' as const)
              : ('year' as const)
            : null,
        deadline: kind === 'job' ? string('deadline') || null : null,
        startsAt: kind === 'event' ? zonedISO(string('startsAt'), timezone) : null,
        endsAt: kind === 'event' ? zonedISO(string('endsAt'), timezone) : null,
        timezone,
        eventType: kind === 'event' ? string('eventType') : null,
        venue: kind === 'event' ? optional('venue') : null,
        price: kind === 'event' ? number('price') : null,
      };
      let body: object = listing ? { ...input, action: 'save', version: listing.version } : input;
      if (guest && !listing) {
        const contactEmail = string('contactEmail').toLowerCase();
        if (
          requestAttempt.current &&
          requestAttempt.current.contactEmail.toLowerCase() !== contactEmail
        )
          throw new Error(
            'Retry with the billing email from your saved draft. Its earlier request may already have been saved.',
          );
        const requestId = requestAttempt.current?.requestId || crypto.randomUUID();
        const requestToken =
          requestAttempt.current?.requestToken ||
          btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
        const draft = requestAttempt.current || {
          requestId,
          requestToken,
          contactEmail,
          listing: input,
        };
        try {
          sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft));
        } catch {
          throw new Error(
            'Allow browser storage for EUJobs so your private draft can be saved, then try again.',
          );
        }
        requestAttempt.current = draft;
        body = draft;
      }
      const endpoint = guest ? '/api/guest-jobs' : '/api/listings';
      const response = await fetch(listing ? `${endpoint}/${listing.id}` : endpoint, {
        method: listing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        if (guest && !listing && response.status === 400) {
          requestAttempt.current = null;
          try {
            sessionStorage.removeItem(GUEST_DRAFT_KEY);
          } catch {}
        }
        throw new Error(
          response.status === 409
            ? listing
              ? 'This listing changed in another session. Reload the page to get the current version before saving.'
              : data.error ||
                'The saved draft request has changed. Reload to restore it before retrying.'
            : data.error || 'We could not save your draft.',
        );
      }
      let updated: Listing = data.listing;
      setListing(updated);
      if (guest && !listing) {
        const privateUrl = checkedManageUrl(data.manageUrl, updated.id);
        setManageUrl(privateUrl.href);
        // Keep the back/retry destination on the saved job before leaving for Stripe.
        window.history.replaceState(null, '', privateUrl.pathname);
        try {
          sessionStorage.setItem(`eujobs:guest-manage:${updated.id}`, privateUrl.href);
          sessionStorage.removeItem(GUEST_DRAFT_KEY);
        } catch {
          // The access cookie still permits this browser to reopen the management page.
        }
        if (JSON.stringify(requestAttempt.current?.listing) !== JSON.stringify(input)) {
          const refreshed = await fetch(`${endpoint}/${updated.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...input, action: 'save', version: updated.version }),
          });
          const refreshedData = await refreshed.json();
          if (!refreshed.ok)
            throw new Error(
              refreshedData.error ||
                'Your original draft is saved. Retry to save your latest changes.',
            );
          updated = refreshedData.listing;
          setListing(updated);
        }
      }
      if (intent === 'submit' && kind === 'job' && !hasJobEntitlement(updated)) {
        if (guest) await startGuestCheckout(updated.id, plan);
        else await startJobCheckout(updated.id, plan);
        return;
      }
      if (intent === 'submit') {
        const submitted = await fetch(`${endpoint}/${updated.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit', version: updated.version }),
        });
        const submittedData = await submitted.json();
        if (!submitted.ok)
          throw new Error(
            `Your draft is saved. ${submittedData.error || 'Submission failed; please try again.'}`,
          );
        updated = submittedData.listing;
        setListing(updated);
      }
      setMessage(
        intent === 'submit'
          ? 'Submitted for review. Your listing will appear publicly after approval.'
          : guest
            ? 'Draft saved. Keep your private management link to return to it.'
            : 'Draft saved. You can return to it from your account.',
      );
      onSaved?.(updated);
      if (!guest) router.refresh();
    } catch (error) {
      if (startsCheckout)
        track('checkout_error', {
          plan,
          message: error instanceof Error ? error.message.slice(0, 80) : 'connection',
        });
      setError(
        error instanceof Error
          ? error.message
          : 'Connection failed. Your entered details are still here; please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!draftReady) return <p role="status">Loading your draft…</p>;

  return (
    <form
      key={restoreKey}
      className="flow-card flow-form"
      onSubmit={save}
      onFocusCapture={() => {
        if (formStarted.current || kind !== 'job') return;
        formStarted.current = true;
        track('form_start', { guest });
      }}
      onInvalidCapture={(event) => {
        const field = (event.target as HTMLInputElement).name || 'unknown';
        track('validation_error', { field });
      }}
    >
      {!listing && guest ? (
        <div>
          <p className="payment-note">
            Post a job without an account. Your private link lets you manage it later.
          </p>
          <p className="field-help">
            <Link href="/submit?kind=event">
              Sharing an event? Events are free to submit; sign in first.
            </Link>
          </p>
          {savedGuestDraft && (
            <p className="notice">Your unfinished job draft has been restored in this browser.</p>
          )}
        </div>
      ) : !listing ? (
        <div className="kind-toggle" aria-label="Listing type">
          <button
            type="button"
            className={kind === 'job' ? 'active' : ''}
            aria-pressed={kind === 'job'}
            onClick={() => setKind('job')}
          >
            <strong>Post a job</strong>
            <span>Connect with people who care.</span>
          </button>
          <button
            type="button"
            className={kind === 'event' ? 'active' : ''}
            aria-pressed={kind === 'event'}
            onClick={() => setKind('event')}
          >
            <strong>Share an event</strong>
            <span>Bring the community together.</span>
          </button>
        </div>
      ) : (
        <div className="submission-status">
          <span className={`status-badge ${listing.status}`}>{listing.status}</span>
          <span className="muted">
            {kind === 'job' ? 'Job listing' : 'Event'} · version {listing.version}
          </span>
        </div>
      )}
      {listing && (listing.status === 'published' || listing.status === 'pending') && (
        <p className="notice">
          Saving an edit returns this listing to draft. Submit the updated version for review to
          publish it again.
        </p>
      )}
      {listing?.rejectionReason && (
        <p className="flow-error">Reviewer’s note: {listing.rejectionReason}</p>
      )}
      {guest && !listing && (
        <label className="field">
          Billing contact email
          <input
            name="contactEmail"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            readOnly={!!requestAttempt.current}
            defaultValue={savedGuestDraft?.contactEmail || ''}
            placeholder="you@your-organisation.eu"
          />
          <span className="field-help">
            Used for billing, your private job management link and support. It is not shown on the
            listing.
          </span>
        </label>
      )}
      <label className="field">
        {kind === 'job' ? 'Job title' : 'Event title'}
        <input
          name="title"
          required
          minLength={4}
          maxLength={140}
          defaultValue={defaults?.title}
          placeholder={
            kind === 'job' ? 'Senior Policy Officer' : 'The next chapter of European climate policy'
          }
        />
      </label>
      <label className="field">
        Organisation
        <input
          name="organization"
          required
          minLength={2}
          maxLength={120}
          defaultValue={defaults?.organization}
          placeholder="Your organisation’s name"
        />
      </label>
      <label className="field">
        City or location
        <input
          name="location"
          required
          maxLength={100}
          defaultValue={defaults?.location || 'Brussels'}
          placeholder="Brussels or Remote"
        />
        <span className="field-help">We fill in the country for you.</span>
      </label>
      <label className="field">
        Policy area
        <select name="topic" required defaultValue={defaults?.topic || TOPICS[0]}>
          {TOPICS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Short introduction (optional)
        <textarea
          name="summary"
          maxLength={300}
          rows={3}
          defaultValue={defaults?.summary}
          placeholder="One or two lines for the listing card. Leave blank and we use the start of the description."
        />
      </label>
      <label className="field">
        {kind === 'job' ? 'About the role' : 'About the event'}
        <textarea
          name="description"
          required
          minLength={kind === 'job' ? 30 : 80}
          maxLength={20000}
          rows={9}
          defaultValue={defaults?.description}
          placeholder={
            kind === 'job'
              ? 'Describe the work, the team, requirements, and how to apply. At least 30 characters.'
              : 'Describe the programme, audience, speakers, and attendance details. At least 80 characters.'
          }
        />
      </label>
      {kind === 'job' ? (
        <fieldset className="form-section">
          <legend>The details</legend>
          <div className="form-grid">
            <label className="field">
              Contract
              <select
                name="employmentType"
                defaultValue={defaults?.employmentType || EMPLOYMENT_TYPES[0]}
              >
                {EMPLOYMENT_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Experience
              <select name="seniority" defaultValue={defaults?.seniority || SENIORITIES[2]}>
                {SENIORITIES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              Work arrangement
              <select name="workMode" defaultValue={defaults?.workMode || WORK_MODES[1]}>
                {WORK_MODES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Application deadline (Brussels date, optional)
              <input
                type="date"
                name="deadline"
                defaultValue={wallTime(defaults?.deadline || null, 'Europe/Brussels').slice(0, 10)}
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              Salary minimum, EUR (optional)
              <input
                name="salaryMin"
                type="number"
                min="0"
                step="1"
                defaultValue={defaults?.salaryMin ?? ''}
              />
            </label>
            <label className="field">
              Salary maximum, EUR (optional)
              <input
                name="salaryMax"
                type="number"
                min="0"
                step="1"
                defaultValue={defaults?.salaryMax ?? ''}
              />
            </label>
          </div>
          <label className="field">
            Salary period
            <select name="salaryPeriod" defaultValue={defaults?.salaryPeriod || 'year'}>
              <option value="year">Per year</option>
              <option value="month">Per month</option>
            </select>
          </label>
        </fieldset>
      ) : (
        <fieldset className="form-section">
          <legend>When and where</legend>
          <div className="form-grid">
            <label className="field">
              Event format
              <select name="eventType" defaultValue={defaults?.eventType || EVENT_TYPES[0]}>
                {EVENT_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Timezone
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                {[
                  ...new Set(
                    ['Europe/Brussels', 'Europe/London', 'UTC', defaults?.timezone].filter(Boolean),
                  ),
                ].map((value) => (
                  <option key={value} value={value}>
                    {value?.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              Starts (local time)
              <input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={wallTime(defaults?.startsAt || null, defaults?.timezone || timezone)}
              />
            </label>
            <label className="field">
              Ends (local time)
              <input
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={wallTime(defaults?.endsAt || null, defaults?.timezone || timezone)}
              />
            </label>
          </div>
          <p className="field-help">
            Enter both times in the selected timezone. Calendar downloads preserve the event’s
            actual start and end.
          </p>
          <div className="form-grid">
            <label className="field">
              Venue or online platform
              <input
                name="venue"
                maxLength={200}
                defaultValue={defaults?.venue || ''}
                placeholder="Venue name and address, or online"
              />
            </label>
            <label className="field">
              Admission, EUR (optional)
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaults?.price ?? ''}
                placeholder="0 for free; leave blank if unknown"
              />
            </label>
          </div>
        </fieldset>
      )}
      <fieldset className="form-section">
        <legend>Help the right people find you</legend>
        <label className="field">
          Organization category
          <select name="categorySlug" defaultValue={defaults?.categorySlug || 'unknown'}>
            {CATEGORIES.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Policy tags (optional)
          <input
            name="policyTags"
            defaultValue={defaults?.policyTags?.join(', ') || ''}
            maxLength={246}
            placeholder="Climate, digital policy, competition"
          />
          <span className="field-help">Up to four topics, separated by commas.</span>
        </label>
        {kind === 'job' && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="blockAIApplications"
              defaultChecked={defaults?.blockAIApplications || false}
            />
            Request personally written applications
            <span className="field-help">
              Displays your preference to candidates. EUJobs cannot detect or block AI-written
              applications.
            </span>
          </label>
        )}
      </fieldset>
      <fieldset className="form-section">
        <legend>Where to take the next step</legend>
        <label className="field">
          {kind === 'job' ? 'Application URL' : 'Registration or event URL'}
          <input
            name="url"
            type="url"
            maxLength={2000}
            defaultValue={defaults?.url || ''}
            placeholder="https://your-organisation.eu/…"
          />
          <span className="field-help">
            Required before review. Use the official destination for this opportunity.
          </span>
        </label>
        <label className="field">
          Source URL (optional)
          <input
            name="sourceUrl"
            type="url"
            maxLength={2000}
            defaultValue={defaults?.sourceUrl || ''}
            placeholder="https://…"
          />
          <span className="field-help">
            A source that helps the team check the details, if different from the application or
            registration page.
          </span>
        </label>
      </fieldset>
      {needsPayment && <PlanPicker value={plan} onChange={setPlan} />}
      {kind === 'job' && !needsPayment && (
        <p className="payment-note">
          Payment confirmed.{' '}
          {listing?.entitlementExpiresAt
            ? `Posting expires ${new Date(listing.entitlementExpiresAt).toLocaleDateString('en-GB')}. Editing does not extend this date.`
            : 'Your 30 days start after approval.'}
        </p>
      )}
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <div className="flow-success" role="status">
          {message} {!guest && <Link href="/account">View your account →</Link>}
        </div>
      )}
      {guest && manageUrl && (
        <div className="form-section">
          <label className="field">
            Your private management link
            <input
              type="text"
              readOnly
              value={manageUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <span className="field-help">
              Keep this link somewhere safe. Anyone with it can manage this job.
            </span>
          </label>
          <div className="flow-actions">
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(manageUrl);
                  setLinkCopied(true);
                } catch {
                  setError('Select and copy the private link above.');
                }
              }}
            >
              {linkCopied ? 'Link copied' : 'Copy private link'}
            </button>
            {/* A query change loads the page even after replaceState set its pathname. */}
            <a href={manageUrl.replace('#', '?view=manage#')} className="button secondary">
              Open job management →
            </a>
          </div>
        </div>
      )}
      <div className="flow-actions">
        <button className="button" name="intent" value="submit" disabled={pending}>
          {pending
            ? 'Saving…'
            : needsPayment
              ? planOffer(plan)?.amount === 0
                ? 'Publish my free listing'
                : planOffer(plan)
                  ? `Continue to payment — ${planOffer(plan)!.label}`
                  : `Continue to payment — ${formatJobPrice(JOB_PLANS[plan].amount)}`
              : 'Submit for review'}
        </button>
        <button className="button secondary" name="intent" value="save" disabled={pending}>
          Save draft
        </button>
        {onCancel && (
          <button
            className="button text-button"
            type="button"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        )}
      </div>
      <p className="field-help">
        {kind === 'event'
          ? 'Events are free to submit from your signed-in account.'
          : planOffer(plan)?.amount === 0
            ? 'Stripe shows a €0 total for your free listing; no card is needed.'
            : 'Job payment is confirmed securely by Stripe.'}{' '}
        Only reviewed, approved listings appear publicly. If we don&rsquo;t publish your job, you
        get a <Link href="/refund">full refund</Link>.
      </p>
      {kind === 'job' && (
        <p className="field-help">
          Prefer email? Send us the job link at{' '}
          <a href="mailto:eujobs@mail.grokbot.com">eujobs@mail.grokbot.com</a>.
        </p>
      )}
    </form>
  );
}
