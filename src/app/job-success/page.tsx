import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import CheckoutStatus from '@/components/CheckoutStatus';
import '@/components/flows.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment status', robots: { index: false, follow: false } };
export default async function JobSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id = '' } = await searchParams;
  if (!(await getCurrentUser()))
    redirect(
      `/auth/login?returnTo=${encodeURIComponent(`/job-success?session_id=${encodeURIComponent(session_id)}`)}`,
    );
  return (
    <div className="container flow-page">
      <div className="submission-shell">
        <CheckoutStatus sessionId={session_id} />
      </div>
    </div>
  );
}
