import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { ResourcePage } from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Help',
  'Find answers about posting jobs, payments, saved opportunities, events and managing your EUJobs account.',
  '/help',
);
export default function Help() {
  return (
    <ResourcePage title="A little help along the way." eyebrow="HELP">
      <div className="resource-prose">
        <h2>How do I post a job?</h2>
        <p>
          <Link href="/submit?kind=job&plan=basic">Enter your job details</Link>, add a private
          billing contact email, select a plan and continue to secure Stripe checkout. No account is
          required. Keep your private management link to edit the job and check payment and review
          status. View the <Link href="/pricing">plans and prices</Link> before purchasing.
        </p>
        <h2>Can I change or close a listing?</h2>
        <p>
          Open the private management link saved when you posted your job. If you posted while
          signed in, open <Link href="/account">your account</Link> and select your submission. You
          can edit or close your listing. Editing a published listing sends the changes through
          review again. An expired listing can be renewed through a new checkout.
        </p>
        <h2>How do I receive job alerts?</h2>
        <p>
          Set your filters on the <Link href="/alerts">alerts page</Link>, choose a frequency and
          confirm the email you receive. Each digest includes an unsubscribe link. Saved searches in
          your account can also be checked whenever you visit.
        </p>
        <h2>How do I apply?</h2>
        <p>
          Use the application link on a published job. The employer manages the application process
          on its own site. EUJobs does not store a CV or submit an application on your behalf.
        </p>
        <h2>Can I share an event?</h2>
        <p>
          Yes. Events are free to submit; sign in first, then{' '}
          <Link href="/submit?kind=event">submit an event</Link> for review. Visitors can save
          published events and add them to their calendar using the calendar download on the event
          page.
        </p>
        <h2>Can I add a whole month to my calendar?</h2>
        <p>
          On the <Link href="/events#monthly-calendar">events page</Link>, choose a month, check its
          published event count and enter your email. Pay €10 once through Stripe, with no account
          or automatic renewal. Your private purchase page provides a calendar feed and a .ics file.
          Reading events and adding them individually remain free.
        </p>
        <p>
          Subscribe to the private feed in Apple Calendar or Outlook. For Google Calendar, add the
          feed using Other calendars → + → From URL on a computer; it then appears on devices using
          that account. When direct Google connection is available, your purchase page also offers
          an explicit connection step to create a separate EUJobs calendar. Reconnect when requested
          and use Update to copy later changes; direct imports do not refresh automatically.
        </p>
        <p>
          A subscribed feed includes updated and newly published events for your purchased month.
          Your calendar app controls refresh timing. The downloadable file is the snapshot from
          checkout and does not update. Use one method to avoid duplicates. Event registration and
          admission remain separate, and the full month can include dates that have already passed.
        </p>
        <p>
          Keep the purchase and feed links private. You can return using the email we send or the
          browser where you checked out. If a payment is still being confirmed, use Check payment on
          that page before starting again. Remove the separate EUJobs calendar to remove its events
          from your calendar app.
        </p>
        <h2>Payment or account issue?</h2>
        <p>
          <Link href="/contact">Contact support</Link> with your listing title and payment reference
          if applicable. Do not include card details or passwords. If you cannot sign in, use{' '}
          <Link href="/auth/recovery">password recovery</Link>.
        </p>
      </div>
    </ResourcePage>
  );
}
