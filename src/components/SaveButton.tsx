'use client';
import { Bookmark, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useSaved } from './SavedProvider';
import { useRouter, usePathname } from 'next/navigation';
export default function SaveButton({ id }: { id: string; initialSaved?: boolean }) {
  const { ids, authenticated, setSaved } = useSaved();
  const saved = ids.includes(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const path = usePathname();
  async function toggle() {
    if (!authenticated) {
      router.push(`/auth/login?returnTo=${encodeURIComponent(path)}`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id }),
      });
      if (r.status === 401) {
        router.push(`/auth/login?returnTo=${encodeURIComponent(path)}`);
        return;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save');
      setSaved(id, d.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="save-wrap">
      <button
        type="button"
        className={`save-button ${saved ? 'is-saved' : ''}`}
        aria-label={saved ? 'Remove from saved listings' : 'Save listing'}
        title={saved ? 'Saved' : 'Save listing'}
        aria-pressed={saved}
        disabled={busy}
        onClick={toggle}
      >
        {busy ? (
          <LoaderCircle size={19} className="spin" />
        ) : (
          <Bookmark size={19} fill={saved ? 'currentColor' : 'none'} />
        )}
      </button>
      {error && (
        <span className="save-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
