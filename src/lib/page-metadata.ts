import type { Metadata } from 'next';

/** Keep search results and link previews aligned with the page being shared. */
export function pageMetadata(
  title: string,
  description: string,
  canonical: string,
  options: { article?: boolean; noIndex?: boolean } = {},
): Metadata {
  const bareTitle = title.replace(/\s*\|\s*EUJobs\s*$/i, '').trim() || title;
  const summary = description.replace(/\s+/g, ' ').trim();
  const socialTitle = `${bareTitle} | EUJobs`;
  return {
    title: bareTitle,
    description: summary,
    alternates: { canonical },
    ...(options.noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: socialTitle,
      description: summary,
      url: canonical,
      siteName: 'EUJobs',
      type: options.article ? 'article' : 'website',
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'EUJobs' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: summary,
      images: ['/opengraph-image'],
    },
  };
}
