import Link from 'next/link';
import { LAUNCH_ENDS_AT, firstFreeActive, launchOfferActive } from '@/lib/offers';
export { LAUNCH_ENDS_AT };
export default function LaunchBanner() {
  const launch = launchOfferActive(),
    free = firstFreeActive();
  if (!launch && !free) return null;
  return (
    <aside className="launch-banner" role="note">
      {free && (
        <>
          <strong>First listing free:</strong> publish your first job for 30 days (Basic plan, new
          customers, until 30 November). Code <code>FIRSTFREE</code> is applied for you at
          checkout.{' '}
        </>
      )}
      {launch && (
        <>
          <strong>Launch offer:</strong> Pro job posting for <strong>€149</strong> instead of
          €299.99 until 31 October (code <code>LAUNCH149</code>, applied automatically).{' '}
        </>
      )}
      <Link href={free ? '/submit?kind=job&plan=basic' : '/submit?kind=job'}>
        {free ? 'Post your first job free →' : 'Post a job →'}
      </Link>
    </aside>
  );
}
