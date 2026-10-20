import { pageMetadata } from '@/lib/page-metadata';
import { ResourcePage } from '@/components/ResourceUI';
import CompareTable from '@/components/CompareTable';
import LaunchBanner from '@/components/LaunchBanner';
export const metadata = pageMetadata(
  'An alternative to Jobs in Brussels for EU-affairs job ads',
  'Looking for an alternative to jobsin.brussels? Post your EU-affairs vacancy on EUJobs from €99.99, with no account required.',
  '/jobsin-brussels-alternative',
);
export default function Page() {
  return (
    <ResourcePage
      title={'Looking for an alternative to Jobs in Brussels?'}
      eyebrow="FOR EMPLOYERS"
      intro={
        'EUJobs is a job board for the EU-affairs community. Post a vacancy from €99.99, reviewed by a person within one business day.'
      }
    >
      <LaunchBanner />
      <CompareTable highlight="jobsin" />
    </ResourcePage>
  );
}
