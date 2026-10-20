'use client';

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Service unavailable | EUJobs</title>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body
        style={{
          margin: 0,
          background: '#f7f8f5',
          color: '#182d28',
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <main style={{ maxWidth: 560, margin: '12vh auto', padding: 28, lineHeight: 1.6 }}>
          <p style={{ fontWeight: 700 }}>EUJobs</p>
          <h1 style={{ lineHeight: 1.2 }}>We couldn’t load EUJobs.</h1>
          <p>Please try again in a moment.</p>
          <button
            type="button"
            onClick={retry}
            style={{
              background: '#153e35',
              color: '#fff',
              border: 0,
              borderRadius: 7,
              padding: '14px 22px',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <p>
            <a href="/" style={{ color: '#153e35' }}>
              Return to the homepage
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
