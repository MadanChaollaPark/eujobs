import EmailTokenAction from '@/components/EmailTokenAction';
export const metadata = {
  title: 'Confirm subscription',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="container auth-shell">
      <EmailTokenAction action="confirm" token={typeof token === 'string' ? token : ''} />
    </div>
  );
}
