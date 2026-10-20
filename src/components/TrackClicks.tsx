'use client';
import { useEffect } from 'react';
import { track } from '@/lib/track';

function elementFrom(target: EventTarget | null) {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function postJobPlace(anchor: HTMLAnchorElement) {
  if (anchor.closest('.site-header')) return 'header';
  if (anchor.closest('.site-footer')) return 'footer';
  if (anchor.closest('[data-city-page]')) return 'city_page';
  if (anchor.closest('[data-topic-page]')) return 'topic_page';
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return 'homepage';
  if (path === '/cities') return 'cities_index';
  return 'other';
}

function outboundContext(anchor: HTMLAnchorElement) {
  if (anchor.closest('.site-footer')) return 'footer';
  const marked = anchor.closest('[data-track-context]')?.getAttribute('data-track-context');
  if (marked === 'register' || marked === 'footer' || marked === 'copy' || marked === 'other')
    return marked;
  if (anchor.closest('.resource-prose, .listing-content, .detail-description')) return 'copy';
  return 'other';
}

function externalHost(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.replace(/^www\./, '');
    const here = window.location.hostname.replace(/^www\./, '');
    if (host === 'eujobs.co' || host === here) return '';
    return host;
  } catch {
    return '';
  }
}

/** Delegated Umami events: post_job_click on post-a-job links, outbound_click on other external https links. */
export default function TrackClicks() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = elementFrom(event.target)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('/submit?kind=job') || (anchor.closest('.site-header') && href === '/submit')) {
        track('post_job_click', { place: postJobPlace(anchor) });
        return;
      }
      if (anchor.dataset.track === 'apply') return;
      const host = externalHost(href);
      if (!host) return;
      track('outbound_click', { host, context: outboundContext(anchor) });
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}
