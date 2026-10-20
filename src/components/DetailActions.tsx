'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, ArrowUpRight, ArrowDown, Mail, CalendarPlus } from 'lucide-react';
import { useSaved } from './SavedProvider';
import './flows.css';
import { applicationTarget } from './ListingContent';
import { track } from '@/lib/track';
export default function DetailActions({
  id,
  slug,
  kind,
  href,
  isSample,
  live,
  signedIn,
  initiallySaved,
  returnTo,
  editorial = false,
  organizerEvent = false,
  applicationMethod,
  hasApplicationInstructions = false,
  city = '',
}: {
  id: string;
  slug: string;
  kind: 'job' | 'event';
  href: string | null;
  isSample: boolean;
  live: boolean;
  signedIn: boolean;
  initiallySaved: boolean;
  returnTo: string;
  editorial?: boolean;
  organizerEvent?: boolean;
  applicationMethod?: 'url' | 'email' | 'instructions' | null;
  hasApplicationInstructions?: boolean;
  city?: string;
}) {
  const router = useRouter();
  const savedContext = useSaved();
  const saved = signedIn ? savedContext.ids.includes(id) : initiallySaved;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id }),
      });
      if (response.status === 401) {
        router.push(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'We could not update your saved opportunities.');
      savedContext.setSaved(id, data.saved);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed. Please try again.');
    } finally {
      setPending(false);
    }
  }
  const target = applicationTarget({
    href,
    kind,
    editorial,
    organizerEvent,
    method: applicationMethod,
  });
  const employerHost = (value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return url.hostname;
    } catch {
      return '';
    }
  };
  return (
    <div className="detail-actions">
      {!isSample && live && target && (
        <a
          className="button"
          href={target.href}
          target={target.email ? undefined : '_blank'}
          rel={target.email ? undefined : 'noopener noreferrer'}
          data-track={kind === 'job' ? 'apply' : undefined}
          onClick={
            kind === 'job'
              ? () => track('apply_click', { job_id: id, city, host: employerHost(target.href) })
              : undefined
          }
        >
          {target.label} {target.email ? <Mail size={15} /> : <ArrowUpRight size={15} />}
        </a>
      )}
      {!isSample && live && !target && hasApplicationInstructions && (
        <a className="button" href="#how-to-apply">
          How to apply <ArrowDown size={15} />
        </a>
      )}
      {isSample ? (
        <p className="detail-sample">
          This is a sample {kind === 'job' ? 'role' : 'event'} showing how EUJobs works.{' '}
          {kind === 'job' ? 'Applications' : 'Registrations'} are unavailable.
        </p>
      ) : !live ? (
        <p className="notice">
          {kind === 'job'
            ? 'This role is closed to applications.'
            : 'This event is no longer upcoming.'}
        </p>
      ) : !target && !hasApplicationInstructions ? (
        <p className="detail-source">
          {editorial && kind === 'job'
            ? 'Application instructions are not available for this vacancy yet.'
            : `${kind === 'job' ? 'An application link' : 'A registration link'} has not been provided.`}
        </p>
      ) : null}
      {kind === 'event' && (
        <a className="button secondary" href={`/api/events/${encodeURIComponent(slug)}/calendar`}>
          <CalendarPlus size={16} /> Add to calendar
        </a>
      )}
      {signedIn ? (
        <button
          type="button"
          className="button secondary"
          onClick={toggle}
          disabled={pending}
          aria-pressed={saved}
        >
          {saved ? <Check size={16} /> : <Bookmark size={16} />}
          {pending ? 'Updating…' : saved ? 'Saved to your account' : `Save this ${kind}`}
        </button>
      ) : (
        <Link
          className="button secondary"
          href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
        >
          <Bookmark size={16} /> Sign in to save
        </Link>
      )}
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
