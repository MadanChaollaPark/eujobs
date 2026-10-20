import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'EUJobs — Jobs & events in Europe',
    short_name: 'EUJobs',
    description: 'Find jobs, policy events and useful connections across Europe.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'browser',
    background_color: '#f7f8f2',
    theme_color: '#153e35',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
