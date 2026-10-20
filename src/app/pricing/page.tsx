import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import TrackView from '@/components/TrackView';
import LaunchBanner from '@/components/LaunchBanner';
import { firstFreeActive, planOffer } from '@/lib/offers';
import JobLinkRequest from '@/components/JobLinkRequest';
import { JOB_PLANS, formatJobPrice } from '@/lib/plans';
import { CALENDAR_PRICE_CENTS } from '@/lib/monthly-calendar-shared';
import '@/components/flows.css';
import '@/components/billing.css';
export const metadata = pageMetadata(
  'Job posting plans and monthly calendars',
  'Compare EUJobs job posting plans and the one-time monthly event calendar. No subscription or account required.',
  '/pricing',
);
export default function PricingPage() {
  return (
    <div className="container flow-page">
      <LaunchBanner />
      <p className="eyebrow">FIND YOUR NEXT COLLEAGUE</p>
      <h1 className="page-title">
        The right people.
        <br />
        One clear price.
      </h1>
      <TrackView name="post_job_view" page="pricing" />
      <p className="muted">
        Every plan covers one job for 30 days after approval. Pay once, with no subscription. No
        account required. Prices are in euros. An invoice is provided and tax IDs are supported.
      </p>
      <div className="pricing-grid">
        {Object.entries(JOB_PLANS).map(([id, plan]) => (
          <article className="flow-card pricing-card" key={id}>
            <p className="eyebrow">{plan.name}</p>
            {planOffer(id) ? (
              <h2>
                <s className="muted">{formatJobPrice(plan.amount)}</s> {planOffer(id)!.label}
              </h2>
            ) : (
              <h2>{formatJobPrice(plan.amount)}</h2>
            )}
            {planOffer(id) && <p className="field-help">{planOffer(id)!.note}</p>}
            <p className="muted">One job · one-time payment · invoice provided</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link
              className={id === 'recruiter' ? 'button secondary' : 'button'}
              href={`/submit?kind=job&plan=${id}`}
            >
              {id === 'basic' && planOffer(id)
                ? 'Post your first job free →'
                : planOffer(id)
                  ? `Post a job for ${planOffer(id)!.label} →`
                  : 'Create your job →'}
            </Link>
          </article>
        ))}
      </div>
      <div className="flow-card">
        <h2 className="flow-heading">A simple path to publication.</h2>
        <ol>
          <li>
            Enter your job details and a private billing contact email, or just paste your job link.
          </li>
          <li>
            Choose a plan and pay securely through Stripe. Offer codes are applied for you. Billing
            addresses, tax IDs, and invoices are supported.
          </li>
          <li>
            Our team reviews your submission. Your 30 days start after approval. If we don&rsquo;t
            publish it, you get a <Link href="/refund">full refund</Link>.
          </li>
        </ol>
        <p>
          Keep your private management link to edit the job and check payment and review status. If
          you are signed in, your job is available in your account.
        </p>
        <p>
          Application deadlines can end a listing earlier. Editing a published job sends it back for
          review and preserves its original expiry. Renewals are a new one-time purchase.
        </p>
        <p>
          Community events are free to submit; sign in first.{' '}
          <Link href="/submit?kind=event">Share an event →</Link>
        </p>
      </div>
      <JobLinkRequest source="pricing" />
      <p className="field-help">
        Prefer email? Send us the job link at{' '}
        <a href="mailto:eujobs@mail.grokbot.com">eujobs@mail.grokbot.com</a>.
      </p>
      <section className="flow-card" style={{ marginTop: 24 }} aria-labelledby="pricing-faq-title">
        <p className="eyebrow">QUESTIONS FROM EMPLOYERS</p>
        <h2 id="pricing-faq-title" className="flow-heading">
          Invoices, quotes and review.
        </h2>
        {firstFreeActive() && (
          <>
            <h3>Is my first listing free?</h3>
            <p>
              Yes. Your first job is free for 30 days: choose the Basic plan and code{' '}
              <code>FIRSTFREE</code> is applied for you on the Stripe page, so the total is €0 (no
              card is charged). It applies once per new customer and can be used until 30 November
              2026. Like every listing, it goes live after editorial review.
            </p>
          </>
        )}
        <h3>Do I receive an invoice? Can I add our tax ID?</h3>
        <p>
          Yes. Every payment comes with an invoice, and you can enter your organisation&rsquo;s
          billing address and VAT or tax ID at checkout. The price shown is the amount charged. EU
          institutions with specific invoicing requirements can{' '}
          <Link href="/contact">contact us</Link> before paying.
        </p>
        <h3>Do you support supplier onboarding or purchase orders?</h3>
        <p>
          Yes. If your finance team needs us registered as a supplier, or a purchase order reference
          on the invoice, <Link href="/contact">get in touch</Link> and we will provide the details
          before you pay.
        </p>
        <h3>Can I get a formal quote first?</h3>
        <p>
          Yes. <Link href="/contact">Ask for a quote</Link> for one job or several, and we will send
          it in writing.
        </p>
        <h3>How quickly is my job published?</h3>
        <p>
          A person on our team reviews every job, normally within one business day of submission.
          Your 30 days start after approval.
        </p>
        <h3>Do you offer NGO pricing?</h3>
        <p>
          Yes. Charitable NGOs can <Link href="/contact">contact us</Link> for 40% off any plan.
        </p>
      </section>
      <section
        className="flow-card"
        style={{ marginTop: 24 }}
        aria-labelledby="calendar-price-title"
      >
        <p className="eyebrow">FOR YOUR OWN CALENDAR</p>
        <h2 id="calendar-price-title" className="flow-heading">
          A month of events · {formatJobPrice(CALENDAR_PRICE_CENTS)}
        </h2>
        <p>
          Pay once to add all published EUJobs events for one selected calendar month together. The
          events page shows the month and current event count before checkout. No account or
          automatic renewal.
        </p>
        <ul>
          <li>
            A private calendar feed for Apple Calendar, Google Calendar and Outlook, including
            changes and additions for your selected month.
          </li>
          <li>A downloadable .ics snapshot of the events saved at checkout.</li>
          <li>
            A private purchase page, sent to your email, with setup instructions and payment
            details.
          </li>
        </ul>
        <p>
          Google Calendar feed setup requires a computer. Your calendar app controls refresh timing.
          The purchase does not include event admission or registration.
        </p>
        <p>
          All events stay freely readable, and adding an individual event to your calendar remains
          free. You are paying for the convenience of adding the month together.
        </p>
        <Link className="button" href="/events#monthly-calendar">
          Choose your month →
        </Link>
      </section>
    </div>
  );
}
