import { notFound } from 'next/navigation';
import CalendarPurchaseManager from '@/components/CalendarPurchaseManager';
import { googleCalendarConfigured } from '@/lib/google-calendar';
import '@/components/monthly-calendar.css';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Your monthly calendar',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};

export default async function CalendarPurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string; checkout?: string; google?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) notFound();
  return (
    <div className="container calendar-purchase-page">
      <CalendarPurchaseManager
        id={id}
        sessionId={typeof query.session_id === 'string' ? query.session_id : undefined}
        cancelled={query.checkout === 'cancelled'}
        googleAvailable={googleCalendarConfigured()}
        googleResult={
          query.google === 'connected' || query.google === 'error' ? query.google : undefined
        }
      />
    </div>
  );
}
