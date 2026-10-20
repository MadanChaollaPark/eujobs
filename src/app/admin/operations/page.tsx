import { emailAvailable, emailQueueSummary } from '@/lib/email';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/store';
import '@/components/flows.css';

export const dynamic = 'force-dynamic';
export default async function OperationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login?returnTo=%2Fadmin%2Foperations');
  if (user.role !== 'admin') redirect('/account');
  const db = getDb();
  const counts = db
    .prepare('SELECT kind,status,COUNT(*) AS count FROM listings GROUP BY kind,status')
    .all();
  return (
    <div className="container flow-page">
      <div className="flow-card">
        <p className="eyebrow">ADMINISTRATION</p>
        <h1>Operations</h1>
        <p>
          Database connected. Release: <code>{process.env.RELEASE_SHA || 'development'}</code>
        </p>
        <h2>Integrations</h2>
        <ul>
          <li>
            Stripe checkout: {process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured'}
          </li>
          <li>
            Stripe signed webhooks:{' '}
            {process.env.STRIPE_WEBHOOK_SECRET ? 'Configured' : 'Not configured'}
          </li>
          <li>Email delivery: {emailAvailable() ? 'Enabled' : 'Disabled'}</li>
          <li>Automatic imports: disabled</li>
        </ul>
        <h2>Email queue</h2>
        <pre>{JSON.stringify(emailQueueSummary(), null, 2)}</pre>
        <h2>Inventory</h2>
        {counts.length ? (
          <ul>
            {counts.map((r, i) => (
              <li key={i}>
                {String(r.kind)} / {String(r.status)}: {Number(r.count)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No listings have been added.</p>
        )}
        <p>
          <Link href="/account">Review submissions and contact messages →</Link>
        </p>
        <p>
          <a href="/api/health/operations">Operational status JSON</a>
        </p>
      </div>
    </div>
  );
}
