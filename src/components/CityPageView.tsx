'use client';
import { useEffect } from 'react';
import { trackWhenReady } from '@/lib/track';

/** One city_page_view per city page load. Umami already records the pageview. */
export default function CityPageView({ city }: { city: string }) {
  useEffect(() => trackWhenReady('city_page_view', { city }), [city]);
  return null;
}
