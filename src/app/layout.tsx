import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth';
import './globals.css';
import './resources.css';
import { getSavedIds } from '@/lib/store';
import { SavedProvider } from '@/components/SavedProvider';
import TrackClicks from '@/components/TrackClicks';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  applicationName: 'EUJobs',
  title: { default: 'EUJobs — Work with purpose. Connect with Europe.', template: '%s | EUJobs' },
  description:
    'Discover jobs in EU affairs and the events bringing Europe together. Clear information, useful filters and your next opportunity.',
  metadataBase: new URL(process.env.APP_ORIGIN || 'https://eujobs.co'),
  robots: { index: process.env.EUJOBS_SEED !== '1', follow: process.env.EUJOBS_SEED !== '1' },
  openGraph: {
    type: 'website',
    siteName: 'EUJobs',
    title: 'EUJobs — Work with purpose. Connect with Europe.',
    description: 'Jobs, policy events and useful connections across Europe.',
    locale: 'en_GB',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'EUJobs — Work with purpose. Connect with Europe.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EUJobs — Work with purpose. Connect with Europe.',
    description: 'Jobs, policy events and useful connections across Europe.',
    images: ['/opengraph-image'],
  },
  alternates: { types: { 'application/rss+xml': '/feed.xml' } },
};
export const viewport: Viewport = { themeColor: '#153e35', colorScheme: 'light dark' };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="eujobs-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('eujobs-theme')==='dark')document.documentElement.dataset.theme='dark'}catch{}",
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SavedProvider
          key={user?.id || 'guest'}
          authenticated={!!user}
          initialIds={user ? getSavedIds(user.id) : []}
        >
          <Header user={user} />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <Footer />
        </SavedProvider>
        <TrackClicks />
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || process.env.UMAMI_WEBSITE_ID ? (
          <Script
            id="eujobs-analytics"
            strategy="afterInteractive"
            src="/u/script.js"
            data-website-id={process.env.UMAMI_WEBSITE_ID}
            data-domains="eujobs.co"
            data-do-not-track="true"
          />
        ) : null}
      </body>
    </html>
  );
}
