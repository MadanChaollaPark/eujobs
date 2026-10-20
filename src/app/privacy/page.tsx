import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { ResourcePage } from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Privacy',
  'Read how EUJobs uses and stores information for accounts, listings, payments, subscriptions and support.',
  '/privacy',
);
export default function Privacy() {
  return (
    <ResourcePage title="Your information on EUJobs." eyebrow="PRIVACY">
      <div className="resource-prose">
        <p>
          EUJobs uses the information you provide to operate your account, listings, saved searches,
          subscriptions and support requests.
        </p>
        <h2>What is stored</h2>
        <p>
          Account records contain your name, email address and a password hash. We store saved
          listings and searches, listing drafts and changes, contact messages, email subscription
          preferences and confirmation records. Your password is never stored as plain text. Public
          listings and directory records are visible to site visitors; account email addresses,
          private drafts and contact messages are not public.
        </p>
        <p>
          You can post a job without an account. We keep your contact email, job details and payment
          references, and use a private link to let you manage that job. Your contact email and
          private management link are not shown on the public listing.
        </p>
        <h2>Payments</h2>
        <p>
          Payments take place on Stripe’s hosted checkout. Stripe receives the payment and billing
          information you enter there. EUJobs stores payment references, the purchased plan, amount,
          currency and fulfillment status; we do not receive or store your full card number.
        </p>
        <h2>Monthly calendar purchases</h2>
        <p>
          Monthly calendar purchases store your contact email, chosen month, event snapshot, payment
          references and private access credentials. Your private purchase link gives access to the
          purchase; its calendar feed URL lets a calendar app retrieve events for the purchased
          month. Anyone with those links can use their associated access, so keep them private.
        </p>
        <p>
          If you explicitly connect Google Calendar, EUJobs stores an encrypted temporary access
          token and the identifiers of the dedicated calendar and events it creates. This enables
          the import and updates you request. The connection requests access to calendars created by
          EUJobs, not your unrelated calendars. You can remove that calendar and revoke the
          connection through your Google account.
        </p>
        <h2>Calendar subscriptions</h2>
        <p>
          Adding a private feed shares its URL and event data with the calendar provider you choose.
          That provider controls its own storage and refresh timing. Calendar purchases use an
          essential cookie limited to the purchase and browser storage to restore interrupted
          checkout and your private link.
        </p>
        <h2>Email</h2>
        <p>
          If you purchase a guest job posting or a monthly calendar, or request account
          verification, password recovery or an email subscription, your email address and message
          content may be processed by our email delivery provider. Job alerts and newsletter
          subscriptions require your confirmation. You can unsubscribe using the link included in
          subscription emails.
        </p>
        <h2>Cookies and preferences</h2>
        <p>
          An essential session cookie keeps you signed in. The site also stores your selected color
          theme in your browser. Saved opportunities and searches are associated with your account.
          Third-party sites linked from EUJobs have their own privacy practices.
        </p>
        <p>
          We measure visits with a self-hosted, cookieless analytics tool (Umami) running on our own
          server. It sets no cookies, stores no IP addresses or personal profiles, respects Do Not
          Track, and records only aggregate page views and anonymous events such as starting a job
          posting checkout. No data is shared with advertising networks.
        </p>
        <p>
          Guest posting uses an essential cookie limited to the job you created. Your browser
          session also keeps your unfinished posting request and private management link so you can
          retry or return after checkout. Keep that link private because it permits changes to the
          job.
        </p>
        <h2>Use and retention</h2>
        <p>
          Records are kept to provide the service, maintain account and payment history, handle
          support and prevent abuse. Payment records may need to be retained for accounting and
          legal obligations. You can contact us about access, correction, deletion, subscription
          preferences or other privacy requests. We will explain any records that must be retained
          when responding.
        </p>
        <h2>Directory information</h2>
        <p>
          Public directories contain information restored from the earlier EUJobs dataset, with
          source links when available. They are not a live representation of registration status.
          Request a correction if information about your organization is inaccurate.
        </p>
        <h2>Contact</h2>
        <p>
          <Link className="text-link" href="/contact">
            Send a privacy request through our contact form.
          </Link>
        </p>
      </div>
    </ResourcePage>
  );
}
