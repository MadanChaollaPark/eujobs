import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { ResourcePage } from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Refunds',
  'If EUJobs does not publish your paid job listing, you get a full refund.',
  '/refund',
);
export default function RefundPage() {
  return (
    <ResourcePage title="Full refund if we don’t publish your job." eyebrow="REFUNDS">
      <div className="resource-prose">
        <p>
          A person on our team reviews every job before it goes live, normally within one business
          day. If we decide not to publish your paid listing, you get a full refund of what you
          paid.
        </p>
        <h2>How it works</h2>
        <ul>
          <li>Refunds go back to the card used at checkout, through Stripe.</li>
          <li>
            If your listing is rejected, <Link href="/contact">contact us</Link> with your payment
            reference or the email you used at checkout, and we will arrange the refund.
          </li>
          <li>Free listings (code FIRSTFREE) are never charged, so there is nothing to refund.</li>
        </ul>
        <h2>Other billing questions</h2>
        <p>
          For duplicate payments, cancellations or anything else about a payment, see our{' '}
          <Link href="/terms">terms</Link> or <Link href="/contact">contact us</Link>. Your
          statutory rights are not affected.
        </p>
      </div>
    </ResourcePage>
  );
}
