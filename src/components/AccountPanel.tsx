'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Listing,
  SavedSearch,
  ContactMessage,
  listingHref,
  SearchFilters,
} from '@/lib/types';
import SubmissionForm from './SubmissionForm';
import { useSaved } from './SavedProvider';
import './flows.css';
import './billing.css';
import { hasJobEntitlement, JOB_PLANS } from '@/lib/plans';
import { listingSourceName } from '@/lib/listing-source';
import BillingPanel, { CheckoutActions } from './BillingPanel';

export type SearchWithMatches = SavedSearch & { matches: Listing[]; total: number };
type Props = {
  user: User;
  owned: Listing[];
  saved: Listing[];
  searches: SearchWithMatches[];
  moderation: Listing[];
  contacts: ContactMessage[];
};
function searchHref(filters: SearchFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '' && !['page', 'pageSize', 'savedIds'].includes(key))
      params.set(key, String(value));
  return `/${filters.kind === 'event' ? 'events' : 'jobs'}?${params}`;
}
function searchDescription(filters: SearchFilters) {
  return (
    Object.entries(filters)
      .filter(
        ([key, value]) =>
          !['page', 'pageSize', 'kind', 'savedIds', 'sort'].includes(key) &&
          value !== undefined &&
          value !== '' &&
          value !== false,
      )
      .map(([key, value]) => (key === 'salaryOnly' ? 'Salary disclosed' : String(value)))
      .join(' · ') || 'All current opportunities'
  );
}
function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AccountPanel(props: Props) {
  const router = useRouter();
  const savedContext = useSaved();
  const [tab, setTab] = useState('saved');
  const [owned, setOwned] = useState(props.owned);
  const [saved, setSaved] = useState(props.saved);
  const [searches, setSearches] = useState(props.searches);
  const [moderation, setModeration] = useState(props.moderation);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  useEffect(() => {
    setOwned(props.owned);
    setSaved(props.saved);
    setSearches(props.searches);
    setModeration(props.moderation);
  }, [props.owned, props.saved, props.searches, props.moderation]);
  async function transition(listing: Listing, action: 'submit' | 'close' | 'approve' | 'reject') {
    setError('');
    setNotice('');
    if (action === 'reject' && (reasons[listing.id] || '').trim().length < 5) {
      setError(
        'Add a short explanation (at least 5 characters) so the submitter knows what to change.',
      );
      return;
    }
    setPending(listing.id);
    try {
      const response = await fetch(`/api/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: listing.version, action, reason: reasons[listing.id] }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'This listing has changed. Reload to review the current version before trying again.'
            : data.error || 'We could not update this listing.',
        );
      const updated: Listing = data.listing;
      setOwned((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setModeration((items) => items.filter((item) => item.id !== updated.id));
      setNotice(
        action === 'approve'
          ? 'Listing approved and published.'
          : action === 'reject'
            ? 'Listing returned with your review note.'
            : action === 'close'
              ? 'Listing closed.'
              : 'Listing submitted for review.',
      );
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed. Please try again.');
    } finally {
      setPending('');
    }
  }
  async function removeSaved(listing: Listing) {
    setPending(listing.id);
    setError('');
    try {
      const response = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update your saved listing.');
      savedContext.setSaved(listing.id, data.saved);
      if (!data.saved) setSaved((items) => items.filter((item) => item.id !== listing.id));
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setPending('');
    }
  }
  async function deleteSearch(id: string) {
    setPending(id);
    setError('');
    try {
      const response = await fetch(`/api/searches?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not delete this search.');
      }
      setSearches((items) => items.filter((item) => item.id !== id));
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setPending('');
    }
  }
  async function logout() {
    setPending('logout');
    setError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      if (!response.ok) throw new Error('Could not sign out. Please try again.');
      router.push('/');
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed.');
      setPending('');
    }
  }
  const tabs = [
    ['saved', `Saved opportunities (${saved.length})`],
    ['searches', `Your searches (${searches.length})`],
    ['submissions', `Your submissions (${owned.length})`],
    ['billing', 'Payments'],
    ...(props.user.role === 'admin'
      ? [
          ['review', `Review queue (${moderation.length})`],
          ['inbox', `Team inbox (${props.contacts.length})`],
        ]
      : []),
  ];

  return (
    <div className="account-panel">
      <header className="account-header">
        <div>
          <p className="eyebrow">YOUR EUJOBS</p>
          <h1 className="page-title">Hello, {props.user.name.split(' ')[0]}.</h1>
          <p className="muted">A little space for your next big move.</p>
        </div>
        <div className="flow-actions">
          <Link className="button" href="/submit?plan=basic">
            Share an opportunity <span aria-hidden="true">+</span>
          </Link>
          <button className="button secondary" onClick={logout} disabled={pending === 'logout'}>
            {pending === 'logout' ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>
      <div className="account-tabs" role="tablist" aria-label="Account sections">
        {tabs.map(([id, label], index) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={tab === id ? 'active' : ''}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              const target =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                )[nextIndex];
              target?.focus();
              target?.click();
            }}
            onClick={() => {
              setTab(id);
              setEditing(null);
              setError('');
              setNotice('');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="flow-success" role="status">
          {notice}
        </p>
      )}
      <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'billing' && <BillingPanel />}
        {tab === 'saved' &&
          (saved.length ? (
            <div className="account-list">
              {saved.map((listing) => (
                <article className="account-listing" key={listing.id}>
                  <div className="account-listing-top">
                    <div>
                      <p className="eyebrow">
                        {listing.kind} · {listing.topic}
                      </p>
                      <h3>
                        <Link href={listingHref(listing)}>{listing.title}</Link>
                      </h3>
                      <p className="muted">
                        {listing.organization} · {listing.location}
                      </p>
                    </div>
                    {listing.isSample && <span className="pill">Sample</span>}
                  </div>
                  <div className="flow-actions">
                    <Link className="button secondary" href={listingHref(listing)}>
                      View details →
                    </Link>
                    <button
                      className="button text-button"
                      disabled={pending === listing.id}
                      onClick={() => removeSaved(listing)}
                    >
                      Remove from saved
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p className="eyebrow">KEEP THE GOOD ONES CLOSE</p>
              <h3>Your next chapter starts with a shortlist.</h3>
              <p>
                Save a role or an event from its detail page. You’ll find it here when you’re ready
                to take the next step.
              </p>
              <div className="flow-actions" style={{ justifyContent: 'center' }}>
                <Link href="/jobs" className="button">
                  Explore jobs
                </Link>
                <Link href="/events" className="button secondary">
                  Discover events
                </Link>
              </div>
            </div>
          ))}
        {tab === 'searches' && (
          <>
            <p className="muted" style={{ marginBottom: 24 }}>
              Current matches for the searches you saved. These are in-app searches; no emails are
              sent.
            </p>
            {searches.length ? (
              <div className="account-list">
                {searches.map((search) => (
                  <article className="account-listing" key={search.id}>
                    <div className="account-search-title">
                      <h3>{search.name}</h3>
                      <span className="pill">
                        {search.total} current {search.total === 1 ? 'match' : 'matches'}
                      </span>
                    </div>
                    <p className="account-search-query">{searchDescription(search.filters)}</p>
                    {search.matches.map((listing) => (
                      <div className="search-match" key={listing.id}>
                        <Link href={listingHref(listing)}>{listing.title}</Link>
                        <span>
                          {listing.organization} · {listing.location}
                        </span>
                      </div>
                    ))}
                    {!search.matches.length && (
                      <p className="muted">
                        No current matches. Broaden your filters or check back for newly published
                        listings.
                      </p>
                    )}
                    <div className="flow-actions">
                      <Link className="button secondary" href={searchHref(search.filters)}>
                        View this search →
                      </Link>
                      <button
                        className="button text-button"
                        disabled={pending === search.id}
                        onClick={() => deleteSearch(search.id)}
                      >
                        Delete search
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>Let your interests lead the way.</h3>
                <p>
                  Filter the jobs or events directory, then save your search. We’ll show its current
                  matches here.
                </p>
                <Link href="/jobs" className="button">
                  Start a search
                </Link>
              </div>
            )}
          </>
        )}
        {tab === 'submissions' &&
          (editing ? (
            <div className="submission-shell">
              <div className="submission-header">
                <h2 className="flow-heading">Edit your {editing.kind}.</h2>
                <p className="muted">
                  Changes are saved as a draft and need review before publication.
                </p>
              </div>
              <SubmissionForm
                key={editing.id}
                initial={editing}
                onCancel={() => setEditing(null)}
                onSaved={(listing) => {
                  setOwned((items) =>
                    items.map((item) => (item.id === listing.id ? listing : item)),
                  );
                  setEditing(null);
                  setNotice(
                    listing.status === 'pending'
                      ? 'Submitted for review.'
                      : 'Draft saved. Submit it for review when you’re ready.',
                  );
                }}
              />
            </div>
          ) : owned.length ? (
            <div className="account-list">
              {owned.map((listing) => (
                <article className="account-listing" key={listing.id}>
                  <div className="account-listing-top">
                    <div>
                      <p className="eyebrow">
                        {listing.kind} · {listing.organization}
                      </p>
                      <h3>{listing.title}</h3>
                      <p className="account-meta">
                        Updated {shortDate(listing.updatedAt)} · version {listing.version}
                      </p>
                    </div>
                    <span className={`status-badge ${listing.status}`}>{listing.status}</span>
                  </div>
                  {listing.publicationOrigin === 'editorial' && (
                    <p className="payment-note">
                      Sourced from {listingSourceName(listing)} · No payment charged
                      {listing.entitlementExpiresAt &&
                        ` · visible until ${shortDate(listing.entitlementExpiresAt)}`}
                    </p>
                  )}
                  {listing.kind === 'job' && listing.publicationOrigin !== 'editorial' && (
                    <p className="payment-note">
                      {hasJobEntitlement(listing)
                        ? `Paid · ${listing.planId ? JOB_PLANS[listing.planId].name : 'Job posting'}${listing.entitlementExpiresAt ? ` · expires ${shortDate(listing.entitlementExpiresAt)}` : ' · 30 days start on approval'}`
                        : listing.paidAt
                          ? 'Posting period ended. Edit the job and pay to renew.'
                          : 'Payment required before review.'}
                    </p>
                  )}
                  {listing.rejectionReason && (
                    <p className="flow-error">Review note: {listing.rejectionReason}</p>
                  )}
                  <div className="flow-actions">
                    {listing.publicationOrigin !== 'editorial' && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setEditing(listing);
                          setNotice('');
                          setError('');
                        }}
                      >
                        Edit listing
                      </button>
                    )}
                    {listing.publicationOrigin !== 'editorial' &&
                      ['draft', 'rejected'].includes(listing.status) &&
                      (listing.kind !== 'job' || hasJobEntitlement(listing)) && (
                        <button
                          className="button"
                          disabled={pending === listing.id}
                          onClick={() => transition(listing, 'submit')}
                        >
                          Submit for review
                        </button>
                      )}
                    {listing.status === 'published' &&
                      (listing.publicationOrigin !== 'editorial' ||
                        props.user.role === 'admin') && (
                        <button
                          className="button secondary"
                          disabled={pending === listing.id}
                          onClick={() => transition(listing, 'close')}
                        >
                          Close listing
                        </button>
                      )}
                    {['published', 'closed'].includes(listing.status) && (
                      <Link className="button text-button" href={listingHref(listing)}>
                        View public page →
                      </Link>
                    )}
                  </div>
                  {listing.publicationOrigin !== 'editorial' &&
                    ['draft', 'rejected'].includes(listing.status) &&
                    listing.kind === 'job' &&
                    !hasJobEntitlement(listing) && <CheckoutActions jobId={listing.id} />}
                  {listing.status === 'pending' && (
                    <p className="field-help" style={{ marginTop: 14 }}>
                      In the review queue. This listing is not public yet.
                    </p>
                  )}
                  {listing.status === 'closed' && (
                    <p className="field-help" style={{ marginTop: 14 }}>
                      {listing.publicationOrigin === 'editorial'
                        ? 'This sourced listing is closed and no longer appears in job results.'
                        : 'To reopen, edit the details and submit the updated draft for review.'}
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>Have something worth sharing?</h3>
              <p>
                Post a role or share an event. Save a draft, send it for review, and manage it here.
              </p>
              <Link href="/submit?plan=basic" className="button">
                Create a listing
              </Link>
            </div>
          ))}
        {tab === 'review' &&
          props.user.role === 'admin' &&
          (moderation.length ? (
            <div className="account-list">
              {moderation.map((listing) => (
                <article className="account-listing" key={listing.id}>
                  <div className="account-listing-top">
                    <div>
                      <p className="eyebrow">
                        {listing.kind} · {listing.organization}
                      </p>
                      <h3>{listing.title}</h3>
                      <p className="account-meta">
                        {listing.location} · {listing.topic} · version {listing.version}
                      </p>
                    </div>
                    <span className="status-badge pending">Pending</span>
                  </div>
                  {listing.kind === 'job' && (
                    <p className="payment-note">
                      Payment:{' '}
                      {hasJobEntitlement(listing)
                        ? `confirmed · ${listing.planId || 'job posting'}`
                        : 'required / expired'}
                      {listing.entitlementExpiresAt
                        ? ` · expiry ${shortDate(listing.entitlementExpiresAt)}`
                        : ' · 30 days start on approval'}
                    </p>
                  )}
                  <p>{listing.summary}</p>
                  <details>
                    <summary>Read full submission</summary>
                    <p className="detail-description">{listing.description}</p>
                    <dl className="detail-facts">
                      {(listing.kind === 'job'
                        ? [
                            ['Contract', listing.employmentType],
                            ['Seniority', listing.seniority],
                            ['Work mode', listing.workMode],
                            [
                              'Salary',
                              listing.salaryMin === null
                                ? 'Not disclosed'
                                : `EUR ${listing.salaryMin}–${listing.salaryMax || listing.salaryMin} / ${listing.salaryPeriod}`,
                            ],
                            ['Deadline', listing.deadline],
                          ]
                        : [
                            ['Starts', listing.startsAt],
                            ['Ends', listing.endsAt],
                            ['Timezone', listing.timezone],
                            ['Venue', listing.venue],
                            [
                              'Price',
                              listing.price === null ? 'Not disclosed' : `EUR ${listing.price}`,
                            ],
                          ]
                      ).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value || 'Not provided'}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                  {listing.url && (
                    <p className="inbox-from">
                      <a href={listing.url} target="_blank" rel="noopener noreferrer">
                        Check application / registration link ↗
                      </a>
                    </p>
                  )}
                  {listing.sourceUrl && (
                    <p className="inbox-from">
                      <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Check source ↗
                      </a>
                    </p>
                  )}
                  <div className="account-reject">
                    <label htmlFor={`reason-${listing.id}`}>Reason if returning for changes</label>
                    <input
                      id={`reason-${listing.id}`}
                      value={reasons[listing.id] || ''}
                      onChange={(event) =>
                        setReasons({ ...reasons, [listing.id]: event.target.value })
                      }
                      maxLength={1000}
                      placeholder="Explain what needs to change"
                    />
                  </div>
                  <div className="flow-actions">
                    <button
                      className="button"
                      disabled={pending === listing.id}
                      onClick={() => transition(listing, 'approve')}
                    >
                      Approve and publish
                    </button>
                    <button
                      className="button secondary"
                      disabled={pending === listing.id}
                      onClick={() => transition(listing, 'reject')}
                    >
                      Return for changes
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>The queue is clear.</h3>
              <p>New submissions will appear here for review before publication.</p>
            </div>
          ))}
        {tab === 'inbox' &&
          props.user.role === 'admin' &&
          (props.contacts.length ? (
            <div className="account-list">
              {props.contacts.map((contact) => (
                <article className="account-listing" key={contact.id}>
                  <p className="account-meta">
                    {shortDate(contact.createdAt)} · {contact.id}
                  </p>
                  <h3>{contact.subject}</h3>
                  <p className="inbox-from">
                    {contact.name} · <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  </p>
                  <p className="inbox-message">{contact.message}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No messages yet.</h3>
              <p>Messages saved through the contact form will appear here.</p>
            </div>
          ))}
      </section>
    </div>
  );
}
