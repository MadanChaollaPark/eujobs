import { pageMetadata } from '@/lib/page-metadata';
import { ResourcePage } from '@/components/ResourceUI';
import CompareTable from '@/components/CompareTable';
import LaunchBanner from '@/components/LaunchBanner';
export const metadata = pageMetadata(
  'Compare EU-affairs job boards in Brussels',
  'Compare job ad prices on EUJobs, EuroBrussels, BrusselsJobs and Jobs in Brussels, using the prices each site publishes.',
  '/compare',
);
export default function Page() {
  return (
    <ResourcePage
      title={'Compare EU-affairs job boards'}
      eyebrow="FOR EMPLOYERS"
      intro={
        'Published job ad prices for the main Brussels and EU-affairs job boards, side by side.'
      }
    >
      <LaunchBanner />
      <CompareTable />
    </ResourcePage>
  );
}
