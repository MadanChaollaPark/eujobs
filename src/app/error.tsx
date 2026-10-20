'use client';
import Link from 'next/link';
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <div className="container" style={{ paddingTop: 70, paddingBottom: 70 }}>
      <div className="empty-state">
        <h1>We couldn’t load this page.</h1>
        <p>Please try again in a moment. You can also return to the homepage.</p>
        <button className="button" onClick={retry}>
          Try again
        </button>
        <p style={{ marginTop: 20, marginBottom: 0 }}>
          <Link className="text-link" href="/">
            Return to EUJobs
          </Link>
        </p>
      </div>
    </div>
  );
}
