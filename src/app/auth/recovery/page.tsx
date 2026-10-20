import RecoveryForm from '@/components/RecoveryForm';
import { emailAvailable } from '@/lib/email';
export const metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="container auth-shell">
      <RecoveryForm
        token={typeof token === 'string' ? token : undefined}
        available={emailAvailable()}
      />
    </div>
  );
}
