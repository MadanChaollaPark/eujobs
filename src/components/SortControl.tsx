'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ListingKind } from '@/lib/types';
export default function SortControl({ kind }: { kind: ListingKind }) {
  const p = useSearchParams();
  const r = useRouter();
  return (
    <label className="sort-control">
      <span>Sort by</span>
      <select
        aria-label="Sort listings"
        value={p.get('sort') || (kind === 'job' ? 'recent' : 'soonest')}
        onChange={(e) => {
          const n = new URLSearchParams(p);
          n.set('sort', e.target.value);
          n.delete('page');
          r.push(`/${kind === 'job' ? 'jobs' : 'events'}?${n}`, { scroll: false });
        }}
      >
        {kind === 'job' ? (
          <>
            <option value="recent">Most recent</option>
            <option value="salary">Highest salary</option>
            <option value="deadline">Closing soon</option>
          </>
        ) : (
          <>
            <option value="soonest">Soonest first</option>
            <option value="recent">Recently added</option>
          </>
        )}
      </select>
    </label>
  );
}
