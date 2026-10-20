'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bookmark, Check, LoaderCircle } from 'lucide-react';
import type { ListingKind } from '@/lib/types';
export default function SaveSearchButton({ kind }: { kind: ListingKind }) {
  const p = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const filters: Record<string, unknown> = { kind };
      for (const [k, v] of p) {
        if (
          [
            'q',
            'location',
            'topic',
            'categorySlug',
            'policyTag',
            'workMode',
            'employmentType',
            'seniority',
            'eventType',
            'from',
            'to',
          ].includes(k)
        )
          filters[k] = v;
        if (k === 'salaryOnly') filters[k] = v === 'true';
      }
      const name =
        [p.get('q'), p.get('topic'), p.get('location')].filter(Boolean).join(' · ') ||
        `All ${kind === 'job' ? 'jobs' : 'events'}`;
      const r = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters }),
      });
      if (r.status === 401) {
        router.push(
          `/auth/login?returnTo=${encodeURIComponent('/' + (kind === 'job' ? 'jobs' : 'events') + '?' + p)}`,
        );
        return;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStatus('Saved — view matches in your account.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not save search');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="save-search">
      <button
        className="button secondary button-small"
        disabled={busy || status.startsWith('Saved')}
        onClick={save}
      >
        {busy ? (
          <LoaderCircle className="spin" size={15} />
        ) : status.startsWith('Saved') ? (
          <Check size={15} />
        ) : (
          <Bookmark size={15} />
        )}
        Save this search
      </button>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
