'use client';
import { useEffect } from 'react';
import { track } from '@/lib/track';
export default function TrackView({ name, page }: { name: string; page: string }) {
  useEffect(() => {
    const ready = () => !!(window as unknown as { umami?: unknown }).umami;
    if (ready()) return void track(name, { page });
    let tries = 0;
    const timer = setInterval(() => {
      if (ready() || ++tries > 20) {
        clearInterval(timer);
        track(name, { page });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [name, page]);
  return null;
}
