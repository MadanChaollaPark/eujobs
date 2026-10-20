import SeoLandingPage, { seoLandingMetadata } from '@/components/SeoLandingPage';
export const dynamic = 'force-dynamic';
export const generateMetadata = async () => seoLandingMetadata('eu-consultancy-jobs');
export default function Page() {
  return <SeoLandingPage slug="eu-consultancy-jobs" />;
}
