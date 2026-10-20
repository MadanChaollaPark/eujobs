import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { ResourcePage } from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Terms of service',
  'Read the terms for using EUJobs, posting opportunities, purchasing job plans and accessing career resources.',
  '/terms',
);
export default function Terms() {
  return (
    <ResourcePage title="Using EUJobs." eyebrow="TERMS OF SERVICE">
      <div className="resource-prose">
        <h2>The service</h2>
        <p>
          EUJobs provides vacancy listings, events, career resources and organization directories.
          Employers handle applications through the destinations shown on their listings. EUJobs
          does not guarantee an application, interview, hire, attendance or other outcome.
        </p>
        <h2>Accounts and submissions</h2>
        <p>
          Keep account credentials private and submit information you are authorized to publish.
          Listings must describe genuine opportunities accurately, comply with applicable rules and
          avoid misleading, discriminatory or unlawful content. We may reject or close listings that
          do not meet these requirements. Public source links do not establish endorsement by an
          organization.
        </p>
        <h2>Job posting and payment</h2>
        <p>
          The <Link href="/pricing">pricing page</Link> states the amount and placement included in
          each plan. Checkout is a one-time payment for the selected job listing. Payment does not
          bypass the listing review process. Your account shows payment and publication status.
          Changes requiring review may temporarily remove a listing from public search.
        </p>
        <p>
          Renewal requires a separate purchase and is not automatic. Closing a listing does not
          automatically refund a payment. For rejected listings, duplicate payments, cancellations,
          refunds or other billing concerns, <Link href="/contact">contact support</Link> with your
          payment reference. Applicable statutory rights remain unaffected. See our{' '}
          <Link href="/refund">refund policy</Link>.
        </p>
        <h2>Monthly event calendars</h2>
        <p>
          The monthly calendar is a one-time €10 purchase for the calendar month you select at
          checkout. It provides a private calendar feed and a downloadable snapshot of published
          events for that month. There is no automatic renewal. Event listings and individual event
          calendar downloads remain free. The month can include events whose dates have already
          passed.
        </p>
        <p>
          The feed includes changes and additions for the purchased month; the calendar provider
          controls refresh timing. A downloaded or directly imported snapshot does not refresh
          automatically. Event counts and programmes can change. This purchase does not reserve a
          place, register you for an event or include admission. Check each organiser’s current
          instructions before attending.
        </p>
        <p>
          Keep your purchase and feed links private. A refunded purchase no longer provides calendar
          access, but events already imported into a calendar app may need to be removed there. For
          access, duplicate-payment, cancellation or refund questions,{' '}
          <Link href="/contact">contact support</Link> with your purchase reference. Applicable
          statutory rights remain unaffected.
        </p>
        <h2>Resources and external sites</h2>
        <p>
          Career articles and salary reference bands may contain historical information. Check
          current employer requirements, official recruitment notices and source records before
          relying on them. External application, event registration and source sites have their own
          terms.
        </p>
        <h2>Content rights</h2>
        <p>
          Only submit material you have permission to use. By submitting a listing, you authorize
          EUJobs to display it, include it in relevant searches and distribute it through the site’s
          feeds and subscribed alerts while it is published.
        </p>
        <h2>Help and contact</h2>
        <p>
          Use the <Link href="/help">help page</Link> for common workflows or{' '}
          <Link href="/contact">contact EUJobs</Link> about accounts, listings, privacy and billing.
        </p>
      </div>
    </ResourcePage>
  );
}
