import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: 70, paddingBottom: 70 }}>
      <div className="empty-state">
        <p className="eyebrow">404 · NOT FOUND</p>
        <h1>We couldn’t find this page.</h1>
        <p>It may be unavailable, unpublished, or the address may have changed.</p>
        <Link className="button" href="/jobs">
          Explore current opportunities
        </Link>
        <p style={{ marginTop: 20, marginBottom: 0 }}>
          <Link className="text-link" href="/">
            Return to EUJobs
          </Link>
        </p>
      </div>
    </div>
  );
}
