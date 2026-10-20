import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import SubmissionForm from '@/components/SubmissionForm';
import TrackView from '@/components/TrackView';
import JobLinkRequest from '@/components/JobLinkRequest';
import LaunchBanner from '@/components/LaunchBanner';
import { isJobPlan } from '@/lib/plans';
import { firstFreeActive, launchOfferActive } from '@/lib/offers';
export const dynamic = 'force-dynamic';
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}): Promise<Metadata> {
  const kind = (await searchParams).kind;
  return {
    title: kind === 'event' ? 'Share an event' : 'Post a job',
    description:
      kind === 'event'
        ? 'Share a policy event with Europe’s EU-affairs community. Events are free to submit; sign in first.'
        : 'Post an EU-affairs job on EUJobs: policy, NGO, association, consultancy and think-tank roles. No subscription, invoice provided, reviewed by a person before it goes live.',
    robots: { index: false, follow: false },
  };
}
export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const kind = params.kind === 'event' ? 'event' : 'job';
  const defaultPlan = isJobPlan(params.plan) ? params.plan : 'basic';
  const user = await getCurrentUser();
  if (kind === 'event' && !user)
    redirect(`/auth/login?returnTo=${encodeURIComponent(`/submit?kind=${kind}`)}`);
  return (
    <div className="container flow-page">
      <div className="submission-shell">
        <div className="submission-header">
          <p className="eyebrow">GOOD OPPORTUNITIES DESERVE GOOD PEOPLE</p>
          <h1 className="page-title">
            {kind === 'job' ? 'Find your next colleague.' : 'Share what’s next.'}
          </h1>
          <p className="muted">
            {kind === 'job'
              ? `${firstFreeActive() ? 'Your first listing is free. ' : ''}${launchOfferActive() ? 'Pro is €149 until 31 October. ' : ''}${firstFreeActive() || launchOfferActive() ? 'Offer codes are applied for you at checkout. ' : 'Choose a plan and pay securely through Stripe. '}No account required.`
              : 'A thoughtful conversation, a room worth being in. Share it with Europe’s policy community.'}
          </p>
        </div>
        {kind === 'job' && <TrackView name="post_job_view" page="submit" />}
        {kind === 'job' && <LaunchBanner />}
        <SubmissionForm
          defaultKind={kind}
          guest={!user && kind === 'job'}
          defaultPlan={defaultPlan}
        />
        {kind === 'job' && <JobLinkRequest source="submit" />}
      </div>
    </div>
  );
}
