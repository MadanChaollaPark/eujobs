import { notFound } from 'next/navigation';
import GuestJobManager from '@/components/GuestJobManager';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Manage your job',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};

export default async function ManageJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string; checkout?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  return (
    <div className="container flow-page">
      <div className="submission-shell">
        <GuestJobManager
          id={id}
          sessionId={query.session_id}
          cancelled={query.checkout === 'cancelled'}
        />
      </div>
    </div>
  );
}
