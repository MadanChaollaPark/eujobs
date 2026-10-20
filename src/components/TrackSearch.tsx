'use client';
import { useEffect } from 'react';
import { trackWhenReady } from '@/lib/track';

/** Once per /jobs results render. Drops a query that contains @ and truncates the rest. */
export default function TrackSearch({
  query,
  city,
  results,
}: {
  query: string;
  city: string;
  results: number;
}) {
  useEffect(() => {
    const safe = query.includes('@') ? '' : query.slice(0, 80);
    return trackWhenReady('search', { query: safe, city, results });
  }, [query, city, results]);
  return null;
}
