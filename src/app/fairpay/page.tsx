import { pageMetadata } from '@/lib/page-metadata';
import { ResourcePage } from '@/components/ResourceUI';
import FairPayCalculator from '@/components/FairPayCalculator';
export const metadata = pageMetadata(
  'Fair Pay calculator',
  'Compare the earlier EUJobs salary reference bands by sector and seniority.',
  '/fairpay',
);
export default function FairPay() {
  return (
    <ResourcePage
      title="A starting point for your salary conversation."
      eyebrow="FAIR PAY"
      intro="Explore the salary reference bands from the EUJobs archive, by sector and experience."
    >
      <FairPayCalculator />
    </ResourcePage>
  );
}
