import Link from 'next/link';
import { pageMetadata } from '@/lib/page-metadata';
import { allPublicListings, companies } from '@/lib/resources';
import { JOB_PLANS, formatJobPrice } from '@/lib/plans';
import LaunchBanner from '@/components/LaunchBanner';
import JobLinkRequest from '@/components/JobLinkRequest';
import TrackView from '@/components/TrackView';
import '@/components/flows.css';
import '@/components/billing.css';
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata(
  'Hiring in Brussels? Post an EU-affairs job',
  'Post your EU-affairs vacancy on EUJobs from €99.99: one-time payment, no account, reviewed by a person within one business day.',
  '/employers',
);
export default function EmployersPage() {
  const orgs = companies().length;
  const live = allPublicListings('job').length;
  return (
    <div className="container flow-page">
      <TrackView name="post_job_view" page="employers" />
      <LaunchBanner />
      <p className="eyebrow">FOR EMPLOYERS</p>
      <h1 className="page-title">Hiring in Brussels?</h1>
      <p className="muted">
        Reach people looking for work in EU policy, public affairs, NGOs, associations and the
        institutions. One-time payment, no account required.
      </p>
      <div className="pricing-grid">
        <article className="flow-card">
          <h2>{live}</h2>
          <p className="muted">jobs live on EUJobs right now</p>
        </article>
        <article className="flow-card">
          <h2>{orgs}</h2>
          <p className="muted">organisations with jobs listed on EUJobs</p>
        </article>
      </div>
      <h2 className="flow-heading">Plans</h2>
      <div className="pricing-grid">
        {Object.entries(JOB_PLANS).map(([id, plan]) => (
          <article className="flow-card pricing-card" key={id}>
            <p className="eyebrow">{plan.name}</p>
            <h2>{formatJobPrice(plan.amount)}</h2>
            <p className="muted">One job · one-time payment · invoice provided</p>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link className="button" href={`/submit?kind=job&plan=${id}`}>
              Create your job →
            </Link>
          </article>
        ))}
      </div>
      <JobLinkRequest source="pricing" />
      <section className="flow-card" style={{ marginTop: 24 }}>
        <h2 className="flow-heading">Questions from employers</h2>
        <h3>How quickly is my job published?</h3>
        <p>
          A person reviews every job, normally within one business day. Your 30 days start after
          approval.
        </p>
        <h3>Do I get an invoice?</h3>
        <p>
          Yes. Every payment comes with an invoice, and you can add your billing address and tax ID
          at checkout.
        </p>
        <h3>Do you offer NGO pricing?</h3>
        <p>
          Yes. Charitable NGOs can <Link href="/contact">contact us</Link> for 40% off any plan.
        </p>
        <h3>Can I get a quote or register you as a supplier first?</h3>
        <p>
          Yes. <Link href="/contact">Get in touch</Link> and we will send a written quote or
          supplier details before you pay.
        </p>
        <h3>How do you compare with other Brussels job boards?</h3>
        <p>
          See our <Link href="/compare">side-by-side price comparison</Link>, based on each
          board&rsquo;s published prices.
        </p>
      </section>
    </div>
  );
}
