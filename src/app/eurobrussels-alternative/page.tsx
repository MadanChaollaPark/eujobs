import { pageMetadata } from '@/lib/page-metadata';
import { ResourcePage } from '@/components/ResourceUI';
import CompareTable from '@/components/CompareTable';
import LaunchBanner from '@/components/LaunchBanner';
export const metadata = pageMetadata(
  'An alternative to EuroBrussels for EU-affairs job ads',
  'Looking for an alternative to EuroBrussels? Compare published job ad prices: EUJobs from €99.99, EuroBrussels Standard €990 ex. VAT.',
  '/eurobrussels-alternative',
);
export default function Page() {
  return (
    <ResourcePage
      title={'Looking for an alternative to EuroBrussels?'}
      eyebrow="FOR EMPLOYERS"
      intro={
        'EUJobs reaches the EU-affairs community with one-time job ads from €99.99. Here is how published prices compare.'
      }
    >
      <LaunchBanner />
      <CompareTable highlight="eurobrussels" />
    </ResourcePage>
  );
}
